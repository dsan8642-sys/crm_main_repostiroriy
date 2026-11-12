"""Module 5.10: import clients from .xlsx/.csv — parse, map, preview, commit, rollback."""
import csv
import io
from zipfile import BadZipFile
from dataclasses import dataclass, field
from datetime import date

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone

from accounts.models import ParentAccount, User
from accounts.social import normalize_instagram_username
from audit.models import audit
from catalog.models import Group, SubscriptionType
from students.models import ParticipantNote, Student
from students.services import set_student_groups
from subscriptions.models import allow_subscription_history_delete
from subscriptions.services import create_subscription

from .contracts import prepare_rows
from .models import ImportBatch, ImportBatchStatus, ImportKind

CANONICAL_FIELDS = ("first_name", "last_name", "name", "phone", "email", "group", "subscription")
MAX_IMPORT_BYTES = 5 * 1024 * 1024
MAX_IMPORT_ROWS = 5000
MAX_IMPORT_COLUMNS = 50

NEW, UPDATE, DUPLICATE, SKIPPED, ERROR = "new", "update", "duplicate", "skipped", "error"
IMPORT_MODES = {"create_only", "update_existing", "upsert"}


def _split_group_cell(value):
    return [part.strip() for part in str(value or "").split(";") if part.strip()]


def _resolve_groups(data, *, create_missing=False, allow_missing_names=False):
    plural_present = bool(str(data.get("group_ids") or "").strip() or
                          str(data.get("group_names") or "").strip())
    ids = _split_group_cell(data.get("group_ids"))
    names = _split_group_cell(data.get("group_names"))
    legacy_id = str(data.get("group_id") or "").strip()
    legacy_name = str(data.get("group_name") or data.get("group") or "").strip()

    if plural_present and (legacy_id or legacy_name):
        if len(ids or names) != 1:
            raise ValidationError("Одиночная и множественная группы противоречат друг другу")
        if legacy_id and ids and legacy_id != ids[0]:
            raise ValidationError("group_id не совпадает с group_ids")
        if legacy_name and names and legacy_name.casefold() != names[0].casefold():
            raise ValidationError("group_name не совпадает с group_names")
    if not plural_present:
        ids = [legacy_id] if legacy_id else []
        names = [legacy_name] if legacy_name else []
    if ids and names and len(ids) != len(names):
        raise ValidationError("Количество group_ids и group_names должно совпадать")
    if len(ids or names) > 3:
        raise ValidationError("Участник может состоять максимум в трёх группах")
    if len(set(ids)) != len(ids) or len({name.casefold() for name in names}) != len(names):
        raise ValidationError("Одна группа указана несколько раз")

    groups = []
    created_ids = []
    length = max(len(ids), len(names))
    for index in range(length):
        group = None
        if index < len(ids):
            try:
                group = Group.objects.filter(pk=int(ids[index])).first()
            except (TypeError, ValueError) as exc:
                raise ValidationError("Некорректный Group internal ID") from exc
            if group is None:
                raise ValidationError(f"Группа с ID {ids[index]} не найдена")
        if index < len(names):
            name = names[index]
            if group is not None and group.name.casefold() != name.casefold():
                raise ValidationError(f"ID и название группы не совпадают: {ids[index]} / {name}")
            if group is None:
                group = Group.objects.filter(name__iexact=name).first()
                if group is None and create_missing:
                    group = Group.objects.create(name=name)
                    created_ids.append(group.id)
                elif group is None and not allow_missing_names:
                    raise ValidationError(f"Группа не найдена: {name}")
        if group is not None and group.id not in {item.id for item in groups}:
            groups.append(group)
    return groups, created_ids


