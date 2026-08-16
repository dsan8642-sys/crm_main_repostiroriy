import json
import re
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
    charge_statuses, confirm_payment, create_admin_payment,
    create_client_top_up_request,
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
                                 promote_waitlist_entry, require_mutable_split_roster,
                                 split_second_participant,
                                 session_roster_students, split_roster_student_ids,
                                 split_roster_students)
from scheduling.services import sync_split_second_student
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
    except (TypeError, ValueError) as exc:
        raise _field_validation_error(
            field, "Укажите корректную дату.", code="invalid_date") from exc


def _parse_time(value, field):
    if value in (None, ""):
        return None
    try:
        return time.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise _field_validation_error(
            field, "Укажите время в формате ЧЧ:ММ.", code="invalid_time") from exc


def _parse_datetime(value, field):
    if value in (None, ""):
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError as exc:
        raise _field_validation_error(
            field, "Укажите корректные дату и время.", code="invalid_datetime") from exc
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


def _object_for_field(queryset, value, field, label):
    if value in (None, ""):
        raise _field_validation_error(
            field, f"Выберите {label}.", code="required")
    if isinstance(value, bool) or (
            isinstance(value, float) and not value.is_integer()):
        raise _field_validation_error(
            field, f"Выбранный {label} недоступен.", code="invalid_choice")
    try:
        object_id = int(value)
        if object_id <= 0:
            raise ValueError
        return queryset.get(pk=object_id)
    except (queryset.model.DoesNotExist, TypeError, ValueError) as exc:
        raise _field_validation_error(
            field, f"Выбранный {label} недоступен.", code="invalid_choice") from exc


def _unique_username(base):
    base = (base or "client").strip()[:140] or "client"
    username = base
    counter = 1
    while (
        User.objects.filter(
            Q(username__iexact=username) | Q(email__iexact=username)
        ).exists()
        or ParentAccount.objects.filter(email__iexact=username).exists()
        or (
            re.fullmatch(r"[\d\s()+.-]+", username)
            and _phone_in_accounts(ParentAccount.objects.all(), username)
        )
    ):
        counter += 1
        username = f"{base}.{counter}"[:150]
    return username


def _field_name(prefix, name):
    return f"{prefix}.{name}" if prefix else name


def _phone_digits(value):
    return re.sub(r"\D", "", str(value or ""))


def _phone_in_accounts(accounts, value):
    digits = _phone_digits(value)
    return bool(digits) and any(
        _phone_digits(phone) == digits
        for phone in accounts.exclude(phone="").values_list("phone", flat=True)
    )


def _phone_in_usernames(users, value):
    digits = _phone_digits(value)
    return bool(digits) and any(
        re.fullmatch(r"[\d\s()+.-]+", username or "")
        and _phone_digits(username) == digits
        for username in users.values_list("username", flat=True)
    )


def _field_validation_error(field, message, *, code="invalid"):
    return ValidationError({field: ValidationError(message, code=code)})


def _name_login(first_name, last_name):
    raw = ".".join(
        part for part in (
            str(first_name or "").strip().lower(),
            str(last_name or "").strip().lower(),
        ) if part
    )
    cleaned = re.sub(r"[^\w.@+-]+", ".", raw, flags=re.UNICODE)
    cleaned = re.sub(r"\.{2,}", ".", cleaned).strip(".@+-_")
    return cleaned or "client"


def _validate_login(login, field):
    try:
        User._meta.get_field("username").run_validators(login)
    except ValidationError as exc:
        raise _field_validation_error(
            field,
            "Логин может содержать только буквы, цифры и символы @/./+/-/_.",
            code=getattr(exc, "code", None) or "invalid",
        ) from exc


