from django.db import transaction

from .models import Student


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