@dataclass
class PreviewRow:
    index: int
    data: dict
    status: str = NEW
    errors: list = field(default_factory=list)
    warnings: list = field(default_factory=list)
    resolved: dict = field(default_factory=dict)


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
    lower_name = filename.lower()
    if not lower_name.endswith((".xlsx", ".xlsm", ".csv")):
        raise ValidationError("Поддерживаются только CSV, XLSX и XLSM")
    if lower_name.endswith((".xlsx", ".xlsm")):
        from openpyxl import load_workbook
        from openpyxl.utils.exceptions import InvalidFileException
        try:
            wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=False)
        except (BadZipFile, InvalidFileException, OSError, ValueError) as exc:
            raise ValidationError("Повреждённый или неподдерживаемый XLSX-файл") from exc
        ws = wb.active
        row_iterator = ws.iter_rows()
        try:
            header_cells = next(row_iterator)
        except StopIteration:
            return [], []
        if any(cell.data_type == "f" for cell in header_cells):
            raise ValidationError("Формулы в import-файле запрещены")
        header_row = [cell.value for cell in header_cells]
        if len(header_row) > MAX_IMPORT_COLUMNS:
            raise ValidationError("Файл импорта превышает лимит 50 столбцов")
        headers = [str(h).strip() if h is not None else "" for h in header_row]
        out = []
        for cells in row_iterator:
            if any(cell.data_type == "f" for cell in cells):
                raise ValidationError("Формулы в import-файле запрещены")
            row = [cell.value for cell in cells]
            if any(value is not None for value in row):
                out.append(dict(zip(headers, [("" if value is None else str(value).strip()) for value in row])))
                if len(out) > MAX_IMPORT_ROWS:
                    raise ValidationError("Файл импорта превышает лимит 5 000 строк")
        return headers, out
    text = _decode_csv(raw)
    sample = text[:2048]
    first_line = sample.splitlines()[0] if sample.splitlines() else ""
    if ";" in first_line:
        delimiter = ";"
    elif "\t" in first_line:
        delimiter = "\t"
    else:
        try:
            delimiter = csv.Sniffer().sniff(sample, delimiters=",").delimiter
        except csv.Error:
            delimiter = ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
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
            data.get("first_name", "").lower(),
            data.get("parent_phone") or data.get("phone", ""))


def preview(headers, rows, mapping, mode="create_only"):
    """Validate + classify each row (new / duplicate / error). No DB writes."""
    if mode not in IMPORT_MODES:
        raise ValidationError("Некорректный режим импорта клиентов")
    rows = prepare_rows("clients", headers, rows, mapping)["rows"]
    seen = set()
    seen_record_ids = set()
    result = []
    for i, row in enumerate(rows, start=2):  # row 1 = header
        data = dict(row)
        if data.get("name") and not (data.get("first_name") or data.get("last_name")):
            parts = str(data["name"]).split(maxsplit=1)
            data["last_name"] = parts[0]
            data["first_name"] = parts[1] if len(parts) > 1 else ""
        pr = PreviewRow(index=i, data=data)
        record_id = str(data.get("record_id") or "").strip()
        if record_id:
            if record_id in seen_record_ids:
                pr.status = ERROR
                pr.errors.append("Повторяющийся Internal ID в файле")
            seen_record_ids.add(record_id)
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
        existing = None
        if data.get("email"):
            existing = Student.objects.filter(email__iexact=data["email"]).first()
        elif data.get("parent_phone") and (data.get("first_name") or data.get("last_name")):
            candidates = Student.objects.filter(
                parent__phone=data["parent_phone"], first_name__iexact=data.get("first_name", ""),
                last_name__iexact=data.get("last_name", ""))
            if candidates.count() == 1:
                existing = candidates.first()
            elif candidates.count() > 1:
                pr.status = ERROR
                pr.errors.append("Несколько клиентов совпадают по ФИО и телефону; требуется ручная проверка")
        by_id = None
        if record_id:
            try:
                by_id = Student.objects.select_related("parent").filter(pk=int(record_id)).first()
            except (TypeError, ValueError):
                pr.status = ERROR
                pr.errors.append("Некорректный Internal ID клиента")
        if by_id and existing and by_id.id != existing.id:
            pr.status = ERROR
            pr.errors.append("ID и контакты относятся к разным клиентам")
        if by_id and data.get("parent_record_id") and str(by_id.parent_id) != str(data["parent_record_id"]):
            pr.status = ERROR
            pr.errors.append("ID семьи не совпадает с клиентом")
        if by_id and not data.get("parent_record_id") and not data.get("email") and not data.get("parent_phone"):
            pr.status = ERROR
            pr.errors.append("Для обновления по ID нужен второй идентификатор клиента или семьи")
        existing = by_id or existing
        if existing and data.get("parent_phone") and data["parent_phone"] != existing.parent.phone:
            if ParentAccount.objects.filter(phone=data["parent_phone"]).exclude(pk=existing.parent_id).exists():
                pr.status = ERROR
                pr.errors.append("Телефон уже принадлежит другой семье")
        is_dup = bool(existing) or (key in seen)
        if pr.status != ERROR and is_dup:
            if existing and mode in {"update_existing", "upsert"}:
                student_values = {key: str(data[key]).strip() for key in (
                    "first_name", "last_name", "email", "medical_info", "contraindications",
                    "emergency_contact_name", "emergency_contact_phone") if key in data}
                if "birth_date" in data:
                    try:
                        student_values["birth_date"] = (date.fromisoformat(str(data["birth_date"]).strip()).isoformat()
                                                        if data["birth_date"] else "")
                    except ValueError:
                        pr.errors.append("Некорректная дата рождения")
                for flag in ("is_active", "is_account_holder"):
                    if flag in data:
                        try:
                            student_values[flag] = _parse_import_bool(data[flag])
                        except ValidationError as exc:
                            pr.errors.extend(exc.messages)
                parent_values = {key: str(data[key]).strip() for key in (
                    "parent_phone", "parent_email", "parent_instagram_username", "preferred_language") if key in data}
                changes = {}
                for field, value in student_values.items():
                    old = getattr(existing, field)
                    old = old.isoformat() if field == "birth_date" and old else ("" if old is None else old)
                    if old != value:
                        changes[field] = {"old": old, "new": value}
                for field, value in parent_values.items():
                    attr = field.removeprefix("parent_")
                    if str(getattr(existing.parent, attr)) != value:
                        changes[field] = {"old": str(getattr(existing.parent, attr)), "new": value}
                pr.resolved["student_id"] = existing.id
                pr.resolved["changes"] = changes
                pr.resolved["affected_family_members"] = list(existing.parent.students.values_list("id", flat=True))
                pr.status = UPDATE if changes else DUPLICATE
                if pr.errors:
                    pr.status = ERROR
            else:
                pr.status = DUPLICATE
                pr.errors.append("Дубликат (email/ФИО+телефон уже есть)")
        elif pr.status == NEW and mode == "update_existing":
            pr.status = SKIPPED
        try:
            resolved_groups, _created = _resolve_groups(data)
            pr.resolved["group_ids"] = [group.id for group in resolved_groups]
            if (existing and pr.status in {UPDATE, DUPLICATE} and mode in {"update_existing", "upsert"}
                    and any(key in data for key in ("group_id", "group_name", "group_ids", "group_names"))):
                old_groups = sorted(existing.groups.values_list("id", flat=True))
                new_groups = sorted(group.id for group in resolved_groups)
                if old_groups != new_groups:
                    pr.resolved.setdefault("changes", {})["group_ids"] = {
                        "old": old_groups, "new": new_groups}
                    pr.status = UPDATE
        except ValidationError as exc:
            pr.status = ERROR
            pr.errors.extend(exc.messages)
        seen.add(key)
        result.append(pr)
    return result


