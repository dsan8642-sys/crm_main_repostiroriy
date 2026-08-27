from django.db import transaction
from django.shortcuts import get_object_or_404

from accounts.models import ParentAccount, User
from audit.models import audit
from students.models import Student

from .support import _apply_account_data, _invalidate_access_codes


class ClientLifecycleConflict(Exception):
    """The requested profile edit lost to an account lifecycle transition."""


def _locked_client(client_id):
    account = get_object_or_404(
        ParentAccount.objects.select_for_update(),
        pk=client_id,
    )
    user = User.objects.select_for_update().get(pk=account.user_id)
    participants = list(
        Student.objects.select_for_update()
        .filter(parent_id=account.id)
        .order_by("id")
    )
    account.user = user
    return account, participants


@transaction.atomic
def edit_client_account(client_id, data, *, actor):
    account, _participants = _locked_client(client_id)
    if not account.user.is_active:
        raise ClientLifecycleConflict
    _apply_account_data(account, data, allow_lifecycle=False)
    audit(actor, "client_account.updated", account, {
        "fields": sorted((data.get("account") or data.get("client") or data).keys()),
    })
    return account


@transaction.atomic
def archive_client_account(client_id, *, actor):
    account, participants = _locked_client(client_id)
    account.user.is_active = False
    account.user.save(update_fields=["is_active"])
    participant_ids = [participant.id for participant in participants]
    if participant_ids:
        Student.objects.filter(pk__in=participant_ids).update(is_active=False)
    invalidated = _invalidate_access_codes(account.user)
    audit(actor, "client_account.archived", account, {
        "source": "api",
        "invalidated_codes": invalidated,
    })
    return account


@transaction.atomic
def restore_client_account(client_id, *, actor):
    account, participants = _locked_client(client_id)
    account.user.is_active = True
    account.user.save(update_fields=["is_active"])
    participant_ids = [participant.id for participant in participants]
    restored_participants = 0
    if participant_ids:
        restored_participants = Student.objects.filter(
            pk__in=participant_ids,
            is_active=False,
        ).update(is_active=True)
    audit(actor, "client_account.restored", account, {
        "source": "api",
        "restored_participants": restored_participants,
    })
    return account
