"""Small importers for trainers and groups, which previously had export only."""
from dataclasses import dataclass, field

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction

from accounts.models import Role, Trainer, User
from catalog.models import Group

from .contracts import prepare_rows


NEW, UPDATE, DUPLICATE, SKIPPED, ERROR = "new", "update", "duplicate", "skipped", "error"
REFERENCE_IMPORT_MODES = {"create_only", "update_existing", "upsert"}


@dataclass
class ReferencePreviewRow:
    index: int
    data: dict
    status: str = NEW
    errors: list = field(default_factory=list)
    warnings: list = field(default_factory=list)
    resolved: dict = field(default_factory=dict)


def _bool(value, default=True):
    if value in (None, ""):
        return default
    key = str(value).strip().casefold()
    if key in {"true", "1", "yes", "да", "tak"}:
        return True
    if key in {"false", "0", "no", "нет", "nie"}:
        return False
    raise ValidationError(f"Некорректное boolean-значение: {value}")


def _integer(value, *, positive=False, nonnegative=False):
    if value in (None, ""):
        return None
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"Некорректное целое число: {value}") from exc
    if positive and parsed <= 0:
        raise ValidationError("Значение должно быть положительным")
    if nonnegative and parsed < 0:
        raise ValidationError("Значение не может быть отрицательным")
    return parsed


def preview_trainers(headers, rows, mapping=None):
    canonical = prepare_rows("trainers", headers, rows, mapping)["rows"]
    result = []
    seen = set()
    for index, data in enumerate(canonical, start=2):
        row = ReferencePreviewRow(index=index, data=data)
        username = str(data.get("username") or "").strip()
        if not username:
            row.errors.append("Не указан username")
        email = str(data.get("email") or "").strip()
        if email:
            try:
                validate_email(email)
            except ValidationError:
                row.errors.append("Некорректный email")
        key = username.casefold()
        existing = User.objects.filter(username__iexact=username).first() if username else None
        if key in seen:
            row.errors.append("Повторяющийся username в файле")
        elif existing:
            if existing.role != Role.TRAINER or not hasattr(existing, "trainer_profile"):
                row.errors.append("Username уже принадлежит не тренеру")
            else:
                row.status = DUPLICATE
                row.resolved = {"trainer_id": existing.trainer_profile.id}
                row.warnings.append("Тренер уже существует; строка будет пропущена")
        seen.add(key)
        if row.errors:
            row.status = ERROR
        result.append(row)
    return result


def _resolve_trainer(data):
    raw_id = data.get("default_trainer_id")
    if raw_id not in (None, ""):
        try:
            trainer = Trainer.objects.select_related("user").filter(pk=int(raw_id)).first()
        except (TypeError, ValueError):
            trainer = None
        if trainer:
            return trainer, "Совпал стабильный internal ID"
    username = str(data.get("default_trainer_username") or "").strip()
    if username:
        trainer = Trainer.objects.select_related("user").filter(user__username__iexact=username).first()
        if trainer:
            return trainer, "Совпал username"
        matches = list(Trainer.objects.select_related("user").filter(
            user__first_name__isnull=False))
        named = [trainer for trainer in matches
                 if trainer.user.get_full_name().strip().casefold() == username.casefold()]
        if len(named) == 1:
            return named[0], "Совпало уникальное ФИО"
        if len(named) > 1:
            return None, "Тренер неоднозначен; выберите вручную"
        return None, f"Тренер не найден: {username}"
    return None, ""


def _group_snapshot(group):
    return {
        "name": group.name,
        "description": group.description,
        "default_trainer_id": group.default_trainer_id,
        "price_minor": group.price_minor,
        "currency": group.currency,
        "default_capacity": group.default_capacity,
        "color_key": group.color_key,
        "is_active": group.is_active,
    }