def _parse_import_bool(value):
    key = str(value).strip().casefold()
    if key in {"true", "1", "yes", "да", "tak"}:
        return True
    if key in {"false", "0", "no", "нет", "nie"}:
        return False
    raise ValidationError(f"Некорректное boolean-значение: {value}")


@transaction.atomic
def commit(preview_rows, *, actor=None, source_name="", create_missing_groups=False,
           create_subscriptions=True, batch=None, mode="create_only"):
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
    updated_students = []
    errors = []
    for pr in preview_rows:
        if pr.status == UPDATE and mode in {"update_existing", "upsert"}:
            try:
                with transaction.atomic():
                    student = Student.objects.select_for_update().select_related("parent").get(pk=pr.resolved["student_id"])
                    parent = ParentAccount.objects.select_for_update().get(pk=student.parent_id)
                    for field, change in pr.resolved["changes"].items():
                        if field == "group_ids":
                            if sorted(student.groups.values_list("id", flat=True)) != change["old"]:
                                raise ValidationError("Группы изменились после предпросмотра")
                            continue
                        owner = parent if field.startswith("parent_") else student
                        attr = field.removeprefix("parent_") if owner is parent else field
                        current = getattr(owner, attr)
                        current = current.isoformat() if field == "birth_date" and current else ("" if current is None else current)
                        if current != change["old"] and not (owner is parent and current == change["new"]):
                            raise ValidationError("Данные изменились после предпросмотра")
                        value = change["new"]
                        if field == "birth_date":
                            value = date.fromisoformat(value) if value else None
                        setattr(owner, attr, value)
                    parent.full_clean()
                    student.full_clean()
                    parent.save()
                    student.save()
                    if "group_ids" in pr.resolved["changes"]:
                        set_student_groups(student, pr.resolved["changes"]["group_ids"]["new"])
                    updated_students.append(student.id)
            except ValidationError as exc:
                errors.append(f"Строка {pr.index}: {'; '.join(exc.messages)}")
            continue
        if pr.status != NEW:
            continue
        d = pr.data
        resolved_groups, next_created_groups = _resolve_groups(
            d, create_missing=create_missing_groups)
        created_groups.extend(next_created_groups)

        # Family = ParentAccount keyed by phone (DECISIONS.md #3): siblings sharing
        # one phone join the same family instead of spawning duplicate accounts.
        phone = str(d.get("parent_phone") or d.get("phone") or "").strip()
        parent = None
        raw_parent_id = d.get("parent_record_id")
        if raw_parent_id not in (None, ""):
            try:
                parent = ParentAccount.objects.filter(pk=int(raw_parent_id)).first()
            except (TypeError, ValueError):
                parent = None
        if parent is None and phone:
            parent = ParentAccount.objects.filter(phone=phone).first()
        if parent is None:
            requested_username = str(d.get("parent_username") or "").strip()
            base = (requested_username or d.get("parent_email") or d.get("email") or phone or
                    f'{d.get("last_name","")}{d.get("first_name","")}').strip() or "client"
            username = (requested_username or f"imp_{base}")[:150]
            n = 1
            while User.objects.filter(username=username).exists():
                n += 1
                username = f"{requested_username or f'imp_{base}'}_{n}"[:150]
            puser = User.objects.create_user(
                username=username, role="parent",
                first_name=str(d.get("parent_first_name") or d.get("first_name") or "").strip(),
                last_name=str(d.get("parent_last_name") or d.get("last_name") or "").strip(),
                email=str(d.get("parent_email") or d.get("email") or "").strip())
            # Imported clients keep their domain identity and history, but portal
            # access is enabled only through the one-time activation flow.
            puser.set_unusable_password()
            puser.save(update_fields=["password"])
            parent_kwargs = {
                "user": puser,
                "phone": phone,
                "email": str(d.get("parent_email") or d.get("email") or "").strip(),
                "preferred_language": str(d.get("preferred_language") or "pl").strip(),
                "instagram_username": normalize_instagram_username(
                    d.get("parent_instagram_username")),
            }
            if (raw_parent_id not in (None, "") and
                    not ParentAccount.objects.filter(pk=raw_parent_id).exists()):
                parent_kwargs["id"] = int(raw_parent_id)
            parent = ParentAccount.objects.create(**parent_kwargs)
            created_parents.append(parent.id)
        else:
            instagram_username = normalize_instagram_username(
                d.get("parent_instagram_username"))
            if instagram_username and parent.instagram_username and parent.instagram_username != instagram_username:
                raise ValidationError("У участников одного аккаунта указаны разные Instagram-профили")
            if instagram_username and not parent.instagram_username:
                parent.instagram_username = instagram_username
                parent.save(update_fields=["instagram_username"])

        birth_date = None
        if d.get("birth_date"):
            try:
                birth_date = date.fromisoformat(str(d["birth_date"]).strip())
            except ValueError as exc:
                raise ValidationError(f"Некорректная дата рождения: {d['birth_date']}") from exc
        def import_bool(value, default=False):
            if value in (None, ""):
                return default
            key = str(value).strip().casefold()
            if key in {"true", "1", "yes", "да", "tak"}:
                return True
            if key in {"false", "0", "no", "нет", "nie"}:
                return False
            raise ValidationError(f"Некорректное boolean-значение: {value}")
        student_kwargs = {
            "parent": parent,
            "first_name": str(d.get("first_name") or "").strip(),
            "last_name": str(d.get("last_name") or "").strip(),
            "birth_date": birth_date,
            "email": str(d.get("email") or "").strip(),
            "is_account_holder": import_bool(d.get("is_account_holder"), False),
            "medical_info": str(d.get("medical_info") or ""),
            "contraindications": str(d.get("contraindications") or ""),
            "emergency_contact_name": str(d.get("emergency_contact_name") or ""),
            "emergency_contact_phone": str(d.get("emergency_contact_phone") or ""),
            "is_active": import_bool(d.get("is_active"), True),
        }
        raw_student_id = d.get("record_id")
        if (raw_student_id not in (None, "") and
                not Student.objects.filter(pk=raw_student_id).exists()):
            student_kwargs["id"] = int(raw_student_id)
        student = Student.objects.create(**student_kwargs)
        legacy_note = str(d.get("admin_comments") or "").strip()
        if legacy_note:
            ParticipantNote.objects.create(student=student, body=legacy_note, imported=True)
        set_student_groups(student, [group.id for group in resolved_groups])
        created_students.append(student.id)
        audit(actor, "client.created", student, {"source": "import"})

        stype_name = str(d.get("subscription_type_name") or d.get("subscription") or "").strip()
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
    batch.rows_imported = len(created_students) + len(updated_students)
    batch.status = ImportBatchStatus.COMMITTED
    batch.committed_at = timezone.now()
    batch.input_data = {}
    batch.preview_expires_at = None
    batch.result = {
        "rows_total": batch.rows_total,
        "rows_imported": batch.rows_imported,
        "created_ids": created_students,
        "updated_ids": updated_students,
        "errors": errors,
    }
    batch.save()
    return batch


def rollback_preview(batch: ImportBatch):
    """Return blockers without changing data; a rollback may never delete later work."""
    student_ids = list(batch.created_student_ids or [])
    known_subscription_ids = set(batch.created_subscription_ids or [])
    blockers = ([{"updated_students": batch.result.get("updated_ids"),
                  "reason": "Обновлённые записи требуют ручного исправления"}]
                if batch.result.get("updated_ids") else [])
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
