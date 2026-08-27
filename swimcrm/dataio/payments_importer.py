"""Import historical payments from .xlsx/.csv.

Column headers mirror the payments export (dataio.exports.payments_dataset):

    Клиент      — email, or "Фамилия Имя"
    Сумма       — amount in major units, e.g. "120.00" (decimal comma also accepted)
    Валюта      — ISO currency code, defaults to PLN if blank
    Дата        — paid_at, "ДД.ММ.ГГГГ" (also accepts "ГГГГ-ММ-ДД")
    Способ      — cash/bank_transfer/card/other, or their Russian labels
    Статус      — confirmed/pending/rejected, or their Russian labels;
                  blank defaults to confirmed (historical payments already collected)
    Комментарий — optional free text

Payment/Charge/PaymentEvent history is append-only (delete() raises
ValidationError on all three models — see billing.models), so a committed row
can never be undone. Preview is the only safety net; there is no rollback.
Charges are intentionally not created here — this imports payment history,
not obligations, so an imported balance may legitimately end up positive
(prepayment/overpayment) for a client migrated from another system.
"""
from dataclasses import dataclass, field
from datetime import date as date_cls
from datetime import datetime
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.db import transaction

from billing.models import (Payment, PaymentMethod, PaymentSource, PaymentStatus,
                            normalize_payment_method)
from billing.services import confirm_payment, record_admin_payment_created, reject_payment
from common.money import MINOR_UNITS, Money
from students.models import Student

from .contracts import prepare_rows
from .matching import match_student, requested

NEW, DUPLICATE, POSSIBLE_DUPLICATE, ERROR = "new", "duplicate", "possible_duplicate", "error"

METHOD_LABELS = {label.lower(): value for value, label in PaymentMethod.choices}
STATUS_LABELS = {label.lower(): value for value, label in PaymentStatus.choices}


@dataclass
class PaymentPreviewRow:
    index: int
    data: dict
    status: str = ERROR
    errors: list = field(default_factory=list)
    warnings: list = field(default_factory=list)
    resolved: dict = field(default_factory=dict)


def _resolve_student(raw):
    raw = (raw or "").strip()
    if not raw:
        return None, "Не указан клиент"
    if "@" in raw:
        student = Student.objects.select_related("parent__user").filter(email__iexact=raw).first()
        return (student, None) if student else (None, f"Клиент не найден: {raw}")
    parts = raw.split(maxsplit=1)
    last, first = (parts[0], parts[1]) if len(parts) > 1 else (parts[0], "")
    qs = Student.objects.select_related("parent__user").filter(
        last_name__iexact=last, first_name__iexact=first)
    count = qs.count()
    if count == 0:
        return None, f"Клиент не найден: {raw}"
    if count > 1:
        return None, f"Клиент неоднозначен, уточните email: {raw}"
    return qs.first(), None


def _parse_amount_minor(raw, currency):
    raw = (raw or "").strip().replace(",", ".").replace(" ", "")
    if not raw:
        return None, "Не указана сумма"
    try:
        value = Decimal(raw)
    except InvalidOperation:
        return None, f"Некорректная сумма: {raw}"
    if value <= 0:
        return None, "Сумма должна быть положительной"
    minor_units = MINOR_UNITS.get(currency, 2)
    scaled = value * (10 ** minor_units)
    if scaled != scaled.to_integral_value():
        return None, f"Сумма содержит больше {minor_units} знаков после запятой для {currency}"
    return int(scaled), None


def _parse_method(raw):
    key = (raw or "").strip().lower()
    if not key:
        return PaymentMethod.CASH, None
    normalized = str(normalize_payment_method(key) or key)
    if normalized in PaymentMethod.values:
        return normalized, None
    if key in METHOD_LABELS:
        return METHOD_LABELS[key], None
    return None, f"Некорректный способ оплаты: {raw}"


def _parse_status(raw):
    key = (raw or "").strip().lower()
    if not key:
        return PaymentStatus.CONFIRMED, None
    if key in PaymentStatus.values:
        return key, None
    if key in STATUS_LABELS:
        return STATUS_LABELS[key], None
    return None, f"Некорректный статус: {raw}"