def preview_groups(headers, rows, mapping=None, mode="create_only"):
    if mode not in REFERENCE_IMPORT_MODES:
        raise ValidationError("Некорректный режим импорта групп")
    canonical = prepare_rows("groups", headers, rows, mapping)["rows"]
    result = []
    seen = set()
    for index, data in enumerate(canonical, start=2):
        row = ReferencePreviewRow(index=index, data=data)
        name = str(data.get("name") or "").strip()
        if not name:
            row.errors.append("Не указано название группы")
        key = name.casefold()
        raw_id = data.get("record_id")
        existing = None
        if raw_id not in (None, ""):
            try:
                existing = Group.objects.filter(pk=int(raw_id)).first()
            except (TypeError, ValueError):
                row.errors.append("Некорректный Internal ID группы")
        if existing is None and name:
            existing = Group.objects.filter(name__iexact=name).first()
        identity = str(existing.id) if existing else key
        if identity in seen:
            row.errors.append("Повторяющееся название группы в файле")
        trainer, reason = _resolve_trainer(data)
        trainer_supplied = any(
            field in data for field in ("default_trainer_id", "default_trainer_username"))
        if reason and trainer is None and trainer_supplied:
            row.errors.append(reason)
        if trainer:
            row.resolved = {"default_trainer_id": trainer.id, "matching_reason": reason}
        try:
            parsed = {
                "name": name,
                "description": str(data.get("description") or "").strip(),
                "default_trainer_id": trainer.id if trainer else None,
                "price_minor": _integer(data.get("price_minor"), nonnegative=True),
                "currency": str(data.get("currency") or "PLN").strip().upper(),
                "default_capacity": _integer(data.get("default_capacity"), positive=True),
                "color_key": str(data.get("color_key") or "").strip() or None,
                "is_active": _bool(data.get("is_active")),
            }
        except ValidationError as exc:
            row.errors.extend(exc.messages)
            parsed = {}
        if existing and not row.errors:
            current = _group_snapshot(existing)
            changes = {
                field: {"old": current[field], "new": value}
                for field, value in parsed.items()
                if field in data and current[field] != value
            }
            row.resolved.update({"group_id": existing.id, "changes": changes})
            if changes and mode in {"update_existing", "upsert"}:
                row.status = UPDATE
                row.warnings.append("Существующая группа будет обновлена после подтверждения")
            else:
                row.status = DUPLICATE
                row.warnings.append("Группа уже существует; строка будет пропущена")
        elif not existing and not row.errors and mode == "update_existing":
            row.status = SKIPPED
            row.warnings.append("Группа не существует; режим update_existing не создаёт новые записи")
        seen.add(identity)
        if row.errors:
            row.status = ERROR
        result.append(row)
    return result


@transaction.atomic
def commit_trainers(preview_rows, *, actor=None):
    created_ids = []
    errors = []
    for row in preview_rows:
        if row.status != NEW:
            continue
        data = row.data
        try:
            with transaction.atomic():
                user = User.objects.create_user(
                    username=str(data.get("username") or "").strip(),
                    role=Role.TRAINER,
                    first_name=str(data.get("first_name") or "").strip(),
                    last_name=str(data.get("last_name") or "").strip(),
                    email=str(data.get("email") or "").strip(),
                )
                user.set_unusable_password()
                user.save(update_fields=["password"])
                kwargs = {
                    "user": user,
                    "phone": str(data.get("phone") or "").strip(),
                    "is_active": _bool(data.get("is_active")),
                }
                raw_id = data.get("record_id")
                if raw_id not in (None, "") and not Trainer.objects.filter(pk=raw_id).exists():
                    kwargs["id"] = int(raw_id)
                trainer = Trainer.objects.create(**kwargs)
                created_ids.append(trainer.id)
        except (ValidationError, ValueError) as exc:
            messages = exc.messages if hasattr(exc, "messages") else [str(exc)]
            errors.append(f"Строка {row.index}: {'; '.join(messages)}")
    return {"created": len(created_ids), "skipped": len(preview_rows) - len(created_ids),
            "created_ids": created_ids, "errors": errors}


