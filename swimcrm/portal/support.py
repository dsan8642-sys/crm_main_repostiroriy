import json
from datetime import datetime, time

from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.db.models import Q, Sum
from django.http import FileResponse, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from accounts.models import AccountActivation, Consent, ConsentType, ParentAccount, Role, Trainer, User
from accounts.privacy import anonymize_parent_account
from analytics.debtors import debtors, upcoming
from analytics.reports import income_by_group, income_by_trainer, income_for_period
from attendance.models import AttendanceRecord, AttendanceStatus
from attendance.services import set_attendance
from audit.models import audit
from billing.models import (Charge, Payment, PaymentMethod, PaymentSource, PaymentStatus,
                            ReceiptFile, normalize_payment_method)
from billing.services import (
    charge_statuses, confirm_payment, create_client_top_up_request,
    record_admin_payment_created,
    reject_payment, student_balance,
)
from catalog.models import Group, SubscriptionType
from common.money import Money
from common.schedule_palette import (
    resolve_session_color_key,
    session_type_color_keys,
    stored_schedule_color_key,
    validate_schedule_color_key,
)
from dataio.exports import export_entity
from notifications.models import Channel, NotificationLog
from notifications.services import queue_mass_mailing
from scheduling.models import (Session, SessionParticipant,
                               SessionParticipantSource, SessionParticipantStatus,
                               SessionType, WaitlistEntry, WaitlistStatus)
from scheduling.services import (ScheduleConflict, check_trainer_conflict,
                                 create_session, delete_session, edit_single_session,
                                 promote_waitlist_entry,
                                 session_roster_students)
from students.models import Student
from students.services import ensure_account_holder_participant
from subscriptions.models import Subscription, SubscriptionStatus
from subscriptions.services import create_subscription, freeze_subscription, manual_adjust, renew_subscription

# Admin list endpoints return the full working set; the frontend filters client
# side. The cap only exists so a runaway table cannot exhaust memory, so it must
# stay well above the real row counts (a 200-row cap silently hid clients 201+).
MAX_LIST_ROWS = 2000


def _error(message, status=400):
    return JsonResponse({"error": message}, status=status)


def _require_user(request):
    if not request.user.is_authenticated:
        raise PermissionDenied("Login required")
    return request.user


def _require_role(request, *roles):
    user = _require_user(request)
    if user.role not in roles and not user.is_superuser:
        raise PermissionDenied("Insufficient permissions")
    return user


def _json_body(request):
    if not request.body:
        return {}
    try:
        return json.loads(request.body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValidationError(f"Invalid JSON: {exc}") from exc


def _parse_date(value, field):
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValidationError(f"{field}: expected date YYYY-MM-DD") from exc


def _parse_time(value, field):
    if value in (None, ""):
        return None
    try:
        return time.fromisoformat(value)
    except ValueError as exc:
        raise ValidationError(f"{field}: expected time HH:MM") from exc


def _parse_datetime(value, field):
    if value in (None, ""):
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValidationError(f"{field}: expected ISO datetime") from exc
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed)
    return parsed