def _portal_identity(
        email, username, phone=None, first_name=None, last_name=None, *,
        exclude_user_id=None, field_prefix=""):
    email = str(email or "").strip().lower()
    username = str(username or "").strip()
    phone_value = str(phone or "").strip()
    phone_login = _phone_digits(phone_value)
    email_field = _field_name(field_prefix, "email")
    username_field = _field_name(field_prefix, "username")
    phone_field = _field_name(field_prefix, "phone")

    if email:
        try:
            User._meta.get_field("email").run_validators(email)
        except ValidationError as exc:
            raise _field_validation_error(
                email_field, "Введите корректный email.", code="invalid",
            ) from exc
    if phone_value and not phone_login:
        raise _field_validation_error(
            phone_field, "Укажите телефон, содержащий цифры.", code="invalid")

    users = User.objects.all()
    accounts = ParentAccount.objects.all()
    if exclude_user_id is not None:
        users = users.exclude(pk=exclude_user_id)
        accounts = accounts.exclude(user_id=exclude_user_id)
    if username:
        login = username
        source = "manual"
    elif email:
        login = email
        source = "email"
    elif phone_login:
        login = phone_login
        source = "phone"
    else:
        login = _unique_username(_name_login(first_name, last_name))
        source = "name"

    _validate_login(login, username_field)

    if email and (
        users.filter(email__iexact=email).exists()
        or users.filter(username__iexact=email).exists()
        or accounts.filter(email__iexact=email).exists()
    ):
        fields = [email_field]
        message = "Этот email уже используется."
        if source == "email":
            fields.append(username_field)
            message = (
                "Этот email уже используется как логин. "
                "Измените email или логин."
            )
        raise ValidationError({
            field: ValidationError(message, code="duplicate")
            for field in fields
        })

    phone_contact_conflict = phone_login and (
        _phone_in_accounts(accounts, phone_login)
        or _phone_in_usernames(users, phone_login)
    )
    if phone_contact_conflict:
        fields = [phone_field]
        message = "Этот телефон уже используется."
        if source == "phone":
            fields.append(username_field)
            message = (
                "Этот телефон уже используется как логин. "
                "Измените телефон или логин."
            )
        raise ValidationError({
            field: ValidationError(message, code="duplicate")
            for field in fields
        })

    login_matches_phone = (
        re.fullmatch(r"[\d\s()+.-]+", login)
        and (
            _phone_in_accounts(accounts, login)
            or _phone_in_usernames(users, login)
        )
    )
    login_conflict = (
        users.filter(username__iexact=login).exists()
        or users.filter(email__iexact=login).exists()
        or accounts.filter(email__iexact=login).exists()
        or login_matches_phone
    )
    if login_conflict:
        message = "Этот логин уже используется."
        fields = [username_field]
        if source == "email":
            message = "Этот email уже используется как логин. Измените email или логин."
            fields.insert(0, email_field)
        elif source == "phone":
            message = "Этот телефон уже используется как логин. Измените телефон или логин."
            fields.insert(0, phone_field)
        raise ValidationError({
            field: ValidationError(message, code="duplicate")
            for field in fields
        })
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
    roster = []
    roster_ids = set()
    if (
        session.session_type in {SessionType.INDIVIDUAL, SessionType.SPLIT}
        and session.individual_student_id
    ):
        student = session.individual_student
        roster.append({"id": student.id, "full_name": student.full_name})
        roster_ids.add(student.id)
        prefetched = getattr(session, "_prefetched_objects_cache", {}).get("participants")
        participant_rows = (
            sorted(
                (
                    participant for participant in prefetched
                    if participant.status == SessionParticipantStatus.ACTIVE
                ),
                key=lambda participant: (participant.created_at, participant.id),
            )
            if prefetched is not None
            else session.participants.filter(
                status=SessionParticipantStatus.ACTIVE,
            ).select_related("student", "student__parent__user").order_by("created_at", "id")
        )
        for participant in participant_rows:
            if participant.student_id not in roster_ids:
                roster.append({
                    "id": participant.student_id,
                    "full_name": participant.student.full_name,
                })
                roster_ids.add(participant.student_id)
    participants_count = (
        len(roster)
        if session.session_type in {SessionType.INDIVIDUAL, SessionType.SPLIT}
        else _session_roster(session).count()
    )
    second_participant = (
        split_second_participant(session)
        if session.session_type == SessionType.SPLIT else None
    )
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
        "participants_count": participants_count,
        "roster": roster,
        "second_student_id": (
            second_participant.student_id if second_participant else None
        ),
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
        entry.student = _object_for_field(
            Student.objects.select_related("parent__user"),
            data.get("student_id"), "student_id", "участника")
        _require_active_participant(
            entry.student, "be added to the waitlist", field="student_id")
    if "priority" in data:
        try:
            entry.priority = int(data.get("priority") or 0)
        except (TypeError, ValueError) as exc:
            raise _field_validation_error(
                "priority", "Приоритет должен быть целым числом.",
                code="invalid") from exc
    if "status" in data:
        status = data.get("status")
        if status not in WaitlistStatus.values:
            raise _field_validation_error(
                "status", "Выберите допустимый статус листа ожидания.",
                code="invalid_choice")
        entry.status = status
    if "note" in data:
        entry.note = data.get("note", "") or ""
    entry.full_clean()
    entry.save()
    return entry


