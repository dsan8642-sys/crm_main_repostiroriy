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

NEW, DUPLICATE, POSSIBLE_DUPLICATE, ERROR = "new", "duplicate", "possible_duplicate", "error"

METHOD_LABELS = {label.lower(): value for value, label in PaymentMethod.choices}
STATUS_LABELS = {label.lower(): value for value, label in PaymentStatus.choices}


@dataclass
class PaymentPreviewRow:
    index: int
    data: dict
    status: str = ERROR
    errors: list = field(default_factory=list)
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
    for fmt in ("%d.%m.%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).date(), None
        except ValueError:
            continue
    return None, f"Некорректная дата (ожидается ДД.ММ.ГГГГ): {raw}"


def preview(headers, rows):
    """Validate + classify each row (new / duplicate / error). No DB writes."""
    result = []
    for i, row in enumerate(rows, start=2):  # row 1 = header
        d = {(k or "").strip(): (v or "").strip() for k, v in row.items()}
        pr = PaymentPreviewRow(index=i, data=d)

        student, err = _resolve_student(d.get("Клиент"))
        if err:
            pr.errors.append(err)

        currency = (d.get("Валюта") or "PLN").strip().upper()
        if currency not in MINOR_UNITS:
            pr.errors.append(f"Неподдерживаемая валюта: {currency}")

        amount_minor, err = _parse_amount_minor(d.get("Сумма"), currency)
        if err:
            pr.errors.append(err)
        elif currency in MINOR_UNITS:
            try:
                Money(amount_minor, currency)
            except (TypeError, ValueError) as exc:
                pr.errors.append(str(exc))

        paid_at, err = _parse_paid_at(d.get("Дата"))
        if err:
            pr.errors.append(err)

        method, err = _parse_method(d.get("Способ"))
        if err:
            pr.errors.append(err)

        status, err = _parse_status(d.get("Статус"))
        if err:
            pr.errors.append(err)

        if pr.errors:
            pr.status = ERROR
            result.append(pr)
            continue

        reference_id = (d.get("Reference ID") or d.get("ID транзакции") or "").strip()[:128]
        same_payment = Payment.objects.filter(
            student=student, amount_minor=amount_minor, currency=currency,
            paid_at=paid_at, method=method)
        if reference_id:
            is_dup = Payment.objects.filter(reference_id=reference_id).exists()
            pr.status = DUPLICATE if is_dup else NEW
            if is_dup:
                pr.errors.append("Платёж с таким Reference ID уже существует")
        elif same_payment.exists():
            pr.status = POSSIBLE_DUPLICATE
            pr.errors.append("Вероятный дубликат: подтвердите импорт вручную или укажите Reference ID")
        else:
            pr.status = NEW
        pr.resolved = {
            "student_id": student.id, "amount_minor": amount_minor, "currency": currency,
            "paid_at": paid_at.isoformat(), "method": method, "status": status,
            "reference_id": reference_id,
            "comment": d.get("Комментарий", ""),
        }
        result.append(pr)
    return result


@transaction.atomic
def commit(preview_rows, *, actor=None, approve_possible_duplicates=False):
    """Apply NEW rows. Everything else is skipped. No rollback: Payment/Charge/
    PaymentEvent history is immutable by design — preview is the safety net."""
    created = skipped = 0
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
                created += 1
        except ValidationError as exc:
            message = "; ".join(exc.messages) if hasattr(exc, "messages") else str(exc)
            errors.append(f"Строка {pr.index}: {message}")
            skipped += 1

    return {"created": created, "skipped": skipped, "errors": errors}