def _bool_value(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _unique_username(base):
    base = (base or "client").strip().replace(" ", "_")[:140] or "client"
    username = base
    counter = 1
    while User.objects.filter(username=username).exists():
        counter += 1
        username = f"{base}_{counter}"[:150]
    return username


def _portal_identity(email, username, *, exclude_user_id=None):
    email = str(email or "").strip().lower()
    username = str(username or "").strip()
    if not email and not username:
        raise ValidationError("email or explicit username is required")

    users = User.objects.all()
    accounts = ParentAccount.objects.all()
    if exclude_user_id is not None:
        users = users.exclude(pk=exclude_user_id)
        accounts = accounts.exclude(user_id=exclude_user_id)
    if email and (users.filter(email__iexact=email).exists() or accounts.filter(email__iexact=email).exists()):
        raise ValidationError("email already exists")

    login = username or email
    if users.filter(username__iexact=login).exists():
        raise ValidationError("username already exists")
    return email, login


def _portal_access_state(user):
    if not user.is_active:
        return "revoked"
    return "active" if user.has_usable_password() else "not_activated"


def _invalidate_access_codes(user):
    return AccountActivation.objects.filter(
        Q(user=user) | Q(parent__user=user),
        used_at__isnull=True,
    ).update(used_at=timezone.now())


def _student_payload(student):
    return {
        "id": student.id,
        "client_id": student.parent_id,
        "client_is_active": student.parent.user.is_active,
        "first_name": student.first_name,
        "last_name": student.last_name,
        "full_name": student.full_name,
        "birth_date": student.birth_date.isoformat() if student.birth_date else None,
        "email": student.email,
        "medical_info": student.medical_info,
        "contraindications": student.contraindications,
        "admin_comments": student.admin_comments,
        "is_active": student.is_active,
        "is_account_holder": student.is_account_holder,
        "group": {"id": student.group_id, "name": student.group.name} if student.group else None,
        "client_phone": student.parent.phone,
        "emergency_contact_name": student.emergency_contact_name,
        "emergency_contact_phone": student.emergency_contact_phone,
        "created_at": timezone.localtime(student.created_at).isoformat() if student.created_at else None,
    }


def _client_student_payload(student):
    """Explicit allowlist for a participant viewing their own client account."""
    return {
        "id": student.id,
        "first_name": student.first_name,
        "last_name": student.last_name,
        "full_name": student.full_name,
        "birth_date": student.birth_date.isoformat() if student.birth_date else None,
        "email": student.email,
        "medical_info": student.medical_info,
        "contraindications": student.contraindications,
        "is_active": student.is_active,
        "is_account_holder": student.is_account_holder,
        "group": {"id": student.group_id, "name": student.group.name} if student.group else None,
        "emergency_contact_name": student.emergency_contact_name,
        "emergency_contact_phone": student.emergency_contact_phone,
    }


def _session_payload(session, *, type_color_keys=None):
    if type_color_keys is None:
        type_color_keys = session_type_color_keys()
    waitlist_active_count = getattr(session, "waitlist_active_count", None)
    if waitlist_active_count is None and session.pk:
        waitlist_active_count = session.waitlist_entries.filter(status=WaitlistStatus.ACTIVE).count()
    individual_participant = None
    if (
        session.session_type in {SessionType.INDIVIDUAL, SessionType.SPLIT}
        and session.individual_student_id
    ):
        individual_participant = {
            "id": session.individual_student_id,
            "full_name": session.individual_student.full_name,
        }
    return {
        "id": session.id,
        "start_at": timezone.localtime(session.start_at).isoformat(),
        "end_at": timezone.localtime(session.end_at).isoformat(),
        "duration_minutes": session.duration_minutes,
        "location": session.location,
        "session_type": session.session_type,
        "presentation_type_label": (
            getattr(type_color_keys, "labels", {}).get(session.session_type)
            or {
                SessionType.GROUP: "Групповая тренировка",
                SessionType.INDIVIDUAL: "Индивидуальная тренировка",
                SessionType.SPLIT: "Split-тренировка",
            }.get(session.session_type, session.get_session_type_display())
        ),
        "presentation_color_key": resolve_session_color_key(session, type_color_keys),
        "trainer_id": session.trainer_id,
        "trainer": str(session.trainer),
        "substitute_trainer_id": session.substitute_trainer_id,
        "substitute_trainer": str(session.substitute_trainer) if session.substitute_trainer_id else None,
        "effective_trainer_id": session.effective_trainer.id,
        "effective_trainer": str(session.effective_trainer),
        "group": {"id": session.group_id, "name": session.group.name} if session.group else None,
        "individual_student_id": session.individual_student_id,
        "individual_participant": individual_participant,
        "is_cancelled": session.is_cancelled,
        "is_manually_modified": session.is_manually_modified,
        "max_participants": session.max_participants,
        "price_minor": session.price_minor,
        "currency": session.currency,
        "participants_count": len(_session_roster(session)),
        "waitlist_active_count": waitlist_active_count,
        "notes": session.notes,
    }


_ROLE_SESSION_FIELDS = (
    "id", "start_at", "end_at", "duration_minutes", "location", "session_type",
    "presentation_type_label", "presentation_color_key",
    "trainer_id", "trainer", "substitute_trainer_id", "substitute_trainer",
    "effective_trainer_id", "effective_trainer", "group",
    "individual_student_id", "individual_participant", "is_cancelled", "max_participants",
    "participants_count",
)


def _role_session_payload(session, *, participant=None, type_color_keys=None):
    """Client/trainer session allowlist. Staff notes never cross this boundary."""
    admin_payload = _session_payload(session, type_color_keys=type_color_keys)
    if participant is not None:
        owns_individual_context = (
            session.session_type in {SessionType.INDIVIDUAL, SessionType.SPLIT}
            and (
                session.individual_student_id == participant.id
                or any(
                    row.student_id == participant.id
                    and row.status == SessionParticipantStatus.ACTIVE
                    for row in session.participants.all()
                )
            )
        )
        admin_payload["individual_participant"] = (
            {"id": participant.id, "full_name": participant.full_name}
            if owns_individual_context else None
        )
    return {field: admin_payload[field] for field in _ROLE_SESSION_FIELDS}


def _waitlist_payload(entry):
    participant_id = getattr(entry, "participant_id", None)
    if participant_id is None and entry.pk and entry.status == WaitlistStatus.PROMOTED:
        participant_id = SessionParticipant.objects.filter(
            session_id=entry.session_id,
            student_id=entry.student_id,
            status=SessionParticipantStatus.ACTIVE,
        ).values_list("id", flat=True).first()
    return {
        "id": entry.id,
        "session_id": entry.session_id,
        "student_id": entry.student_id,
        "participant_id": participant_id,
        "student": _student_payload(entry.student) if getattr(entry, "student", None) else None,
        "priority": entry.priority,
        "status": entry.status,
        "note": entry.note,
        "created_at": timezone.localtime(entry.created_at).isoformat() if entry.created_at else None,
        "updated_at": timezone.localtime(entry.updated_at).isoformat() if entry.updated_at else None,
    }


def _apply_waitlist_data(entry, data):
    if "student_id" in data:
        entry.student = get_object_or_404(Student, pk=data.get("student_id"))
    if "priority" in data:
        try:
            entry.priority = int(data.get("priority") or 0)
        except (TypeError, ValueError) as exc:
            raise ValidationError("priority must be an integer") from exc
    if "status" in data:
        status = data.get("status")
        if status not in WaitlistStatus.values:
            raise ValidationError("invalid waitlist status")
        entry.status = status
    if "note" in data:
        entry.note = data.get("note", "") or ""
    entry.full_clean()
    entry.save()
    return entry


def _trainer_payload(trainer):
    user = trainer.user
    return {
        "id": trainer.id,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "full_name": user.get_full_name() or user.username,
        "email": user.email,
        "phone": trainer.phone,
        "is_active": trainer.is_active,
        "user_is_active": user.is_active,
        "access_activated": user.has_usable_password(),
        "portal_access": _portal_access_state(user),
        "groups_count": trainer.default_groups.count(),
    }


def _subscription_payload(subscription):
    return {
        "id": subscription.id,
        "participant_id": subscription.student_id,
        "subscription_type_id": subscription.subscription_type_id,
        "type": subscription.subscription_type.name,
        "status": subscription.status,
        "start_date": subscription.start_date.isoformat(),
        "base_end_date": subscription.base_end_date.isoformat(),
        "effective_end_date": subscription.effective_end_date.isoformat(),
        "grace_end_date": subscription.grace_end_date.isoformat(),
        "remaining_sessions": subscription.remaining_sessions,
        "created_at": timezone.localtime(subscription.created_at).isoformat(),
    }


def _group_payload(group):
    return {
        "id": group.id,
        "name": group.name,
        "description": group.description,
        "default_trainer": {
            "id": group.default_trainer_id,
            "name": str(group.default_trainer),
        } if group.default_trainer_id else None,
        "price_minor": group.price_minor,
        "currency": group.currency,
        "default_capacity": group.default_capacity,
        "color_key": stored_schedule_color_key(group.color_key),
        "is_active": group.is_active,
        "participants_count": group.students.count(),
    }


def _subscription_type_payload(subscription_type):
    return {
        "id": subscription_type.id,
        "name": subscription_type.name,
        "price": subscription_type.price.format(),
        "price_minor": subscription_type.price_minor,
        "currency": subscription_type.currency,
        "duration_days": subscription_type.duration_days,
        "sessions_count": subscription_type.sessions_count,
        "is_unlimited": subscription_type.is_unlimited,
        "is_individual": subscription_type.is_individual,
        "is_active": subscription_type.is_active,
    }


def _charge_payload(charge):
    return {
        "id": charge.id,
        "participant_id": charge.student_id,
        "participant": charge.student.full_name,
        "subscription_id": charge.subscription_id,
        "description": charge.description,
        "amount": charge.amount.format(),
        "amount_minor": charge.amount_minor,
        "currency": charge.currency,
        "due_date": charge.due_date.isoformat(),
        "created_at": timezone.localtime(charge.created_at).isoformat(),
    }


def _payment_payload(payment):
    receipts = [{
        "id": receipt.id,
        "original_name": receipt.original_name,
        "uploaded_at": timezone.localtime(receipt.uploaded_at).isoformat(),
        "download_url": f"/api/documents/{receipt.id}/download/",
    } for receipt in payment.receipts.all() if receipt.file and not receipt.is_deleted]
    events = [{
        "id": event.id,
        "type": event.event_type,
        "from_status": event.from_status or None,
        "to_status": event.to_status,
        "amount_minor": event.amount_minor,
        "currency": event.currency,
        "note": event.note,
        "actor": str(event.actor) if event.actor_id else None,
        "created_at": timezone.localtime(event.created_at).isoformat(),
    } for event in payment.events.all()]
    return {
        "id": payment.id,
        "participant_id": payment.student_id,
        "participant": payment.student.full_name,
        "amount": payment.amount.format(),
        "amount_minor": payment.amount_minor,
        "currency": payment.currency,
        "paid_at": payment.paid_at.isoformat(),
        "method": payment.method,
        "reference_id": payment.reference_id,
        "status": payment.status,
        "source": payment.source,
        "affects_balance": payment.status == PaymentStatus.CONFIRMED,
        "comment": payment.comment,
        "confirmed_by": str(payment.confirmed_by) if payment.confirmed_by_id else None,
        "confirmed_at": timezone.localtime(payment.confirmed_at).isoformat() if payment.confirmed_at else None,
        "created_at": timezone.localtime(payment.created_at).isoformat(),
        "documents": receipts,
        "receipt": receipts[0] if receipts else None,
        "events": events,
    }


def _attendance_payload(record):
    session = record.session
    return {
        "id": record.id,
        "participant_id": record.student_id,
        "participant": record.student.full_name,
        "session_id": session.id,
        "session_start_at": timezone.localtime(session.start_at).isoformat(),
        "session_end_at": timezone.localtime(session.end_at).isoformat(),
        "group": session.group.name if session.group_id else "Individual",
        "trainer": str(session.trainer),
        "location": session.location,
        "status": record.status,
        "comment": record.comment,
        "marked_at": timezone.localtime(record.marked_at).isoformat(),
        "deducts": record.deducts,
        "financial_effects_enabled": record.financial_effects_enabled,
    }


def _consent_payload(consent):
    return {
        "id": consent.id,
        "type": consent.type,
        "type_label": consent.get_type_display(),
        "granted": consent.granted,
        "is_active": consent.is_active,
        "granted_at": timezone.localtime(consent.granted_at).isoformat() if consent.granted_at else None,
        "revoked_at": timezone.localtime(consent.revoked_at).isoformat() if consent.revoked_at else None,
        "policy_version": consent.policy_version,
    }


def _ledger_entry_payload(entry):
    return {
        "id": entry.id,
        "delta": entry.delta,
        "reason": entry.reason,
        "note": entry.note,
        "created_at": timezone.localtime(entry.created_at).isoformat(),
    }


def _subscription_detail_payload(subscription):
    return {
        **_subscription_payload(subscription),
        "participant": _student_payload(subscription.student),
        "ledger": [_ledger_entry_payload(entry) for entry in subscription.ledger_entries.all()],
        "charges": [_charge_payload(charge) for charge in subscription.charges.select_related("student").all()],
        "freezes": [{
            "id": freeze.id,
            "start_date": freeze.start_date.isoformat(),
            "end_date": freeze.end_date.isoformat(),
            "days": freeze.days,
            "reason": freeze.reason,
        } for freeze in subscription.freeze_periods.all()],
    }


def _client_account_payload(account):
    user = account.user
    return {
        "id": account.id,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "full_name": user.get_full_name() or user.username,
        "email": account.email or user.email,
        "phone": account.phone,
        "telegram_chat_id": account.telegram_chat_id,
        "preferred_language": account.preferred_language,
        "is_active": user.is_active,
        "access_activated": user.has_usable_password(),
        "portal_access": _portal_access_state(user),
        "created_at": timezone.localtime(account.created_at).isoformat(),
    }


def _client_safe_account_payload(account):
    user = account.user
    return {
        "id": account.id,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "full_name": user.get_full_name() or user.username,
        "email": account.email or user.email,
        "phone": account.phone,
        "preferred_language": account.preferred_language,
        "telegram": {"connected": bool(account.telegram_chat_id)},
        "created_at": timezone.localtime(account.created_at).isoformat(),
    }


def _client_safe_detail_payload(account):
    participants = list(_student_queryset_for_client(account).order_by("id"))
    participant_rows = [_client_student_payload(student) for student in participants]
    return {
        "account": _client_safe_account_payload(account),
        "participants": participant_rows,
        "students": participant_rows,
    }


def _client_detail_payload(account):
    participants = list(_student_queryset_for_parent(account).order_by("id"))
    participant_ids = [student.id for student in participants]
    subscriptions = Subscription.objects.filter(student_id__in=participant_ids).select_related(
        "student", "student__parent", "student__group", "subscription_type").prefetch_related(
        "ledger_entries", "charges", "freeze_periods").order_by("-start_date", "-id")
    charges = Charge.objects.filter(student_id__in=participant_ids).select_related(
        "student", "subscription").order_by("-due_date", "-id")
    payments = Payment.objects.filter(student_id__in=participant_ids).select_related(
        "student", "confirmed_by").prefetch_related(
        "receipts", "events", "events__actor").order_by("-paid_at", "-id")
    attendance = AttendanceRecord.objects.filter(student_id__in=participant_ids).select_related(
        "student", "session", "session__group", "session__trainer__user").order_by("-session__start_at", "-id")
    balances = {student.id: student_balance(student).amount_minor for student in participants}

    return {
        "account": _client_account_payload(account),
        "participants": [{**_student_payload(student), "balance_minor": balances.get(student.id, 0)} for student in participants],
        "subscriptions": [_subscription_detail_payload(subscription) for subscription in subscriptions],
        "charges": [_charge_payload(charge) for charge in charges],
        "payments": [_payment_payload(payment) for payment in payments],
        "attendance": [_attendance_payload(record) for record in attendance[:MAX_LIST_ROWS]],
        "consents": [_consent_payload(consent) for consent in account.consents.order_by("type", "id")],
        "summary": {
            "participants_count": len(participants),
            "active_participants": sum(1 for student in participants if student.is_active),
            "balance_minor": sum(balances.values()),
            "active_subscriptions": sum(1 for subscription in subscriptions if subscription.status == SubscriptionStatus.ACTIVE),
            "pending_payments": sum(1 for payment in payments if payment.status == PaymentStatus.PENDING),
        },
    }


def _participant_data(data):
    return data.get("participant") or data.get("student") or {}


def _account_data(data):
    return data.get("account") or data.get("client") or data


def _apply_account_data(account, data):
    account_data = _account_data(data)
    user = account.user
    if "email" in account_data:
        email, _ = _portal_identity(
            account_data.get("email"), user.username, exclude_user_id=user.id)
        account_data = {**account_data, "email": email}
    for field in ("first_name", "last_name", "email"):
        if field in account_data:
            setattr(user, field, account_data.get(field, "") or "")
    if "is_active" in account_data:
        user.is_active = _bool_value(account_data.get("is_active"), True)
    if "username" in account_data and account_data["username"] != user.username:
        username = str(account_data["username"]).strip()
        if not username:
            raise ValidationError("username cannot be empty")
        if User.objects.exclude(pk=user.pk).filter(username__iexact=username).exists():
            raise ValidationError("username already exists")
        user.username = username
    user.role = Role.PARENT
    user.save()

    if "phone" in account_data:
        phone = account_data.get("phone", "") or ""
        if phone and ParentAccount.objects.exclude(pk=account.pk).filter(phone=phone).exists():
            raise ValidationError("phone already exists")
        account.phone = phone
    if "email" in account_data:
        account.email = account_data.get("email", "") or ""
    if "telegram_chat_id" in account_data:
        account.telegram_chat_id = account_data.get("telegram_chat_id", "") or ""
    if "preferred_language" in account_data:
        account.preferred_language = (account_data.get("preferred_language", "") or "").lower()
    account.full_clean(exclude=["user"])
    account.save()
    return account


def _apply_client_account_data(account, data):
    """Client write allowlist; raw provider IDs can be removed but never set."""
    account_data = _account_data(data)
    user = account.user
    if "email" in account_data:
        email, _ = _portal_identity(
            account_data.get("email"), user.username, exclude_user_id=user.id)
        account_data = {**account_data, "email": email}
    for field in ("first_name", "last_name", "email"):
        if field in account_data:
            setattr(user, field, account_data.get(field, "") or "")
    user.save(update_fields=["first_name", "last_name", "email"])
    if "phone" in account_data:
        phone = account_data.get("phone", "") or ""
        if phone and ParentAccount.objects.exclude(pk=account.pk).filter(phone=phone).exists():
            raise ValidationError("phone already exists")
        account.phone = phone
    if "email" in account_data:
        account.email = account_data.get("email", "") or ""
    if "preferred_language" in account_data:
        language = (account_data.get("preferred_language", "") or "").lower()
        if language not in {"ru", "pl", "en"}:
            raise ValidationError("unsupported preferred_language")
        account.preferred_language = language
    if _bool_value(account_data.get("telegram_disconnect")):
        account.telegram_chat_id = ""
    account.full_clean(exclude=["user"])
    account.save()
    return account


def _apply_client_participant_data(participant, data):
    participant_data = _participant_data(data)
    for field in (
        "first_name", "last_name", "email", "medical_info", "contraindications",
        "emergency_contact_name", "emergency_contact_phone",
    ):
        if field in participant_data:
            setattr(participant, field, participant_data.get(field, "") or "")
    if "birth_date" in participant_data:
        participant.birth_date = _parse_date(participant_data.get("birth_date"), "birth_date")
    participant.full_clean(exclude=["parent", "group"])
    participant.save()
    return participant


def _create_account(data):
    account_data = _account_data(data)
    email, username = _portal_identity(
        account_data.get("email"), account_data.get("username"))
    phone = account_data.get("phone", "") or ""
    if phone and ParentAccount.objects.filter(phone=phone).exists():
        raise ValidationError("phone already exists")
    user = User.objects.create_user(
        username=username,
        role=Role.PARENT,
        first_name=account_data.get("first_name", "") or "",
        last_name=account_data.get("last_name", "") or "",
        email=email,
    )
    account = ParentAccount.objects.create(
        user=user,
        phone=phone,
        email=email,
        telegram_chat_id=account_data.get("telegram_chat_id", "") or "",
        preferred_language=(account_data.get("preferred_language", "") or settings.SWIMCRM_DEFAULT_LANGUAGE).lower(),
    )
    audit(data.get("_actor"), "client_account.created", account, {"source": "api"})
    return account


def _apply_participant_data(participant, data):
    participant_data = _participant_data(data)
    if not participant_data:
        return participant
    for field in (
        "first_name", "last_name", "email", "medical_info", "contraindications",
        "emergency_contact_name", "emergency_contact_phone", "admin_comments",
    ):
        if field in participant_data:
            setattr(participant, field, participant_data.get(field, "") or "")
    if "birth_date" in participant_data:
        participant.birth_date = _parse_date(participant_data.get("birth_date"), "birth_date")
    if "group_id" in participant_data:
        group_id = participant_data.get("group_id")
        participant.group = get_object_or_404(Group, pk=group_id) if group_id else None
    if "is_active" in participant_data:
        participant.is_active = _bool_value(participant_data.get("is_active"), True)
    if "is_account_holder" in participant_data:
        participant.is_account_holder = _bool_value(participant_data.get("is_account_holder"))
    if participant.is_account_holder:
        existing = Student.objects.filter(parent=participant.parent, is_account_holder=True).exclude(pk=participant.pk)
        if existing.exists():
            raise ValidationError("client already has an account-holder participant")
    if not (participant.first_name or participant.last_name):
        raise ValidationError("participant first_name or last_name is required")
    participant.full_clean(exclude=["parent"])
    participant.save()
    return participant


def _create_participant(account, data, *, is_account_holder=False):
    participant_data = _participant_data(data)
    if is_account_holder:
        participant = ensure_account_holder_participant(account)
        if participant_data:
            return _apply_participant_data(participant, {
                "participant": {**participant_data, "is_account_holder": True},
            })
        return participant
    participant = Student(
        parent=account,
        first_name=participant_data.get("first_name", "") or "",
        last_name=participant_data.get("last_name", "") or "",
        is_account_holder=is_account_holder,
    )
    return _apply_participant_data(participant, {
        "participant": {**participant_data, "is_account_holder": is_account_holder},
    })


def _trainer_data(data):
    return data.get("trainer") or data


def _group_data(data):
    return data.get("group") or data


def _subscription_type_data(data):
    return data.get("subscription_type") or data.get("subscriptionType") or data


def _required_int(value, field):
    if value in (None, ""):
        raise ValidationError(f"{field} is required")
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"{field} must be an integer") from exc