@transaction.atomic
def commit_groups(preview_rows, *, actor=None, mode="create_only"):
    if mode not in REFERENCE_IMPORT_MODES:
        raise ValidationError("Некорректный режим импорта групп")
    created_ids = []
    updated_ids = []
    updates_before = {}
    updates_after = {}
    created_after = {}
    errors = []
    for row in preview_rows:
        if row.status not in {NEW, UPDATE}:
            continue
        data = row.data
        try:
            with transaction.atomic():
                if row.status == UPDATE:
                    group = Group.objects.select_for_update().get(pk=row.resolved["group_id"])
                    before = _group_snapshot(group)
                    for field, change in row.resolved.get("changes", {}).items():
                        setattr(group, field, change["new"])
                    group.full_clean()
                    group.save()
                    updated_ids.append(group.id)
                    updates_before[str(group.id)] = before
                    updates_after[str(group.id)] = _group_snapshot(group)
                    continue
                trainer, reason = _resolve_trainer(data)
                if reason and trainer is None:
                    raise ValidationError(reason)
                kwargs = {
                    "name": str(data.get("name") or "").strip(),
                    "description": str(data.get("description") or "").strip(),
                    "default_trainer": trainer,
                    "price_minor": _integer(data.get("price_minor"), nonnegative=True),
                    "currency": str(data.get("currency") or "PLN").strip().upper(),
                    "default_capacity": _integer(data.get("default_capacity"), positive=True),
                    "color_key": str(data.get("color_key") or "").strip() or None,
                    "is_active": _bool(data.get("is_active")),
                }
                raw_id = data.get("record_id")
                if raw_id not in (None, "") and not Group.objects.filter(pk=raw_id).exists():
                    kwargs["id"] = int(raw_id)
                group = Group.objects.create(**kwargs)
                group.full_clean()
                created_ids.append(group.id)
                created_after[str(group.id)] = _group_snapshot(group)
        except (ValidationError, ValueError) as exc:
            messages = exc.messages if hasattr(exc, "messages") else [str(exc)]
            errors.append(f"Строка {row.index}: {'; '.join(messages)}")
    return {
        "created": len(created_ids),
        "updated": len(updated_ids),
        "skipped": len(preview_rows) - len(created_ids) - len(updated_ids),
        "created_ids": created_ids,
        "updated_ids": updated_ids,
        "updates_before": updates_before,
        "updates_after": updates_after,
        "created_after": created_after,
        "errors": errors,
    }


def _has_group_dependencies(group):
    dependencies = []
    for relation in group._meta.related_objects:
        accessor = relation.get_accessor_name()
        try:
            related = getattr(group, accessor)
        except relation.related_model.DoesNotExist:
            continue
        if hasattr(related, "exists") and related.exists():
            dependencies.append(accessor)
        elif not hasattr(related, "exists") and related is not None:
            dependencies.append(accessor)
    return dependencies


def rollback_groups_preview(result):
    result = result if isinstance(result, dict) else {}
    blockers = []
    created_after = result.get("created_after") or {}
    updates_after = result.get("updates_after") or {}
    for group_id in result.get("created_ids") or []:
        group = Group.objects.filter(pk=group_id).first()
        if group is None:
            blockers.append(f"Созданная группа {group_id} уже отсутствует")
            continue
        if _group_snapshot(group) != created_after.get(str(group_id)):
            blockers.append(f"Созданная группа {group_id} была изменена после импорта")
        dependencies = _has_group_dependencies(group)
        if dependencies:
            blockers.append(
                f"У созданной группы {group_id} есть зависимости: {', '.join(dependencies)}")
    for group_id, expected in updates_after.items():
        group = Group.objects.filter(pk=group_id).first()
        if group is None or _group_snapshot(group) != expected:
            blockers.append(f"Обновлённая группа {group_id} изменилась после импорта")
    return {
        "can_rollback": not blockers,
        "blockers": blockers,
        "will_delete": list(result.get("created_ids") or []),
        "will_restore": list((result.get("updates_before") or {}).keys()),
    }


@transaction.atomic
def rollback_groups(result):
    preview = rollback_groups_preview(result)
    if not preview["can_rollback"]:
        raise ValidationError("Откат групп заблокирован зависимостями или последующими изменениями")
    for group_id, snapshot in (result.get("updates_before") or {}).items():
        group = Group.objects.select_for_update().get(pk=group_id)
        for field, value in snapshot.items():
            setattr(group, field, value)
        group.full_clean()
        group.save()
    Group.objects.filter(pk__in=result.get("created_ids") or []).delete()
    return preview
