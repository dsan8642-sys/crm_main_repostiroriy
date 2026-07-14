"""Small helpers to build a consistent test world."""
from datetime import date, datetime, time, timedelta

from django.utils import timezone

from accounts.models import ParentAccount, Trainer, User
from catalog.models import Group, SubscriptionType
from students.models import Student
from scheduling.models import RecurringTemplate, Weekday

_seq = iter(range(1, 10_000_000))


def _uid(prefix):
    return f"{prefix}{next(_seq)}"


def make_parent(username=None, phone=None):
    username = username or _uid("parent")
    u = User.objects.create_user(username=username, password="Str0ngPass!123", role="parent")
    phone = phone or f"+48500{next(_seq):07d}"  # unique family phone
    return ParentAccount.objects.create(user=u, phone=phone)


def make_trainer(username=None):
    username = username or _uid("coach")
    u = User.objects.create_user(username=username, password="Str0ngPass!123", role="trainer")
    return Trainer.objects.create(user=u)


def make_admin(username=None):
    username = username or _uid("admin")
    return User.objects.create_user(username=username, password="Str0ngPass!123",
                                    role="admin", is_staff=True, is_superuser=True)


def make_group(name="Дельфины"):
    return Group.objects.create(name=name)


def make_student(parent=None, group=None, first="Ян", last="Ковальский", email=""):
    parent = parent or make_parent()
    return Student.objects.create(parent=parent, group=group, first_name=first,
                                  last_name=last, email=email)


def make_sub_type(name="Абонемент 8", sessions=8, days=30, price_minor=24000):
    return SubscriptionType.objects.create(
        name=name, sessions_count=sessions, duration_days=days,
        price_minor=price_minor, currency="PLN")


def make_unlimited_type(name="Безлимит", days=30, price_minor=40000):
    return SubscriptionType.objects.create(
        name=name, sessions_count=None, duration_days=days,
        price_minor=price_minor, currency="PLN")


def make_template(group, trainer, weekday=Weekday.MON, start="17:00", end="18:00",
                  location="Бассейн A", limit=10):
    return RecurringTemplate.objects.create(
        group=group, trainer=trainer, weekday=weekday,
        start_time=time.fromisoformat(start), end_time=time.fromisoformat(end),
        location=location, max_participants=limit)


def dt(y, m, d, hh, mm=0):
    return timezone.make_aware(datetime(y, m, d, hh, mm))