def _positive_int(value, field):
    parsed = _required_int(value, field)
    if parsed <= 0:
        raise ValidationError(f"{field} must be greater than zero")
    return parsed


def _nullable_positive_int(value, field):
    def invalid(message):
        raise ValidationError({field: message})

    if value in (None, ""):
        return None
    if isinstance(value, bool):
        invalid("Must be an integer.")
    if isinstance(value, float) and not value.is_integer():
        invalid("Must be an integer.")
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        invalid("Must be an integer.")
    if str(value).strip() not in {str(parsed), f"+{parsed}"}:
        invalid("Must be an integer.")
    if parsed <= 0:
        invalid("Must be greater than zero.")
    return parsed


def _create_trainer(data):
    trainer_data = _trainer_data(data)
    email, username = _portal_identity(
        trainer_data.get("email"), trainer_data.get("username"))
    user = User.objects.create_user(
        username=username,
        role=Role.TRAINER,
        first_name=trainer_data.get("first_name", "") or "",
        last_name=trainer_data.get("last_name", "") or "",
        email=email,
    )
    trainer = Trainer.objects.create(
        user=user,
        phone=trainer_data.get("phone", "") or "",
        is_active=_bool_value(trainer_data.get("is_active"), True),
    )
    audit(data.get("_actor"), "trainer.created", trainer, {"source": "api"})
    return trainer


