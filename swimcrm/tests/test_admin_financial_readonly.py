from datetime import date

from django.contrib import admin
from django.test import TestCase, override_settings
from django.urls import reverse

from attendance.models import AttendanceRecord, AttendanceStatus
from attendance.services import set_attendance
from billing.models import Charge, Payment, PaymentEvent, PaymentEventType, PaymentStatus, ReceiptFile
from scheduling.services import create_session
from subscriptions.models import SessionLedgerEntry, Subscription
from subscriptions.services import create_subscription, freeze_subscription

from . import factories as f


@override_settings(ADMIN_2FA_REQUIRED=False)
class FinancialAdminReadOnlyTest(TestCase):
    def test_superuser_can_read_history_but_cannot_write_or_renew(self):
        operator = f.make_admin()
        self.client.force_login(operator)
        student = f.make_student()
        subscription = create_subscription(student=student, subscription_type=f.make_sub_type(),
                                           start_date=date(2026, 6, 1))
        freeze_subscription(subscription=subscription, start_date=date(2026, 6, 3),
                            end_date=date(2026, 6, 4))
        session = create_session(group=f.make_group(), trainer=f.make_trainer(),
                                 start_at=f.dt(2026, 6, 1, 17), end_at=f.dt(2026, 6, 1, 18),
                                 location='Pool', max_participants=10)
        attendance = set_attendance(session_id=session.id, student=student,
                                    status=AttendanceStatus.PRESENT)
        charge = Charge.objects.create(student=student, attendance=attendance,
                                       amount_minor=5000, currency='PLN',
                                       description='Test charge', due_date=date(2026, 6, 1))
        payment = Payment.objects.create(student=student, amount_minor=1000, currency='PLN',
                                         paid_at=date(2026, 6, 1), status=PaymentStatus.CONFIRMED)
        receipt = ReceiptFile.objects.create(payment=payment)
        event = PaymentEvent.objects.create(payment=payment, event_type=PaymentEventType.CREATED,
                                            amount_minor=1000, currency='PLN')
        objects = (attendance, subscription, subscription.ledger_entries.first(),
                   charge, payment, receipt, event)
        for obj in objects:
            with self.subTest(model=obj._meta.label):
                model_admin = admin.site._registry[type(obj)]
                prefix = f'admin:{obj._meta.app_label}_{obj._meta.model_name}'
                before = list(type(obj).objects.order_by('id').values())
                for name, args in (('changelist', ()), ('change', (obj.pk,))):
                    self.assertEqual(self.client.get(reverse(f'{prefix}_{name}', args=args)).status_code,
                                     200)
                for name, args in (('add', ()), ('change', (obj.pk,)), ('delete', (obj.pk,))):
                    self.assertEqual(self.client.post(reverse(f'{prefix}_{name}', args=args),
                                                      {'status': 'cancelled', 'amount_minor': 999999}).status_code,
                                     403)
                self.assertEqual(list(type(obj).objects.order_by('id').values()), before)
                request = self.client.request().wsgi_request
                self.assertEqual(model_admin.get_actions(request), {})
                for inline in model_admin.inlines:
                    instance = inline(type(obj), admin.site)
                    self.assertFalse(instance.has_add_permission(request, obj))
                    self.assertFalse(instance.has_change_permission(request, obj))
                    self.assertFalse(instance.has_delete_permission(request, obj))
        before = (Subscription.objects.count(), SessionLedgerEntry.objects.count())
        response = self.client.post(reverse('admin:subscriptions_subscription_changelist'),
                                    {'action': 'renew_same_type', '_selected_action': [subscription.pk]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual((Subscription.objects.count(), SessionLedgerEntry.objects.count()), before)