def _parse_paid_at(raw):
    raw = (raw or "").strip()
    if not raw:
        return None, "Не указана дата оплаты"
    for fmt in ("%Y-%m-%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(raw, fmt).date(), None
        except ValueError:
            continue
    return None, f"Некорректная дата (ожидается ДД.ММ.ГГГГ): {raw}"


def preview(headers, rows, mapping=None):
    """Validate + classify each row (new / duplicate / error). No DB writes."""
    rows = prepare_rows("payments", headers, rows, mapping)["rows"]
    result = []
    seen_record_ids = set()
    seen_reference_ids = set()
    for i, row in enumerate(rows, start=2):  # row 1 = header
        d = {(k or "").strip(): ("" if v is None else str(v).strip())
             for k, v in row.items()}
        pr = PaymentPreviewRow(index=i, data=d)
        record_id = str(d.get("record_id") or "").strip()
        if record_id:
            if record_id in seen_record_ids:
                pr.errors.append("Повторяющийся Internal ID в файле")
            seen_record_ids.add(record_id)

        create_client = requested(d.get("create_client"))
        matched = match_student(d)
        student = matched.student
        if student is None and not create_client:
            pr.errors.append(matched.reason or "Клиент не найден")
        if create_client:
            if not str(d.get("client_first_name") or "").strip() and not str(d.get("client_last_name") or "").strip():
                pr.errors.append("Для создания клиента укажите имя или фамилию")
            if not str(d.get("client_email") or "").strip() and not str(d.get("client_phone") or "").strip():
                pr.errors.append("Для создания клиента укажите email или телефон")

        currency = (d.get("currency") or "PLN").strip().upper()
        if currency not in MINOR_UNITS:
            pr.errors.append(f"Неподдерживаемая валюта: {currency}")

        amount_minor, err = _parse_amount_minor(d.get("amount"), currency)
        exported_minor = d.get("amount_minor")
        if exported_minor not in (None, ""):
            try:
                exported_minor = int(exported_minor)
            except (TypeError, ValueError):
                pr.errors.append(f"Некорректная сумма в minor units: {exported_minor}")
            else:
                if amount_minor is None:
                    amount_minor = exported_minor
                    err = None
                elif amount_minor != exported_minor:
                    pr.errors.append("Сумма и amount_minor не совпадают")
        if err:
            pr.errors.append(err)
        elif currency in MINOR_UNITS:
            try:
                Money(amount_minor, currency)
            except (TypeError, ValueError) as exc:
                pr.errors.append(str(exc))

        paid_at, err = _parse_paid_at(d.get("paid_at"))
        if err:
            pr.errors.append(err)

        method, err = _parse_method(d.get("method"))
        if err:
            pr.errors.append(err)

        status, err = _parse_status(d.get("status"))
        if err:
            pr.errors.append(err)

        if pr.errors:
            pr.status = ERROR
            result.append(pr)
            continue

        reference_id = (d.get("reference_id") or "").strip()[:128]
        same_payment = Payment.objects.none() if student is None else Payment.objects.filter(
            student=student, amount_minor=amount_minor, currency=currency,
            paid_at=paid_at, method=method)
        if reference_id:
            is_dup = (reference_id.casefold() in seen_reference_ids
                      or Payment.objects.filter(reference_id=reference_id).exists())
            pr.status = DUPLICATE if is_dup else NEW
            if is_dup:
                pr.errors.append("Платёж с таким Reference ID уже существует")
            seen_reference_ids.add(reference_id.casefold())
        elif same_payment.exists():
            pr.status = POSSIBLE_DUPLICATE
            pr.errors.append("Вероятный дубликат: подтвердите импорт вручную или укажите Reference ID")
        else:
            pr.status = NEW
        pr.resolved = {
            "student_id": student.id if student else None,
            "create_client": create_client,
            "client_data": {
                "first_name": d.get("client_first_name", ""),
                "last_name": d.get("client_last_name", ""),
                "email": d.get("client_email", ""),
                "phone": d.get("client_phone", ""),
                "birth_date": d.get("client_birth_date", ""),
            },
            "amount_minor": amount_minor, "currency": currency,
            "paid_at": paid_at.isoformat(), "method": method, "status": status,
            "reference_id": reference_id,
            "comment": d.get("comment", ""),
            "matching_reason": ("Новый клиент будет создан после подтверждения" if create_client else matched.reason),
            "matching_confidence": ("manual_create" if create_client else matched.confidence),
            "matching_candidates": matched.candidates,
        }
        result.append(pr)
    return result


@transaction.atomic
def commit(preview_rows, *, actor=None, approve_possible_duplicates=False):
    """Apply NEW rows. Everything else is skipped. No rollback: Payment/Charge/
    PaymentEvent history is immutable by design — preview is the safety net."""
    created = skipped = 0
    created_ids = []
    created_client_ids = []
    errors = []

    for pr in preview_rows:
        if pr.status not in (NEW, POSSIBLE_DUPLICATE):
            skipped += 1
            continue
        if pr.status == POSSIBLE_DUPLICATE and not approve_possible_duplicates:
            skipped += 1
            continue
        try:
            with transaction.atomic():
                r = pr.resolved
                paid_at = date_cls.fromisoformat(r["paid_at"])
                if r.get("create_client"):
                    from accounts.models import ParentAccount, Role, User
                    client_data = r.get("client_data") or {}
                    email = str(client_data.get("email") or "").strip()
                    phone = str(client_data.get("phone") or "").strip()
                    if email and Student.objects.filter(email__iexact=email).exists():
                        raise ValidationError("Клиент с таким email уже существует")
                    if phone and ParentAccount.objects.filter(phone=phone).exists():
                        raise ValidationError("Семья с таким телефоном уже существует; выберите участника вручную")
                    base = email or phone or "imported-client"
                    username = f"imp_{base}"[:150]
                    suffix = 1
                    while User.objects.filter(username=username).exists():
                        suffix += 1
                        username = f"imp_{base}_{suffix}"[:150]
                    user = User.objects.create_user(
                        username=username,
                        role=Role.PARENT,
                        first_name=str(client_data.get("first_name") or "").strip(),
                        last_name=str(client_data.get("last_name") or "").strip(),
                        email=email,
                    )
                    user.set_unusable_password()
                    user.save(update_fields=["password"])
                    parent = ParentAccount.objects.create(user=user, phone=phone, email=email)
                    birth_date = None
                    if client_data.get("birth_date"):
                        birth_date = date_cls.fromisoformat(str(client_data["birth_date"]).strip())
                    student = Student.objects.create(
                        parent=parent,
                        first_name=str(client_data.get("first_name") or "").strip(),
                        last_name=str(client_data.get("last_name") or "").strip(),
                        email=email,
                        birth_date=birth_date,
                    )
                    created_client_ids.append(student.id)
                else:
                    student = Student.objects.select_related("parent__user").get(pk=r["student_id"])
                # Re-check the duplicate guard at commit time too: data may have
                # changed since preview, and a written payment cannot be undone.
                if r.get("reference_id"):
                    duplicate_exists = Payment.objects.filter(reference_id=r["reference_id"]).exists()
                else:
                    duplicate_exists = Payment.objects.filter(
                        student=student, amount_minor=r["amount_minor"], currency=r["currency"],
                        paid_at=paid_at, method=r["method"]).exists() and not approve_possible_duplicates
                if duplicate_exists:
                    skipped += 1
                    continue
                payment = Payment.objects.create(
                    student=student, amount_minor=r["amount_minor"], currency=r["currency"],
                    paid_at=paid_at, method=r["method"], reference_id=r.get("reference_id", ""),
                    comment=r.get("comment", ""),
                    status=PaymentStatus.PENDING, source=PaymentSource.ADMIN, created_by=actor)
                record_admin_payment_created(payment, actor)
                if r["status"] == PaymentStatus.CONFIRMED:
                    confirm_payment(payment, actor)
                elif r["status"] == PaymentStatus.REJECTED:
                    reject_payment(payment, actor, "Импортировано как отклонённый платёж")
                created_ids.append(payment.id)
                created += 1
        except ValidationError as exc:
            message = "; ".join(exc.messages) if hasattr(exc, "messages") else str(exc)
            errors.append(f"Строка {pr.index}: {message}")
            skipped += 1

    return {"created": created, "skipped": skipped, "created_ids": created_ids,
            "created_client_ids": created_client_ids, "errors": errors}