def _apply_trainer_data(trainer, data):
    trainer_data = _trainer_data(data)
    user = trainer.user
    if "email" in trainer_data:
        email, _ = _portal_identity(
            trainer_data.get("email"), user.username, exclude_user_id=user.id)
        trainer_data = {**trainer_data, "email": email}
    for field in ("first_name", "last_name", "email"):
        if field in trainer_data:
            setattr(user, field, trainer_data.get(field, "") or "")
    if "user_is_active" in trainer_data:
        user.is_active = _bool_value(trainer_data.get("user_is_active"), True)
    if "username" in trainer_data and trainer_data["username"] != user.username:
        username = str(trainer_data["username"]).strip()
        if not username:
            raise ValidationError("username cannot be empty")
        if User.objects.exclude(pk=user.pk).filter(username__iexact=username).exists():
            raise ValidationError("username already exists")
        user.username = username
    user.role = Role.TRAINER
    user.save()
    if "phone" in trainer_data:
        trainer.phone = trainer_data.get("phone", "") or ""
    if "is_active" in trainer_data:
        trainer.is_active = _bool_value(trainer_data.get("is_active"), True)
    trainer.full_clean(exclude=["user"])
    trainer.save()
    return trainer


def _apply_group_data(group, data):
    group_data = _group_data(data)
    if "name" in group_data:
        group.name = group_data.get("name", "") or ""
    if "description" in group_data:
        group.description = group_data.get("description", "") or ""
    if "default_trainer_id" in group_data:
        trainer_id = group_data.get("default_trainer_id")
        group.default_trainer = get_object_or_404(Trainer, pk=trainer_id) if trainer_id else None
    if "price_minor" in group_data:
        price_minor = group_data.get("price_minor")
        group.price_minor = None if price_minor in (None, "") else int(price_minor)
        if group.price_minor is not None and group.price_minor < 0:
            raise ValidationError("group price cannot be negative")
    if "currency" in group_data:
        group.currency = group_data.get("currency") or settings.DEFAULT_CURRENCY
    if "default_capacity" in group_data:
        group.default_capacity = _nullable_positive_int(
            group_data.get("default_capacity"), "default_capacity")
    if "color_key" in group_data:
        group.color_key = validate_schedule_color_key(group_data.get("color_key"))
    if "is_active" in group_data:
        group.is_active = _bool_value(group_data.get("is_active"), True)
    if not group.name:
        raise ValidationError("group name is required")
    group.full_clean()
    group.save()
    return group


