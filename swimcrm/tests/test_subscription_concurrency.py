from datetime import date
from threading import Event, Thread
from unittest import skipUnless

from django.db import close_old_connections, connection, connections
from django.db.models import Sum
from django.test import TransactionTestCase

from attendance.models import AttendanceStatus
from attendance.services import set_attendance
from billing.models import Charge
from scheduling.services import create_session
from subscriptions.models import Subscription
from subscriptions.services import create_subscription, renew_subscription

from . import factories as f


@skipUnless(connection.vendor == 'postgresql', 'Requires PostgreSQL row locks')
class SubscriptionConcurrencyTest(TransactionTestCase):
    def setUp(self):
        self.student = f.make_student()
        self.type = f.make_sub_type(sessions=1)
        self.sub = create_subscription(student=self.student, subscription_type=self.type,
                                       start_date=date(2026, 6, 1))
        group = f.make_group()
        group.price_minor = 5000
        group.save(update_fields=['price_minor'])
        trainer = f.make_trainer()
        self.sessions = [create_session(
            group=group, trainer=trainer, start_at=f.dt(2026, 6, day, 17),
            end_at=f.dt(2026, 6, day, 18), location='Pool', max_participants=10,
        ) for day in (1, 2)]

    def race(self, first, second):
        first_read = Event()
        second_read = Event()
        release = Event()
        results = {}
        errors = []

        def run(name, task):
            close_old_connections()
            paused = False

            def observe(execute, sql, params, many, context):
                nonlocal paused
                result = execute(sql, params, many, context)
                if 'SUM(' in sql.upper() and 'subscriptions_sessionledgerentry' in sql:
                    if name == 'first' and not paused:
                        paused = True
                        first_read.set()
                        if not release.wait(10):
                            raise TimeoutError('First balance read was not released')
                    elif name == 'second':
                        second_read.set()
                return result

            try:
                with connection.cursor() as cursor:
                    cursor.execute("SET lock_timeout = '8s'")
                with connection.execute_wrapper(observe):
                    results[name] = task()
            except Exception as error:
                errors.append(error)
            finally:
                connections.close_all()

        threads = [Thread(target=run, args=('first', first)),
                   Thread(target=run, args=('second', second))]
        threads[0].start()
        try:
            self.assertTrue(first_read.wait(5), 'First operation never read the balance')
            threads[1].start()
            # On the broken implementation the second operation reads the stale
            # balance while the first is paused. With a lock it waits instead.
            second_read.wait(2)
        finally:
            release.set()
            for thread in threads:
                if thread.ident is not None:
                    thread.join(12)
        self.assertFalse(any(thread.is_alive() for thread in threads))
        self.assertEqual(errors, [])
        return results

    def mark(self, session):
        return set_attendance(session_id=session.id, student=self.student,
                              status=AttendanceStatus.PRESENT)

    def test_two_visits_cannot_spend_the_same_last_session(self):
        self.race(lambda: self.mark(self.sessions[0]), lambda: self.mark(self.sessions[1]))
        self.assertEqual(self.sub.remaining_sessions, 0)
        self.assertEqual(self.sub.ledger_entries.filter(attendance__isnull=False).count(), 1)
        self.assertEqual(Charge.objects.aggregate(total=Sum('amount_minor'))['total'], 5000)

    def test_renewal_and_visit_do_not_leave_a_negative_old_balance(self):
        results = self.race(lambda: renew_subscription(subscription=self.sub),
                            lambda: self.mark(self.sessions[0]))
        self.assertEqual(self.sub.remaining_sessions, 0)
        self.assertEqual(results['first'].remaining_sessions, 1)
        self.assertEqual(results['second'].ledger_entries.get().subscription_id,
                         results['first'].id)
        self.assertFalse(Charge.objects.exists())

    def test_two_renewals_transfer_the_old_balance_only_once(self):
        self.race(lambda: renew_subscription(subscription=self.sub),
                  lambda: renew_subscription(subscription=self.sub))
        self.assertEqual(self.sub.remaining_sessions, 0)
        balances = sorted(sub.remaining_sessions for sub in Subscription.objects.exclude(pk=self.sub.pk))
        self.assertEqual(balances, [1, 2])
