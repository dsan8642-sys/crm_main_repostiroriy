"""Module 5.10: import clients from .xlsx/.csv — parse, map, preview, commit, rollback."""
import csv
import io
from dataclasses import dataclass, field
from datetime import date

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone

from accounts.models import ParentAccount, User
from audit.models import audit
from catalog.models import Group, SubscriptionType
from students.models import Student
from subscriptions.models import allow_subscription_history_delete
from subscriptions.services import create_subscription

from .models import ImportBatch, ImportBatchStatus, ImportKind

CANONICAL_FIELDS = ("first_name", "last_name", "name", "phone", "email", "group", "subscription")
MAX_IMPORT_BYTES = 5 * 1024 * 1024
MAX_IMPORT_ROWS = 5000
MAX_IMPORT_COLUMNS = 50

NEW, DUPLICATE, ERROR = "new", "duplicate", "error"


@dataclass
class PreviewRow:
    index: int
    data: dict
    status: str = NEW
    errors: list = field(default_factory=list)


def _decode_csv(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp1250", "iso-8859-2", "utf-8"):  # PL-friendly fallbacks
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def parse_source(raw: bytes, filename: str):
    """Return (headers, list_of_row_dicts) from .xlsx or .csv bytes."""
    if len(raw) > MAX_IMPORT_BYTES:
        raise ValidationError("Файл импорта превышает лимит 5 МБ")
    if filename.lower().endswith((".xlsx", ".xlsm")):
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        ws = wb.active
        row_iterator = ws.iter_rows(values_only=True)
        try:
            header_row = next(row_iterator)
        except StopIteration:
            return [], []
        if len(header_row) > MAX_IMPORT_COLUMNS:
            raise ValidationError("Файл импорта превышает лимит 50 столбцов")
        headers = [str(h).strip() if h is not None else "" for h in header_row]
        out = []
        for row in row_iterator:
            if any(value is not None for value in row):
                out.append(dict(zip(headers, [("" if value is None else str(value).strip()) for value in row])))
                if len(out) > MAX_IMPORT_ROWS:
                    raise ValidationError("Файл импорта превышает лимит 5 000 строк")
        return headers, out
    text = _decode_csv(raw)
    sample = text[:2048]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,\t")
    except csv.Error:
        dialect = csv.excel
        dialect.delimiter = ";"
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    headers = [h.strip() for h in (reader.fieldnames or [])]
    if len(headers) > MAX_IMPORT_COLUMNS:
        raise ValidationError("Файл импорта превышает лимит 50 столбцов")
    rows = []
    for row in reader:
        rows.append({(key or "").strip(): (value or "").strip() for key, value in row.items()})
        if len(rows) > MAX_IMPORT_ROWS:
            raise ValidationError("Файл импорта превышает лимит 5 000 строк")
    return headers, rows


def _apply_mapping(row: dict, mapping: dict) -> dict:
    """mapping: {source_header: canonical_field}. Splits `name` into first/last."""
    data = {}
    for src, canon in mapping.items():
        data[canon] = row.get(src, "").strip()
    if data.get("name") and not (data.get("first_name") or data.get("last_name")):
        parts = data["name"].split(maxsplit=1)
        data["last_name"] = parts[0]
        data["first_name"] = parts[1] if len(parts) > 1 else ""
    return data


def _dedup_key(data):
    if data.get("email"):
        return ("email", data["email"].lower())
    return ("name_phone", data.get("last_name", "").lower(),
            data.get("first_name", "").lower(), data.get("phone", ""))


def preview(headers, rows, mapping):
    """Validate + classify each row (new / duplicate / error). No DB writes."""
    seen = set()
    existing_emails = set(e.lower() for e in
                          Student.objects.exclude(email="").values_list("email", flat=True))
    result = []
    for i, row in enumerate(rows, start=2):  # row 1 = header
        data = _apply_mapping(row, mapping)
        pr = PreviewRow(index=i, data=data)
        if not data.get("last_name") and not data.get("first_name"):
            pr.status = ERROR
            pr.errors.append("Отсутствует имя/фамилия")
        if data.get("email"):
            try:
                validate_email(data["email"])
            except ValidationError:
                pr.status = ERROR
                pr.errors.append("Некорректный email")
        key = _dedup_key(data)
        is_dup = (data.get("email", "").lower() in existing_emails) or (key in seen)
        if pr.status != ERROR and is_dup:
            pr.status = DUPLICATE
            pr.errors.append("Дубликат (email/ФИО+телефон уже есть)")
        seen.add(key)
        result.append(pr)
    return result


@transaction.atomic
def commit(preview_rows, *, actor=None, source_name="", create_missing_groups=True,
           create_subscriptions=True, batch=None):
    """Apply NEW rows atomically. ERROR/DUPLICATE rows are skipped.
    Records an ImportBatch so the whole import can be rolled back later."""
    if batch is None:
        batch = ImportBatch(
            created_by=actor,
            source_name=source_name,
            kind=ImportKind.CLIENTS,
            status=ImportBatchStatus.COMMITTED,
            committed_at=timezone.now(),
            rows_total=len(preview_rows),
        )
    else:
        batch.created_by = actor
        batch.source_name = source_name or batch.source_name
    created_students, created_groups, created_parents, created_subscriptions = [], [], [], []
    group_cache = {}

    for pr in preview_rows:
        if pr.status != NEW:
            continue
        d = pr.data
        group = None
        gname = d.get("group", "").strip()
        if gname:
            if gname in group_cache:
                group = group_cache[gname]
            else:
                group = Group.objects.filter(name=gname).first()
                if group is None:
                    if not create_missing_groups:
                        raise ValidationError(f"Группа не найдена: {gname}")
                    group = Group.objects.create(name=gname)
                    created_groups.append(group.id)
                group_cache[gname] = group

        # Family = ParentAccount keyed by phone (DECISIONS.md #3): siblings sharing
        # one phone join the same family instead of spawning duplicate accounts.
        phone = d.get("phone", "").strip()
        parent = ParentAccount.objects.filter(phone=phone).first() if phone else None
        if parent is None:
            base = (d.get("email") or phone or
                    f'{d.get("last_name","")}{d.get("first_name","")}').strip() or "client"
            username = f"imp_{base}"[:150]
            n = 1
            while User.objects.filter(username=username).exists():
                n += 1
                username = f"imp_{base}_{n}"[:150]
            puser = User.objects.create_user(
                username=username, role="parent",
                first_name=d.get("first_name", ""), last_name=d.get("last_name", ""),
                email=d.get("email", ""))
            # Imported clients keep their domain identity and history, but portal
            # access is enabled only through the one-time activation flow.
            puser.set_unusable_password()
            puser.save(update_fields=["password"])
            parent = ParentAccount.objects.create(user=puser, phone=phone,
                                                  email=d.get("email", ""))
            created_parents.append(parent.id)

        student = Student.objects.create(
            parent=parent, group=group,
            first_name=d.get("first_name", ""), last_name=d.get("last_name", ""),
            email=d.get("email", ""))
        created_students.append(student.id)
        audit(actor, "client.created", student, {"source": "import"})

        stype_name = d.get("subscription", "").strip()
        if create_subscriptions and stype_name:
            stype = SubscriptionType.objects.filter(name=stype_name).first()
            if stype:
                subscription = create_subscription(student=student, subscription_type=stype,
                                                   start_date=date.today(), created_by=actor)
                created_subscriptions.append(subscription.id)

    batch.created_student_ids = created_students
    batch.created_group_ids = created_groups
    batch.created_parent_ids = created_parents
    batch.created_subscription_ids = created_subscriptions
    batch.rows_imported = len(created_students)
    batch.status = ImportBatchStatus.COMMITTED
    batch.committed_at = timezone.now()
    batch.input_data = {}
    batch.preview_expires_at = None
    batch.result = {
        "rows_total": batch.rows_total,
        "rows_imported": batch.rows_imported,
    }
    batch.save()
    return batch


def rollback_preview(batch: ImportBatch):
    """Return blockers without changing data; a rollback may never delete later work."""
    student_ids = list(batch.created_student_ids or [])
    known_subscription_ids = set(batch.created_subscription_ids or [])
    blockers = []
    for student in Student.objects.filter(id__in=student_ids):
        counts = {
            "attendance": student.attendance.count(),
            "payments": student.payments.count(),
            "charges": student.charges.count(),
            "session_participations": student.session_participations.count(),
            "waitlist_entries": student.waitlist_entries.count(),
            "later_subscriptions": student.subscriptions.exclude(id__in=known_subscription_ids).count(),
        }
        active = {key: value for key, value in counts.items() if value}
        if active:
            blockers.append({"student_id": student.id, "student": student.full_name, "dependencies": active})
    return {
        "batch_id": batch.id,
        "can_rollback": not blockers and not batch.is_rolled_back,
        "blockers": blockers,
        "will_delete": {
            "students": len(student_ids),
            "parents": len(batch.created_parent_ids or []),
            "groups": len(batch.created_group_ids or []),
            "subscriptions": len(batch.created_subscription_ids or []),
        },
    }


@transaction.atomic
def rollback(batch: ImportBatch):
    """Undo a committed import only if no later operational/financial data exists."""
    if batch.is_rolled_back:
        raise ValidationError("Импорт уже откачен")
    preview = rollback_preview(batch)
    if preview["blockers"]:
        raise ValidationError("Откат заблокирован: импортированные клиенты уже получили новые данные")
    # Delete created students explicitly (some may hang off a reused family parent
    # that must survive), then drop the parents this batch created (cascades users).
    with allow_subscription_history_delete():
        Student.objects.filter(id__in=batch.created_student_ids).delete()
    user_ids = list(ParentAccount.objects.filter(id__in=batch.created_parent_ids)
                    .values_list("user_id", flat=True))
    User.objects.filter(id__in=user_ids).delete()
    Group.objects.filter(id__in=batch.created_group_ids, students__isnull=True).delete()
    batch.is_rolled_back = True
    batch.status = ImportBatchStatus.ROLLED_BACK
    batch.save(update_fields=["is_rolled_back", "status"])
    return batch