def _apply_subscription_type_data(subscription_type, data):
    subscription_type_data = _subscription_type_data(data)
    for field in ("name", "currency"):
        if field in subscription_type_data:
            setattr(subscription_type, field, subscription_type_data.get(field, "") or "")
    for field in ("price_minor", "duration_days"):
        if field in subscription_type_data:
            setattr(subscription_type, field, _required_int(subscription_type_data.get(field), field))
    if "sessions_count" in subscription_type_data:
        value = subscription_type_data.get("sessions_count")
        subscription_type.sessions_count = int(value) if value not in (None, "") else None
    if "is_individual" in subscription_type_data:
        subscription_type.is_individual = _bool_value(subscription_type_data.get("is_individual"))
    if "is_active" in subscription_type_data:
        subscription_type.is_active = _bool_value(subscription_type_data.get("is_active"), True)
    if not subscription_type.name:
        raise ValidationError("subscription type name is required")
    subscription_type.full_clean()
    subscription_type.save()
    return subscription_type


def _charge_data(data):
    return data.get("charge") or data


def _payment_data(data):
    return data.get("payment") or data


def _require_active_participant(participant, action):
    if not participant.is_active:
        raise ValidationError(f"archived participant cannot {action}")
    if participant.parent_id and not participant.parent.user.is_active:
        raise ValidationError(f"archived client account cannot {action}")
    return participant


