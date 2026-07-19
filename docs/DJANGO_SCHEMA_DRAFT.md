# Django Schema Draft

## Purpose

This document is the implementation-oriented schema draft derived from
`CRM_CORE_SPEC.md`. It is intended to guide Django model design, migrations,
service boundaries, and API planning.

It is not raw ORM code. It is the structure and rules baseline for the Django
backend.

## Modeling Rules

- Core business logic lives in Django services, not in frontend-only behavior.
- Financial and attendance history are append-only where required by business
  rules.
- Archive flags are preferred over hard deletes for major business entities.
- Sensitive and financial actions must be auditable.
- Role restrictions must be enforced on the backend.

## App Breakdown

Recommended Django app structure:

- `accounts`
- `catalog`
- `students`
- `scheduling`
- `attendance`
- `subscriptions`
- `billing`
- `notifications`
- `payroll`
- `audit`
- `dataio`
- `analytics`
- `localization`

## Accounts App

### User

Fields:

- `username`
- `password`
- `role`
- `is_active`
- `last_login_at`
- `created_at`
- `updated_at`

Notes:

- role is one of `admin`, `trainer`, `parent`;
- no role-combination behavior is assumed in the target model.

### ParentAccount

Fields:

- `user`
- `first_name`
- `last_name`
- `phone`
- `email`
- `preferred_language`
- `location`
- `notes`
- `is_archived`
- `archived_at`
- `archived_by`
- `created_at`
- `updated_at`

Constraints:

- one parent account per family;
- phone uniqueness can be enforced if business wants family phone as a primary
  unique operational identifier.

### TrainerProfile

Fields:

- `user`
- `first_name`
- `last_name`
- `phone`
- `email`
- `default_location`
- `is_active`
- `created_at`
- `updated_at`

### AdminProfile

Fields:

- `user`
- `first_name`
- `last_name`
- `phone`
- `email`
- `created_at`

## Catalog App

### Location

Fields:

- `code`
- `name`
- `address`
- `timezone`
- `is_active`
- `is_archived`
- `archived_at`
- `archived_by`
- `created_at`
- `updated_at`

### SessionType

Fields:

- `code`
- `name`
- `default_duration_minutes`
- `is_active`
- `created_at`

Seed values:

- `group`
- `individual`
- `split`

### Group

Fields:

- `location`
- `name`
- `session_type`
- `default_trainer`
- `capacity`
- `min_clients_for_payroll`
- `is_active`
- `is_archived`
- `archived_at`
- `archived_by`
- `created_at`
- `updated_at`

### SubscriptionType

Fields:

- `location`
- `code`
- `name`
- `session_type`
- `sessions_count`
- `duration_days`
- `grace_days`
- `price_amount`
- `price_currency`
- `is_unlimited`
- `is_active`
- `created_at`
- `updated_at`

Rule:

- default `grace_days` is 7 unless later made configurable by type.

## Students App

### Student

Fields:

- `parent_account`
- `first_name`
- `last_name`
- `birth_date`
- `gender`
- `phone`
- `email`
- `default_group`
- `location`
- `medical_notes`
- `allergies`
- `special_notes`
- `is_active`
- `is_archived`
- `archived_at`
- `archived_by`
- `created_at`
- `updated_at`

### EmergencyContact

Fields:

- `student`
- `full_name`
- `phone`
- `relationship`
- `notes`

### StudentTag

Fields:

- `name`
- `color`

### StudentTagLink

Fields:

- `student`
- `tag`

## Scheduling App

### RecurringTemplate

Fields:

- `location`
- `group`
- `session_type`
- `trainer`
- `weekday`
- `start_time`
- `end_time`
- `capacity`
- `is_active`
- `created_at`
- `updated_at`

### Session

Fields:

- `location`
- `recurring_template`
- `group`
- `session_type`
- `trainer`
- `substitute_trainer`
- `student`
- `start_at`
- `end_at`
- `capacity`
- `status`
- `payroll_status`
- `notes`
- `created_at`
- `updated_at`

Status values:

- `planned`
- `completed`
- `cancelled`
- `rescheduled`

Payroll status values:

- `pending`
- `counted`
- `excluded`

Rules:

- `individual` should have a single student context;
- `split` should have at most two participants;
- these constraints should be enforced in service logic and, where practical, at
  the data level.

