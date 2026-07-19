"""Module 5.10: import clients from .xlsx/.csv — parse, map, preview, commit, rollback."""
import csv
import io
from dataclasses import dataclass, field
from datetime import date

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction

from accounts.models import ParentAccount, User
from audit.models import audit
from catalog.models import Group, SubscriptionType
from students.models import Student
from subscriptions.models import allow_subscription_history_delete
from subscriptions.services import create_subscription

from .models import ImportBatch

CANONICAL_FIELDS = ("first_name", "last_name", "name", "phone", "email", "group", "subscription")

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
    if filename.lower().endswith((".xlsx", ".xlsm")):
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return [], []
        headers = [str(h).strip() if h is not None else "" for h in rows[0]]
        out = [dict(zip(headers, [("" if v is None else str(v).strip()) for v in r]))
               for r in rows[1:] if any(v is not None for v in r)]
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
    rows = [{(k or "").strip(): (v or "").strip() for k, v in row.items()} for row in reader]
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
           create_subscriptions=True):
    """Apply NEW rows atomically. ERROR/DUPLICATE rows are skipped.
    Records an ImportBatch so the whole import can be rolled back later."""
    batch = ImportBatch(created_by=actor, source_name=source_name,
                        rows_total=len(preview_rows))
    created_students, created_groups, created_parents = [], [], []
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
                create_subscription(student=student, subscription_type=stype,
                                    start_date=date.today(), created_by=actor)

    batch.created_student_ids = created_students
    batch.created_group_ids = created_groups
    batch.created_parent_ids = created_parents
    batch.rows_imported = len(created_students)
    batch.save()
    return batch


@transaction.atomic
def rollback(batch: ImportBatch):
    """Undo a committed import: delete created students, parents and groups."""
    if batch.is_rolled_back:
        raise ValidationError("Импорт уже откачен")
    # Delete created students explicitly (some may hang off a reused family parent
    # that must survive), then drop the parents this batch created (cascades users).
    with allow_subscription_history_delete():
        Student.objects.filter(id__in=batch.created_student_ids).delete()
    user_ids = list(ParentAccount.objects.filter(id__in=batch.created_parent_ids)
                    .values_list("user_id", flat=True))
    User.objects.filter(id__in=user_ids).delete()
    Group.objects.filter(id__in=batch.created_group_ids, students__isnull=True).delete()
    batch.is_rolled_back = True
    batch.save(update_fields=["is_rolled_back"])
    return batch