def _create_charge_for_participant(participant, data, *, actor=None, subscription=None):
    _require_active_participant(participant, "receive new charges")
    charge_data = _charge_data(data)
    subscription_id = charge_data.get("subscription_id")
    if subscription_id:
        subscription = get_object_or_404(Subscription, pk=subscription_id, student=participant)
    charge = Charge.objects.create(
        student=participant,
        subscription=subscription,
        description=charge_data.get("description") or (
            subscription.subscription_type.name if subscription else "Charge"),
        amount_minor=int(charge_data["amount_minor"]),
        currency=charge_data.get("currency", "PLN"),
        due_date=_parse_date(charge_data.get("due_date"), "due_date") or timezone.localdate(),
        created_by=actor,
    )
    audit(actor, "charge.created", charge, {"participant_id": participant.id})
    return charge


def _create_subscription_charge(subscription, *, actor=None, due_date=None):
    subscription_type = subscription.subscription_type
    charge = Charge.objects.create(
        student=subscription.student,
        subscription=subscription,
        description=subscription_type.name,
        amount_minor=subscription_type.price_minor,
        currency=subscription_type.currency,
        due_date=due_date or subscription.start_date,
        created_by=actor,
    )
    audit(actor, "charge.created", charge, {"subscription_id": subscription.id})
    return charge