### SessionParticipant

Fields:

- `session`
- `student`
- `source`
- `created_at`

Source values:

- `group`
- `manual`
- `waitlist`

Constraints:

- unique `session + student`.

### WaitlistEntry

Fields:

- `session`
- `student`
- `priority`
- `status`
- `created_at`
- `updated_at`

Status values:

- `active`
- `promoted`
- `cancelled`
- `expired`

### SessionRescheduleLog

Fields:

- `session`
- `old_start_at`
- `old_end_at`
- `new_start_at`
- `new_end_at`
- `changed_by_user`
- `created_at`

### SessionCancellationLog

Fields:

- `session`
- `reason`
- `cancelled_by_user`
- `created_at`

## Attendance App

### AttendanceRecord

Fields:

- `session`
- `student`
- `status`
- `comment`
- `marked_by_user`
- `marked_at`
- `updated_at`

Status values:

- `present`
- `absent`
- `excused`
- `rescheduled`

Constraints:

- unique `session + student`.

### AttendanceChangeLog

Fields:

- `attendance_record`
- `old_status`
- `new_status`
- `changed_by_user`
- `changed_at`

Rule:

- attendance changes should be logged, especially if they affect balance or
  payroll.

## Subscriptions App

### Subscription

Fields:

- `student`
- `subscription_type`
- `location`
- `start_date`
- `base_end_date`
- `grace_end_date`
- `status`
- `created_by_user`
- `is_archived`
- `archived_at`
- `archived_by`
- `created_at`
- `updated_at`

Status values:

- `active`
- `frozen`
- `expired`
- `cancelled`
- `archived`

Rule:

- `grace_end_date = base_end_date + grace_days`.

### FreezePeriod

Fields:

- `subscription`
- `start_date`
- `end_date`
- `created_by_user`
- `created_at`

Rule:

- retroactive freeze is allowed.

### SessionLedgerEntry

Fields:

- `subscription`
- `student`
- `attendance_record`
- `entry_type`
- `delta_sessions`
- `effective_at`
- `created_by_user`
- `comment`
- `created_at`

Entry types:

- `purchase`
- `attendance`
- `correction`
- `manual_adjustment`
- `carryover`
- `freeze_adjustment`

Critical rule:

- append-only;
- no in-place mutation of historical balance logic.

### ManualLedgerAdjustment

Fields:

- `ledger_entry`
- `subscription`
- `applied_by_user`
- `created_at`

Note:

- can remain as a helper entity for reporting and admin workflows, even if
  ledger is the real source of truth.

## Billing App

### Charge

Fields:

- `student`
- `subscription`
- `location`
- `description`
- `amount`
- `currency`
- `due_date`
- `status`
- `created_by_user`
- `created_at`

### Payment

Fields:

- `student`
- `parent_account`
- `location`
- `amount`
- `currency`
- `payment_method`
- `status`
- `paid_at`
- `confirmed_at`
- `created_by_user`
- `confirmed_by_user`
- `comment`
- `created_at`
- `updated_at`

Payment methods:

- `cash`
- `bank_transfer`
- `card`
- `other`

Statuses:

- `pending`
- `confirmed`
- `rejected`

Rule:

- only confirmed payments affect debt/balance calculations.

### PaymentAllocation

Fields:

- `payment`
- `charge`
- `allocated_amount`
- `created_at`

Rule:

- required if partial payments are to be handled predictably at charge level.

### ReceiptMetadata

Fields:

- `payment`
- `file_name`
- `mime_type`
- `uploaded_at`
- `deleted_at`
- `retention_until`
- `is_deleted`

Rule:

- payment history remains forever;
- receipt blob policy can still follow retention rules.

## Notifications App

### NotificationChannel

Fields:

- `code`
- `name`

Values:

- `email`
- `sms`
- `telegram`

### NotificationTemplate

Fields:

- `code`
- `channel`
- `event_type`
- `is_active`
- `created_at`
- `updated_at`

### NotificationTemplateTranslation

Fields:

- `template`
- `language_code`
- `subject`
- `body`
- `created_at`
- `updated_at`

### NotificationRule

Fields:

- `location`
- `event_type`
- `channel`
- `template`
- `offset_minutes`
- `is_active`
- `created_at`
- `updated_at`

