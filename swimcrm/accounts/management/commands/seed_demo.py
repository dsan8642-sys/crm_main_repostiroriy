"""Populate a small demo world so the admin panel has something to show."""
from datetime import date, time, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import Consent, ConsentType, ParentAccount, Trainer, User
from attendance.models import AttendanceStatus
from attendance.services import set_attendance
from billing.models import Charge, Payment, PaymentStatus
from billing.services import confirm_payment
from catalog.models import Group, SubscriptionType
from notifications.models import (Channel, EventType, NotificationRule,
                                  NotificationTemplate)
from scheduling.models import Weekday
from scheduling.services import generate_sessions
from students.models import Student
from subscriptions.services import create_subscription, freeze_subscription


class Command(BaseCommand):
    help = "Создаёт демо-данные (админ, тренер, родитель, группа, абонемент, расписание)."

    def handle(self, *args, **options):
        if not User.objects.filter(username="admin").exists():
            User.objects.create_superuser("admin", "admin@example.com", "Admin!2026pass",
                                          role="admin")
            self.stdout.write("Админ: admin / Admin!2026pass")

        coach_user, _ = User.objects.get_or_create(
            username="coach", defaults={"role": "trainer", "first_name": "Марек"})
        coach_user.set_password("Coach!2026pass"); coach_user.save()
        trainer, _ = Trainer.objects.get_or_create(user=coach_user)

        parent_user, _ = User.objects.get_or_create(
            username="parent", defaults={"role": "parent", "first_name": "Анна", "last_name": "Ковальская"})
        parent_user.set_password("Parent!2026pass"); parent_user.save()
        parent, _ = ParentAccount.objects.get_or_create(
            user=parent_user,
            defaults={"phone": "+48500123456", "email": "anna@example.com",
                      "telegram_chat_id": "123456789"})
        for ctype in (ConsentType.DATA_PROCESSING, ConsentType.EMAIL, ConsentType.TELEGRAM):
            c, _ = Consent.objects.get_or_create(parent=parent, type=ctype)
            if not c.granted:
                c.grant(policy_version="v1")

        group, _ = Group.objects.get_or_create(name="Дельфины", defaults={"default_trainer": trainer})
        stype, _ = SubscriptionType.objects.get_or_create(
            name="Абонемент 8 занятий",
            defaults={"sessions_count": 8, "duration_days": 30, "price_minor": 24000, "currency": "PLN"})

        if not Student.objects.filter(first_name="Ян", parent=parent).exists():
            student = Student.objects.create(parent=parent, group=group, first_name="Ян",
                                             last_name="Ковальский", emergency_contact_name="Анна",
                                             emergency_contact_phone="+48500123456")
            sub = create_subscription(student=student, subscription_type=stype, start_date=date.today())
            freeze_subscription(subscription=sub, start_date=date.today() + timedelta(days=10),
                                end_date=date.today() + timedelta(days=16), reason="Отпуск")
            Charge.objects.create(student=student, subscription=sub, description="Абонемент 8 занятий",
                                  amount_minor=24000, currency="PLN", due_date=date.today() - timedelta(days=2))
            # Parent uploaded a receipt; awaiting admin confirmation (rule 9).
            Payment.objects.create(student=student, amount_minor=24000, currency="PLN",
                                   paid_at=date.today(), status=PaymentStatus.PENDING)

        # Schedule from a Monday template for the next 4 weeks
        from scheduling.models import RecurringTemplate
        tpl, _ = RecurringTemplate.objects.get_or_create(
            group=group, trainer=trainer, weekday=Weekday.MON,
            defaults={"start_time": time(17, 0), "end_time": time(18, 0),
                      "location": "Бассейн A", "max_participants": 10})
        generate_sessions(tpl, date.today(), date.today() + timedelta(days=28), skip_conflicts=True)

        # A configurable notification rule (timing not hardcoded)
        tmpl, _ = NotificationTemplate.objects.get_or_create(
            event_type=EventType.PAYMENT_REMINDER, channel=Channel.EMAIL,
            defaults={"subject": "Напоминание об оплате", "body": "Здравствуйте, {student}! Ждём оплату до {date}."})
        NotificationRule.objects.get_or_create(
            event_type=EventType.PAYMENT_REMINDER, channel=Channel.EMAIL, template=tmpl,
            defaults={"offset_minutes": -3 * 24 * 60})  # за 3 дня

        self.stdout.write(self.style.SUCCESS("Демо-данные готовы. Логины: admin / coach / parent."))