def _trainer_payload(trainer):
    user = trainer.user
    groups_count = getattr(trainer, "active_groups_count", None)
    if groups_count is None:
        groups_count = trainer.default_groups.filter(is_active=True).count()
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
        "groups_count": groups_count,
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
    payload = {
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
        "participants_count": getattr(group, "active_participants_count", None),
    }
    if payload["participants_count"] is None:
        payload["participants_count"] = group.students.filter(
            is_active=True,
            parent__user__is_active=True,
        ).count()
    if hasattr(group, "next_session_start"):
        payload["next_session"] = {
            "start_at": timezone.localtime(group.next_session_start).isoformat(),
            "location": group.next_session_location or "",
        } if group.next_session_start else None
    return payload


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
    account = getattr(payment.student, "parent", None)
    account_user = getattr(account, "user", None)
    client_name = ""
    if account_user is not None:
        client_name = account_user.get_full_name() or account_user.username
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
        "client_id": getattr(account, "id", None),
        "client": client_name,
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
    if any(field in account_data for field in ("email", "username", "phone")):
        email, username = _portal_identity(
            account_data.get("email", user.email),
            account_data.get("username", user.username),
            account_data.get("phone", account.phone),
            user.first_name,
            user.last_name,
            exclude_user_id=user.id,
            field_prefix="account",
        )
        account_data = {**account_data, "email": email, "username": username}
    for field in ("first_name", "last_name", "email"):
        if field in account_data:
            setattr(user, field, account_data.get(field, "") or "")
    if "is_active" in account_data:
        user.is_active = _bool_value(account_data.get("is_active"), True)
    if "username" in account_data and account_data["username"] != user.username:
        user.username = account_data["username"]
    user.role = Role.PARENT
    user.save()

    if "phone" in account_data:
        phone = account_data.get("phone", "") or ""
        account.phone = phone
    if "email" in account_data:
        account.email = account_data.get("email", "") or ""
    if "telegram_chat_id" in account_data:
        account.telegram_chat_id = account_data.get("telegram_chat_id", "") or ""
    if "preferred_language" in account_data:
        language = (account_data.get("preferred_language", "") or "").lower()
        if language not in {"ru", "pl", "en"}:
            raise _field_validation_error(
                "account.preferred_language", "Выберите поддерживаемый язык.",
                code="invalid_choice")
        account.preferred_language = language
    account.full_clean(exclude=["user"])
    account.save()
    return account


def _apply_client_account_data(account, data):
    """Client write allowlist; raw provider IDs can be removed but never set."""
    account_data = _account_data(data)
    user = account.user
    if "email" in account_data or "phone" in account_data:
        email, _ = _portal_identity(
            account_data.get("email", user.email), user.username,
            account_data.get("phone", account.phone),
            exclude_user_id=user.id, field_prefix="account")
        account_data = {**account_data, "email": email}
    for field in ("first_name", "last_name", "email"):
        if field in account_data:
            setattr(user, field, account_data.get(field, "") or "")
    user.save(update_fields=["first_name", "last_name", "email"])
    if "phone" in account_data:
        phone = account_data.get("phone", "") or ""
        account.phone = phone
    if "email" in account_data:
        account.email = account_data.get("email", "") or ""
    if "preferred_language" in account_data:
        language = (account_data.get("preferred_language", "") or "").lower()
        if language not in {"ru", "pl", "en"}:
            raise _field_validation_error(
                "account.preferred_language", "Выберите поддерживаемый язык.",
                code="invalid_choice")
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
    phone = account_data.get("phone", "") or ""
    email, username = _portal_identity(
        account_data.get("email"),
        account_data.get("username"),
        phone,
        account_data.get("first_name"),
        account_data.get("last_name"),
        field_prefix="account",
    )
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
        participant.birth_date = _parse_date(
            participant_data.get("birth_date"), "participant.birth_date")
    if "group_id" in participant_data:
        group_id = participant_data.get("group_id")
        participant.group = (
            _object_for_field(
                Group.objects.all(), group_id, "participant.group_id", "группу")
            if group_id else None)
    if "is_active" in participant_data:
        participant.is_active = _bool_value(participant_data.get("is_active"), True)
    if "is_account_holder" in participant_data:
        participant.is_account_holder = _bool_value(participant_data.get("is_account_holder"))
    if participant.is_account_holder:
        existing = Student.objects.filter(parent=participant.parent, is_account_holder=True).exclude(pk=participant.pk)
        if existing.exists():
            raise _field_validation_error(
                "participant.is_account_holder",
                "У аккаунта уже есть самостоятельный участник.",
                code="duplicate")
    if not (participant.first_name or participant.last_name):
        raise ValidationError({
            "participant.first_name": ValidationError(
                "Укажите имя или фамилию участника.", code="required"),
            "participant.last_name": ValidationError(
                "Укажите имя или фамилию участника.", code="required"),
        })
    participant.full_clean(exclude=["parent"])
    participant.save()
    return participant