### QuietHoursPolicy

Fields:

- `location`
- `channel`
- `starts_at`
- `ends_at`
- `timezone`
- `is_active`
- `created_at`

Rule:

- if a scheduled send falls into quiet hours, delivery is deferred to the next
  allowed send time.

### NotificationDelivery

Fields:

- `student`
- `parent_account`
- `template`
- `channel`
- `language_code`
- `scheduled_at`
- `sent_at`
- `status`
- `dedup_key`
- `payload_json`
- `error_message`
- `created_at`
- `updated_at`

Statuses:

- `queued`
- `deferred`
- `sent`
- `failed`
- `cancelled`

### Consent

Fields:

- `parent_account`
- `channel_code`
- `is_granted`
- `granted_at`
- `revoked_at`
- `policy_version`
- `created_at`
- `updated_at`

## Payroll App

### PayrollScheme

Fields:

- `location`
- `name`
- `is_active`
- `created_at`
- `updated_at`

### PayrollRule

Fields:

- `scheme`
- `session_type`
- `rule_type`
- `base_amount`
- `currency`
- `min_clients_threshold`
- `extra_client_amount`
- `is_active`
- `created_at`
- `updated_at`

Rule types:

- `group`
- `individual`
- `split`

### TrainerPayrollAssignment

Fields:

- `trainer`
- `scheme`
- `effective_from`
- `effective_to`
- `created_at`

### PayrollPeriod

Fields:

- `location`
- `date_from`
- `date_to`
- `status`
- `created_at`
- `updated_at`

Statuses:

- `draft`
- `calculated`
- `approved`
- `exported`

### PayrollCalculation

Fields:

- `period`
- `trainer`
- `session`
- `rule`
- `base_amount`
- `extra_clients_count`
- `extra_amount`
- `final_amount`
- `currency`
- `created_at`

### PayrollAdjustment

Fields:

- `period`
- `trainer`
- `amount`
- `currency`
- `reason`
- `created_by_user`
- `created_at`

## Localization App

### Language

Fields:

- `code`
- `name`
- `is_active`

### DictionaryKey

Fields:

- `domain`
- `code`
- `is_active`

### DictionaryTranslation

Fields:

- `dictionary_key`
- `language_code`
- `value`
- `created_at`
- `updated_at`

## Audit App

### AuditLogEntry

Fields:

- `actor_user`
- `entity_type`
- `entity_id`
- `action`
- `payload_json`
- `created_at`

### SensitiveActionLog

Fields:

- `actor_user`
- `student`
- `parent_account`
- `action_type`
- `payload_json`
- `created_at`

### ClientDataExport

Fields:

- `student`
- `parent_account`
- `requested_by_user`
- `status`
- `file_path`
- `created_at`
- `completed_at`

## DataIO App

### ImportBatch

Fields:

- `source_name`
- `import_type`
- `created_by_user`
- `status`
- `summary_json`
- `created_at`
- `completed_at`

### ExportJob

Fields:

- `export_type`
- `requested_by_user`
- `status`
- `file_path`
- `payload_json`
- `created_at`
- `completed_at`

## Service-Layer Requirements

The following logic must not live only in models or frontend behavior:

- subscription balance calculations;
- grace-period eligibility;
- manual balance adjustments;
- freeze handling;
- attendance-driven deductions;
- payment confirmation and allocation;
- debt calculation;
- quiet-hours deferred notification scheduling;
- payroll calculation by session type;
- archive restrictions.

## Suggested Index and Constraint Priorities

Prioritize indexes and uniqueness rules for:

- `User.username`
- `ParentAccount.user`
- `TrainerProfile.user`
- `Student.parent_account`
- `Session.start_at`
- `Session.trainer + start_at`
- `SessionParticipant.session + student`
- `AttendanceRecord.session + student`
- `Subscription.student + status`
- `SessionLedgerEntry.subscription + effective_at`
- `Payment.student + status + paid_at`
- `PaymentAllocation.payment`
- `NotificationDelivery.status + scheduled_at`
- `PayrollCalculation.period + trainer`

## Recommended First Migration Order

1. accounts
2. catalog
3. students
4. scheduling
5. attendance
6. subscriptions
7. billing
8. notifications
9. payroll
10. audit
11. dataio
12. localization
