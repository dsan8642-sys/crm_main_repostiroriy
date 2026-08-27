from django.core.exceptions import ValidationError
from django.db import transaction

from catalog.models import Group

from .models import GroupMembership, Student


MAX_STUDENT_GROUPS = 3


def _account_holder_names(account):
    user = account.user
    first_name = (user.first_name or "").strip()
    last_name = (user.last_name or "").strip()
    if first_name or last_name:
        return first_name, last_name

    full_name = (user.get_full_name() or user.username or "").strip()
    if not full_name:
        return "Client", "Account"
    parts = full_name.split(maxsplit=1)
    if len(parts) == 1:
        return parts[0], "Client"
    return parts[0], parts[1]


@transaction.atomic
def ensure_account_holder_participant(account):
    participant = Student.objects.filter(parent=account, is_account_holder=True).first()
    if participant:
        return participant

    first_name, last_name = _account_holder_names(account)
    email = account.email or account.user.email
    return Student.objects.create(
        parent=account,
        first_name=first_name,
        last_name=last_name,
        email=email,
        is_account_holder=True,
    )


def _group_ids(values):
    result = []
    for raw in values or []:
        try:
            group_id = int(raw)
        except (TypeError, ValueError) as exc:
            raise ValidationError({"participant.group_ids": "Укажите корректные ID групп."}) from exc
        if group_id <= 0:
            raise ValidationError({"participant.group_ids": "Укажите корректные ID групп."})
        if group_id in result:
            raise ValidationError({"participant.group_ids": "Одна группа указана несколько раз."})
        result.append(group_id)
    if len(result) > MAX_STUDENT_GROUPS:
        raise ValidationError({
            "participant.group_ids": f"Участник может состоять максимум в {MAX_STUDENT_GROUPS} группах.",
        })
    return result


@transaction.atomic
def set_student_groups(student, values):
    """Replace group memberships under a participant row lock."""
    caller_student = student
    student = Student.objects.select_for_update().get(pk=student.pk)
    group_ids = _group_ids(values)
    groups = list(Group.objects.filter(pk__in=group_ids))
    if len(groups) != len(group_ids):
        found = {group.id for group in groups}
        missing = next(group_id for group_id in group_ids if group_id not in found)
        raise ValidationError({
            "participant.group_ids": f"Группа с ID {missing} не найдена.",
        })
    existing = set(student.group_memberships.values_list("group_id", flat=True))
    desired = set(group_ids)
    student.group_memberships.filter(group_id__in=existing - desired).delete()
    GroupMembership.objects.bulk_create([
        GroupMembership(student=student, group_id=group_id)
        for group_id in group_ids if group_id not in existing
    ])
    # Detail endpoints commonly load the participant with ``groups`` already
    # prefetched. Invalidate that caller-side cache so the response reflects
    # the membership change committed above.
    getattr(caller_student, "_prefetched_objects_cache", {}).pop("groups", None)
    return student


@transaction.atomic
def add_student_group(student, group_id):
    student = Student.objects.select_for_update().get(pk=student.pk)
    existing = list(student.group_memberships.values_list("group_id", flat=True))
    if int(group_id) in existing:
        return student
    return set_student_groups(student, [*existing, group_id])


@transaction.atomic
def remove_student_group(student, group_id):
    student = Student.objects.select_for_update().get(pk=student.pk)
    student.group_memberships.filter(group_id=group_id).delete()
    return student