def _create_payment_for_participant(participant, data, *, actor=None):
    _require_active_participant(participant, "receive new payments")
    payment_data = _payment_data(data)
    method = normalize_payment_method(payment_data.get("method", PaymentMethod.CASH))
    if method not in PaymentMethod.values:
        raise ValidationError("invalid payment method")
    desired_status = payment_data.get("status")
    if desired_status and desired_status not in PaymentStatus.values:
        raise ValidationError("invalid payment status")
    amount_minor = _positive_int(payment_data.get("amount_minor"), "amount_minor")
    currency = payment_data.get("currency", settings.DEFAULT_CURRENCY)
    try:
        Money(amount_minor, currency)
    except (TypeError, ValueError) as exc:
        raise ValidationError(str(exc)) from exc
    payment = Payment.objects.create(
        student=participant,
        amount_minor=amount_minor,
        currency=currency,
        paid_at=_parse_date(payment_data.get("paid_at"), "paid_at") or timezone.localdate(),
        method=method,
        comment=payment_data.get("comment", "") or "",
        status=PaymentStatus.PENDING,
        source=PaymentSource.ADMIN,
        created_by=actor,
    )
    record_admin_payment_created(payment, actor)
    if desired_status == PaymentStatus.REJECTED:
        payment = reject_payment(payment, actor, payment_data.get("reason", ""))
    elif desired_status == PaymentStatus.PENDING or payment_data.get("confirm") is False:
        pass
    else:
        payment = confirm_payment(payment, actor)
    return payment


def _session_changes_from_data(data, *, current_session=None):
    changes = {}
    if "trainer_id" in data:
        trainer_id = data.get("trainer_id")
        if current_session is not None and str(current_session.trainer_id) == str(trainer_id):
            changes["trainer"] = current_session.trainer
        else:
            changes["trainer"] = get_object_or_404(
                Trainer.objects.filter(is_active=True, user__is_active=True),
                pk=trainer_id,
            )
    if "substitute_trainer_id" in data:
        trainer_id = data.get("substitute_trainer_id")
        changes["substitute_trainer"] = get_object_or_404(Trainer, pk=trainer_id) if trainer_id else None
    if "start_at" in data:
        changes["start_at"] = _parse_datetime(data.get("start_at"), "start_at")
    if "end_at" in data:
        changes["end_at"] = _parse_datetime(data.get("end_at"), "end_at")
    if "duration_minutes" in data:
        try:
            changes["duration_minutes"] = int(data.get("duration_minutes"))
        except (TypeError, ValueError) as exc:
            raise ValidationError("duration_minutes must be an integer") from exc
    if "price_minor" in data:
        value = data.get("price_minor")
        try:
            changes["price_minor"] = None if value in (None, "") else int(value)
        except (TypeError, ValueError) as exc:
            raise ValidationError("price_minor must be an integer") from exc
        if changes["price_minor"] is not None and changes["price_minor"] < 0:
            raise ValidationError("price_minor cannot be negative")
    if "currency" in data:
        changes["currency"] = (data.get("currency") or settings.DEFAULT_CURRENCY).upper()
    if "location" in data:
        changes["location"] = data.get("location", "") or ""
    if "max_participants" in data:
        changes["max_participants"] = int(data.get("max_participants"))
    if "notes" in data:
        changes["notes"] = data.get("notes", "") or ""
    if "is_cancelled" in data:
        changes["is_cancelled"] = _bool_value(data.get("is_cancelled"))
    if "group_id" in data:
        group_id = data.get("group_id")
        changes["group"] = get_object_or_404(Group, pk=group_id) if group_id else None
        if group_id:
            changes["individual_student"] = None
            changes["session_type"] = SessionType.GROUP
    if "individual_student_id" in data:
        student_id = data.get("individual_student_id")
        changes["individual_student"] = get_object_or_404(Student, pk=student_id) if student_id else None
        if student_id:
            _require_active_participant(changes["individual_student"], "be assigned to sessions")
            changes["group"] = None
            changes["session_type"] = SessionType.INDIVIDUAL
    return changes