def _create_participant(account, data, *, is_account_holder=False):
    participant_data = _participant_data(data)
    if is_account_holder:
        participant = ensure_account_holder_participant(account)
        if participant_data:
            holder_data = {
                key: value for key, value in participant_data.items()
                if key not in {"first_name", "last_name", "email", "is_account_holder"}
            }
            return _apply_participant_data(participant, {
                "participant": {**holder_data, "is_account_holder": True},
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
        raise _field_validation_error(
            field, "Заполните это поле.", code="required")
    if isinstance(value, bool) or (
            isinstance(value, float) and not value.is_integer()):
        raise _field_validation_error(
            field, "Укажите целое число.", code="invalid_integer")
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise _field_validation_error(
            field, "Укажите целое число.", code="invalid_integer") from exc


def _positive_int(value, field):
    parsed = _required_int(value, field)
    if parsed <= 0:
        raise _field_validation_error(
            field, "Укажите число больше нуля.", code="min_value")
    return parsed


def _nullable_positive_int(value, field):
    def invalid(message):
        raise _field_validation_error(field, message, code="invalid_integer")

    if value in (None, ""):
        return None
    if isinstance(value, bool):
        invalid("Укажите целое число.")
    if isinstance(value, float) and not value.is_integer():
        invalid("Укажите целое число.")
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        invalid("Укажите целое число.")
    if str(value).strip() not in {str(parsed), f"+{parsed}"}:
        invalid("Укажите целое число.")
    if parsed <= 0:
        invalid("Укажите число больше нуля.")
    return parsed


def _create_trainer(data):
    trainer_data = _trainer_data(data)
    email, username = _portal_identity(
        trainer_data.get("email"),
        trainer_data.get("username"),
        trainer_data.get("phone"),
        trainer_data.get("first_name"),
        trainer_data.get("last_name"),
        field_prefix="trainer",
    )
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
    if "email" in trainer_data or "username" in trainer_data:
        email, username = _portal_identity(
            trainer_data.get("email", user.email),
            trainer_data.get("username", user.username),
            trainer_data.get("phone", trainer.phone),
            user.first_name,
            user.last_name,
            exclude_user_id=user.id,
            field_prefix="trainer",
        )
        trainer_data = {**trainer_data, "email": email, "username": username}
    for field in ("first_name", "last_name", "email"):
        if field in trainer_data:
            setattr(user, field, trainer_data.get(field, "") or "")
    if "user_is_active" in trainer_data:
        user.is_active = _bool_value(trainer_data.get("user_is_active"), True)
    elif "is_active" in trainer_data:
        user.is_active = _bool_value(trainer_data.get("is_active"), True)
    if "username" in trainer_data and trainer_data["username"] != user.username:
        user.username = trainer_data["username"]
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
        group.default_trainer = (
            _object_for_field(
                Trainer.objects.filter(is_active=True, user__is_active=True),
                trainer_id, "default_trainer_id", "тренера")
            if trainer_id else None)
    if "price_minor" in group_data:
        price_minor = group_data.get("price_minor")
        try:
            group.price_minor = None if price_minor in (None, "") else int(price_minor)
        except (TypeError, ValueError) as exc:
            raise _field_validation_error(
                "price_minor", "Укажите корректную цену.",
                code="invalid_integer") from exc
        if group.price_minor is not None and group.price_minor < 0:
            raise _field_validation_error(
                "price_minor", "Цена не может быть отрицательной.",
                code="min_value")
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
        raise _field_validation_error(
            "name", "Укажите название группы.", code="required")
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
        subscription_type.sessions_count = (
            _positive_int(value, "sessions_count")
            if value not in (None, "") else None)
    if "is_individual" in subscription_type_data:
        subscription_type.is_individual = _bool_value(subscription_type_data.get("is_individual"))
    if "is_active" in subscription_type_data:
        subscription_type.is_active = _bool_value(subscription_type_data.get("is_active"), True)
    if not subscription_type.name:
        raise _field_validation_error(
            "name", "Укажите название абонемента.", code="required")
    subscription_type.full_clean()
    subscription_type.save()
    return subscription_type


def _charge_data(data):
    return data.get("charge") or data


def _payment_data(data):
    return data.get("payment") or data


def _require_active_participant(participant, action, field=None):
    if not participant.is_active:
        if field:
            raise _field_validation_error(
                field, "Выбранный участник находится в архиве.",
                code="invalid_choice")
        raise ValidationError(f"archived participant cannot {action}")
    if participant.parent_id and not participant.parent.user.is_active:
        if field:
            raise _field_validation_error(
                field, "Аккаунт выбранного участника находится в архиве.",
                code="invalid_choice")
        raise ValidationError(f"archived client account cannot {action}")
    return participant


def _create_charge_for_participant(participant, data, *, actor=None, subscription=None):
    _require_active_participant(
        participant, "receive new charges", field="participant_id")
    charge_data = _charge_data(data)
    subscription_id = charge_data.get("subscription_id")
    if subscription_id:
        subscription = _object_for_field(
            Subscription.objects.filter(student=participant), subscription_id,
            "subscription_id", "абонемент")
    amount_minor = _positive_int(charge_data.get("amount_minor"), "amount_minor")
    currency = charge_data.get("currency", settings.DEFAULT_CURRENCY)
    try:
        Money(amount_minor, currency)
    except (TypeError, ValueError) as exc:
        raise _field_validation_error(
            "currency", "Укажите поддерживаемую валюту.",
            code="invalid_choice") from exc
    charge = Charge.objects.create(
        student=participant,
        subscription=subscription,
        description=charge_data.get("description") or (
            subscription.subscription_type.name if subscription else "Charge"),
        amount_minor=amount_minor,
        currency=currency,
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
    _require_active_participant(
        participant, "receive new payments", field="participant_id")
    payment_data = _payment_data(data)
    method = normalize_payment_method(payment_data.get("method", PaymentMethod.CASH))
    if method not in PaymentMethod.values:
        raise _field_validation_error(
            "method", "Выберите допустимый способ оплаты.",
            code="invalid_choice")
    desired_status = payment_data.get("status")
    if desired_status and desired_status not in PaymentStatus.values:
        raise _field_validation_error(
            "status", "Выберите допустимый статус платежа.",
            code="invalid_choice")
    amount_minor = _positive_int(payment_data.get("amount_minor"), "amount_minor")
    currency = payment_data.get("currency", settings.DEFAULT_CURRENCY)
    try:
        Money(amount_minor, currency)
    except (TypeError, ValueError) as exc:
        raise _field_validation_error(
            "currency", "Укажите поддерживаемую валюту.",
            code="invalid_choice") from exc
    if desired_status == PaymentStatus.REJECTED:
        final_status = PaymentStatus.REJECTED
    elif desired_status == PaymentStatus.PENDING or payment_data.get("confirm") is False:
        final_status = PaymentStatus.PENDING
    else:
        final_status = PaymentStatus.CONFIRMED
    payment, created = create_admin_payment(
        student=participant,
        actor=actor,
        amount_minor=amount_minor,
        currency=currency,
        paid_at=_parse_date(payment_data.get("paid_at"), "paid_at") or timezone.localdate(),
        method=method,
        idempotency_key=payment_data.get("idempotency_key"),
        comment=payment_data.get("comment", "") or "",
        desired_status=final_status,
        reason=payment_data.get("reason", "") or "",
    )
    return payment, created


def _session_changes_from_data(data, *, current_session=None):
    changes = {}
    current_type = getattr(current_session, "session_type", SessionType.GROUP)
    requested_type = data.get("session_type") or current_type
    if requested_type not in {
            SessionType.GROUP, SessionType.INDIVIDUAL, SessionType.SPLIT}:
        raise _field_validation_error(
            "session_type", "Выберите корректный тип занятия.",
            code="invalid_choice")
    if "session_type" in data:
        changes["session_type"] = requested_type
    if "trainer_id" in data:
        trainer_id = data.get("trainer_id")
        if current_session is not None and str(current_session.trainer_id) == str(trainer_id):
            changes["trainer"] = current_session.trainer
        else:
            changes["trainer"] = _object_for_field(
                Trainer.objects.filter(is_active=True, user__is_active=True),
                trainer_id,
                "trainer_id",
                "тренера",
            )
    if "substitute_trainer_id" in data:
        trainer_id = data.get("substitute_trainer_id")
        changes["substitute_trainer"] = (
            _object_for_field(
                Trainer.objects.all(), trainer_id,
                "substitute_trainer_id", "замещающего тренера")
            if trainer_id else None)
    if "start_at" in data:
        changes["start_at"] = _parse_datetime(data.get("start_at"), "start_at")
        if changes["start_at"] is None:
            raise _field_validation_error(
                "start_at", "Укажите дату и время начала.", code="required")
    if "end_at" in data:
        changes["end_at"] = _parse_datetime(data.get("end_at"), "end_at")
    if "duration_minutes" in data:
        changes["duration_minutes"] = _required_int(
            data.get("duration_minutes"), "duration_minutes")
    if "price_minor" in data:
        value = data.get("price_minor")
        changes["price_minor"] = (
            None if value in (None, "")
            else _required_int(value, "price_minor"))
        if changes["price_minor"] is not None and changes["price_minor"] < 0:
            raise _field_validation_error(
                "price_minor", "Цена не может быть отрицательной.",
                code="min_value")
    if "currency" in data:
        changes["currency"] = (data.get("currency") or settings.DEFAULT_CURRENCY).upper()
    if "location" in data:
        changes["location"] = data.get("location", "") or ""
        if not changes["location"].strip():
            raise _field_validation_error(
                "location", "Выберите локацию.", code="required")
    if "max_participants" in data:
        changes["max_participants"] = _positive_int(
            data.get("max_participants"), "max_participants")
    if "notes" in data:
        changes["notes"] = data.get("notes", "") or ""
    if "is_cancelled" in data:
        changes["is_cancelled"] = _bool_value(data.get("is_cancelled"))
    if "group_id" in data:
        group_id = data.get("group_id")
        changes["group"] = (
            _object_for_field(
                Group.objects.all(), group_id, "group_id", "группу")
            if group_id else None)
    if "individual_student_id" in data:
        student_id = data.get("individual_student_id")
        changes["individual_student"] = (
            _object_for_field(
                Student.objects.select_related("parent__user"), student_id,
                "individual_student_id", "участника")
            if student_id else None)
        if student_id:
            _require_active_participant(
                changes["individual_student"], "be assigned to sessions",
                field="individual_student_id")
    final_type = changes.get("session_type", current_type)
    final_group = changes.get("group", getattr(current_session, "group", None))
    final_student = changes.get(
        "individual_student",
        getattr(current_session, "individual_student", None),
    )
    if final_type == SessionType.GROUP:
        if "individual_student_id" in data and "session_type" not in data:
            raise _field_validation_error(
                "individual_student_id",
                "Для группового занятия выберите группу.",
                code="invalid_choice")
        if final_group is None:
            raise _field_validation_error(
                "group_id", "Выберите группу.", code="required")
        changes["individual_student"] = None
    else:
        if "group_id" in data and "session_type" not in data:
            raise _field_validation_error(
                "group_id",
                "Для индивидуального или split-занятия выберите участника.",
                code="invalid_choice")
        if final_student is None:
            raise _field_validation_error(
                "individual_student_id", "Выберите участника.",
                code="required")
        changes["group"] = None
    return changes


_SECOND_STUDENT_UNSET = object()


def _split_second_student_from_data(
        data, *, session_type, individual_student):
    if "second_student_id" not in data:
        return _SECOND_STUDENT_UNSET
    student_id = data.get("second_student_id")
    if session_type != SessionType.SPLIT:
        raise _field_validation_error(
            "second_student_id",
            "Второго клиента можно выбрать только для Split-тренировки.",
            code="invalid_choice",
        )
    if student_id in (None, ""):
        return None
    second_student = _object_for_field(
        Student.objects.select_related("parent__user"),
        student_id,
        "second_student_id",
        "второго участника",
    )
    _require_active_participant(
        second_student, "be assigned to split sessions",
        field="second_student_id")
    if individual_student and second_student.id == individual_student.id:
        raise _field_validation_error(
            "second_student_id",
            "Выберите другого второго клиента.",
            code="duplicate",
        )
    return second_student


def _ensure_capacity_for_roster(session):
    if session.session_type != SessionType.SPLIT:
        return
    roster_size = len(split_roster_student_ids(session))
    if session.max_participants < roster_size:
        raise _field_validation_error(
            "max_participants",
            f"Лимит не может быть меньше текущего состава ({roster_size}).",
            code="capacity_below_roster",
        )


@transaction.atomic
def _create_session_from_data(data, *, actor=None):
    if "template_id" in data:
        raise _field_validation_error(
            "template_id", "Создание занятия по шаблону больше не поддерживается.",
            code="unsupported")
    trainer = _object_for_field(
        Trainer.objects.filter(is_active=True, user__is_active=True),
        data.get("trainer_id"),
        "trainer_id",
        "тренера",
    )
    group = None
    individual_student = None
    requested_type = data.get("session_type")
    session_type = requested_type or (
        SessionType.INDIVIDUAL
        if data.get("individual_student_id") else SessionType.GROUP)
    if session_type not in {SessionType.GROUP, SessionType.INDIVIDUAL, SessionType.SPLIT}:
        raise _field_validation_error(
            "session_type", "Выберите корректный тип занятия.",
            code="invalid_choice")
    if session_type in {SessionType.INDIVIDUAL, SessionType.SPLIT}:
        individual_student = _object_for_field(
            Student.objects.select_related("parent__user"),
            data.get("individual_student_id"),
            "individual_student_id",
            "участника",
        )
        _require_active_participant(
            individual_student, "be assigned to new sessions",
            field="individual_student_id")
    else:
        group = _object_for_field(
            Group.objects.all(), data.get("group_id"), "group_id", "группу")
        session_type = SessionType.GROUP
    start_at = _parse_datetime(data.get("start_at"), "start_at")
    if start_at is None:
        raise _field_validation_error(
            "start_at", "Укажите дату и время начала.", code="required")
    location = str(data.get("location", "") or "").strip()
    if not location:
        raise _field_validation_error(
            "location", "Выберите локацию.", code="required")
    max_participants = _positive_int(
        data.get("max_participants"), "max_participants")
    second_student = _split_second_student_from_data(
        data,
        session_type=session_type,
        individual_student=individual_student,
    )
    if second_student is not _SECOND_STUDENT_UNSET and second_student is not None:
        if max_participants < 2:
            raise _field_validation_error(
                "max_participants",
                "Для двух клиентов установите лимит не меньше 2.",
                code="capacity_below_roster",
            )
    price_minor = data.get("price_minor")
    if price_minor not in (None, ""):
        price_minor = _required_int(price_minor, "price_minor")
        if price_minor < 0:
            raise _field_validation_error(
                "price_minor", "Цена не может быть отрицательной.",
                code="min_value")
    else:
        price_minor = None
    session = create_session(
        trainer=trainer,
        start_at=start_at,
        end_at=_parse_datetime(data.get("end_at"), "end_at") if data.get("end_at") else None,
        duration_minutes=data.get("duration_minutes"),
        location=location,
        max_participants=max_participants,
        group=group,
        session_type=session_type,
        individual_student=individual_student,
        manually_modified=_bool_value(data.get("is_manually_modified")),
        price_minor=price_minor,
        currency=data.get("currency"),
        notes=data.get("notes", "") or "",
        actor=actor,
    )
    if second_student is not _SECOND_STUDENT_UNSET and second_student is not None:
        sync_split_second_student(session, second_student, actor=actor)
    _ensure_capacity_for_roster(session)
    return session


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
    raise _field_validation_error(
        "student_id", "Выберите участника аккаунта.", code="required")


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
        | Q(
            participants__student_id__in=student_ids,
            participants__status=SessionParticipantStatus.ACTIVE,
        )
    ).distinct()
    if date_from:
        qs = qs.filter(start_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(start_at__date__lte=date_to)
    return qs.order_by("start_at", "id")


def _visible_client_sessions(students, date_from=None, date_to=None):
    return _visible_parent_sessions(students, date_from, date_to)


__all__ = [name for name in globals() if not name.startswith("__")]
