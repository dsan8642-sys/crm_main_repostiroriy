"""Module 5.10: export entities (clients/payments/attendance/groups/trainers) to xlsx/CSV."""
from accounts.models import Trainer
from attendance.models import AttendanceRecord
from billing.models import Payment
from catalog.models import Group
from students.models import Student

from analytics.exporters import rows_to_csv, rows_to_xlsx


def clients_dataset():
    headers = ["Фамилия", "Имя", "Телефон", "Email", "Группа", "Родитель", "Активен"]
    rows = []
    for s in Student.objects.select_related("group", "parent__user"):
        rows.append([s.last_name, s.first_name, s.parent.phone, s.email,
                     s.group.name if s.group else "", str(s.parent),
                     "да" if s.is_active else "нет"])
    return "Клиенты", headers, rows


def payments_dataset():
    headers = ["Клиент", "Сумма", "Валюта", "Дата", "Способ", "Статус", "Подтвердил"]
    rows = []
    for p in Payment.objects.select_related("student", "confirmed_by"):
        rows.append([str(p.student), p.amount.format(), p.currency, p.paid_at,
                     p.get_method_display(), p.get_status_display(),
                     str(p.confirmed_by) if p.confirmed_by else ""])
    return "Оплаты", headers, rows


def attendance_dataset():
    headers = ["Дата", "Клиент", "Группа", "Тренер", "Статус", "Списание"]
    rows = []
    for a in AttendanceRecord.objects.select_related("session", "student", "session__group", "session__trainer__user"):
        rows.append([a.session.start_at.strftime("%d.%m.%Y %H:%M"), str(a.student),
                     a.session.group.name if a.session.group else "",
                     str(a.session.trainer), a.get_status_display(),
                     "-1" if a.deducts else "0"])
    return "Посещаемость", headers, rows


def groups_dataset():
    headers = ["Группа", "Тренер по умолчанию", "Учеников", "Активна"]
    rows = []
    for g in Group.objects.select_related("default_trainer__user"):
        rows.append([g.name, str(g.default_trainer) if g.default_trainer else "",
                     g.students.count(), "да" if g.is_active else "нет"])
    return "Группы", headers, rows


def trainers_dataset():
    headers = ["Тренер", "Телефон", "Активен", "Групп"]
    rows = []
    for t in Trainer.objects.select_related("user"):
        rows.append([str(t), t.phone, "да" if t.is_active else "нет", t.default_groups.count()])
    return "Тренеры", headers, rows


DATASETS = {
    "clients": clients_dataset,
    "payments": payments_dataset,
    "attendance": attendance_dataset,
    "groups": groups_dataset,
    "trainers": trainers_dataset,
}


def export_entity(name, fmt="xlsx"):
    """Return (filename, content_bytes). fmt in {'xlsx','csv'}."""
    if name not in DATASETS:
        raise ValueError(f"Неизвестная сущность: {name}")
    title, headers, rows = DATASETS[name]()
    if fmt == "csv":
        return f"{name}.csv", rows_to_csv(headers, rows)
    return f"{name}.xlsx", rows_to_xlsx(title, headers, rows)