def _create_session_from_data(data, *, actor=None):
    if "template_id" in data:
        raise ValidationError("template_id is no longer supported")
    trainer = get_object_or_404(
        Trainer.objects.filter(is_active=True, user__is_active=True),
        pk=data.get("trainer_id"),
    )
    group = None
    individual_student = None
    session_type = data.get("session_type") or SessionType.GROUP
    if data.get("individual_student_id"):
        individual_student = get_object_or_404(Student, pk=data.get("individual_student_id"))
        _require_active_participant(individual_student, "be assigned to new sessions")
        session_type = session_type if session_type in {SessionType.INDIVIDUAL, SessionType.SPLIT} else SessionType.INDIVIDUAL
    else:
        group = get_object_or_404(Group, pk=data.get("group_id"))
        session_type = SessionType.GROUP
    return create_session(
        trainer=trainer,
        start_at=_parse_datetime(data.get("start_at"), "start_at"),
        end_at=_parse_datetime(data.get("end_at"), "end_at") if data.get("end_at") else None,
        duration_minutes=data.get("duration_minutes"),
        location=data.get("location", "") or "",
        max_participants=int(data.get("max_participants")),
        group=group,
        session_type=session_type,
        individual_student=individual_student,
        manually_modified=_bool_value(data.get("is_manually_modified")),
        price_minor=data.get("price_minor"),
        currency=data.get("currency"),
        notes=data.get("notes", "") or "",
        actor=actor,
    )


def _student_queryset_for_parent(parent):
    return parent.students.select_related("group", "parent", "group__default_trainer__user")


def _student_queryset_for_client(account):
    if not account.students.exists():
        ensure_account_holder_participant(account)
    return _student_queryset_for_parent(account)


def _default_billing_student_for_client(account):
    participants = list(_student_queryset_for_parent(account).order_by("id"))
    if not participants:
        return ensure_account_holder_participant(account)
    if len(participants) == 1:
        return participants[0]
    raise ValidationError("student_id is required when the client account has multiple participants")


def _parent_from_request(request):
    user = _require_role(request, Role.PARENT)
    try:
        return user.parent_account
    except user.__class__.parent_account.RelatedObjectDoesNotExist as exc:
        raise PermissionDenied("User does not have a client profile") from exc


def _client_account_from_request(request):
    try:
        return _parent_from_request(request)
    except PermissionDenied as exc:
        raise PermissionDenied("User does not have a client profile") from exc


def _trainer_from_request(request):
    user = _require_role(request, Role.TRAINER)
    try:
        return user.trainer_profile
    except user.__class__.trainer_profile.RelatedObjectDoesNotExist as exc:
        raise PermissionDenied("User does not have a trainer profile") from exc


def _student_owned_by_parent(parent, student_id):
    return get_object_or_404(Student.objects.select_related("parent", "group"), pk=student_id, parent=parent)


def _student_owned_by_client(account, student_id):
    return _student_owned_by_parent(account, student_id)


def _participant_for_client_request(request, account):
    student_id = request.GET.get("student_id")
    if student_id:
        return _student_owned_by_client(account, student_id)
    return _default_billing_student_for_client(account)


def _participant_context(account, student):
    return {
        "participant": _client_student_payload(student),
        "student_id": student.id,
        "selection_required": account.students.count() > 1,
    }


def _session_roster(session):
    return session_roster_students(session)


def _visible_parent_sessions(students, date_from=None, date_to=None):
    group_ids = [s.group_id for s in students if s.group_id]
    student_ids = [s.id for s in students]
    qs = Session.objects.select_related(
        "group", "trainer__user", "substitute_trainer__user", "individual_student"
    ).prefetch_related("participants")
    qs = qs.filter(
        Q(group_id__in=group_ids)
        | Q(individual_student_id__in=student_ids)
        | Q(participants__student_id__in=student_ids)
    ).distinct()
    if date_from:
        qs = qs.filter(start_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(start_at__date__lte=date_to)
    return qs.order_by("start_at", "id")


def _visible_client_sessions(students, date_from=None, date_to=None):
    return _visible_parent_sessions(students, date_from, date_to)


__all__ = [name for name in globals() if not name.startswith("__")]
