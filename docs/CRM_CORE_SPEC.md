# CRM Core Spec

## Purpose

This document is the working core specification for the swim school CRM. It is
intended to be the main reference during architecture, implementation, and
iteration work.

It is not the final full product specification. It is the stable baseline that
captures:

- fixed business rules;
- rewrite vs rebuild decision;
- target module architecture;
- entity model;
- MVP scope;
- open questions that must be resolved before or during implementation.

## Product Goal

Build an internal CRM and operations system for a swim school that manages:

- families and children;
- schedules and sessions;
- subscriptions and remaining sessions;
- attendance;
- charges, payments, and debt;
- notifications;
- trainer payroll;
- multilingual UI and templates;
- multi-location operations.

The system must be usable day-to-day by an operations/admin user without
developer involvement.

## Roles

### Admin

Full access. Manages clients, students, schedule, subscriptions, attendance,
payments, notifications, payroll, reports, settings, and archive flows.

### Parent

Can see only their own children, their schedules, attendance, payments,
subscription state, and remaining sessions.

### Trainer

Can see only their own sessions, groups, and attendance-related information.
Cannot see client financial data.

### Ops/Admin Without Code

Uses admin interfaces and should be able to update operational settings without
developer support.

## Fixed Business Rules

### Family and Access

- One family has one parent account.
- A parent can see only their own children.
- Users do not combine roles in the target model.
- Trainers cannot see client finances.

### Payments and Billing

- Only confirmed payments are considered the source of truth for financial
  calculations.
- Partial payments are allowed.
- Payment method is required.
- Minimum supported payment methods:
  - `cash`
  - `bank_transfer`
- The system stores the payment method type, not the actual IBAN.
- Payment history must never be deleted.
- Attendance history must never be deleted.
- Internal payment records are sufficient; no accounting system integration is
  required at this stage.

### Subscriptions

- A subscription remains valid until its end date plus 7 calendar days.
- The 7-day grace rule is universal for the first production release.
- Admin can manually adjust the remaining number of sessions.
- Admin manual adjustments may move the session balance below zero.
- Manual adjustments do not require approval.
- Manual adjustment comments/reasons are optional.
- Manual adjustments must remain in history.
- Freeze periods can be added retroactively.

### Scheduling

- Session transfers/reschedules are required.
- Trainer substitutions are required.
- If a substitute trainer delivers a session, the session keeps the originally
  scheduled trainer for history and payroll is assigned to the substitute.
- Cancelled sessions are excluded from payroll.
- Rescheduled sessions are paid according to the final delivered session date.
- Waitlist support is required.
- Individual sessions are a separate session type.
- Minimum session types:
  - `group`
  - `individual`
  - `split`

### Payroll

- Trainer payroll rules must be configurable.
- Group payroll is based on held sessions and client count above a minimum
  threshold.
- The minimum threshold is defined by session type.
- Extra payment is added per client above the threshold.
- Individual sessions use a fixed amount per session.
- Split sessions use a separate fixed amount per session; payout does not
  change when one or two clients attend.
- Trainers do not see client finances, but admin interfaces must support
  payroll calculation.

### Notifications

- Notification templates are required.
- Quiet hours are configurable.
- Messages must not be sent during quiet hours.
- Messages that fall into quiet hours must be deferred to the nearest allowed
  delivery time.

### Localization and Operations

- The system must support multiple locations.
- The system must support multilingual UI.
- Notification templates must be multilingual.
- Reference dictionaries must be localizable.
- Archive/read-only modes are required.
- The system should be manageable by an ops/admin user without code changes.

## Rewrite vs Rebuild Verdict

### Final Decision

Do not do a full rebuild from scratch on NocoBase.

Recommended direction:

- keep the current backend as the source of truth;
- preserve complex business logic in code;
- modernize and evolve the system through a hybrid rewrite strategy;
- use NocoBase only where it accelerates CRUD-heavy admin interfaces and
  operational configuration.

### Why

The project already contains non-trivial domain logic:

- subscription lifecycle logic;
- immutable session balance behavior;
- attendance-driven deductions;
- payment confirmation workflow;
- debt calculation;
- notification scheduling;
- audit-sensitive actions;
- payroll rules;
- retention constraints.

This is not a simple low-code CRM use case. It is an operations platform with
domain rules that should stay under direct code control.

### Architecture Principle

- Django backend remains the system of record.
- PostgreSQL is the primary database.
- React admin frontend is the interaction layer; low-risk admin/configuration
  surfaces are served by Django's own admin settings API, not a separate
  low-code layer.

## Target Module Architecture

### 1. Identity and Access

- Users
- Roles
- Authentication sessions
- Permissions
- Access events

### 2. Clients

- Parent accounts
- Students
- Emergency contacts
- Notes
- Tags
- Language preferences

### 3. Catalog

- Locations
- Session types
- Groups
- Subscription types
- Dictionaries and localized labels

### 4. Scheduling

- Recurring templates
- Sessions
- Reschedule history
- Trainer substitutions
- Waitlist
- Cancellations

### 5. Attendance

- Attendance records
- Attendance status history
- Comments

### 6. Subscriptions

- Subscriptions
- Freeze periods
- Session ledger entries
- Manual balance adjustments

### 7. Billing

- Charges
- Payments
- Payment confirmations
- Payment allocations
- Receipt metadata

### 8. Notifications

- Channels
- Templates
- Template translations
- Notification rules
- Quiet hours policies
- Delivery queue and log
- Consent tracking

### 9. Payroll

- Payroll schemes
- Session-type payroll rules
- Trainer payroll assignments
- Payroll periods
- Payroll calculations
- Payroll adjustments

### 10. Localization

- Languages
- Localized dictionary keys and values

### 11. Audit and Compliance

- Audit log
- Sensitive action log
- Client data export

### 12. Admin Operations

- Import
- Export
- Settings
- Location-level configuration
- Localization configuration

## MVP Scope

The following must be in MVP:

- authentication and roles;
- family account and student cards;
- groups and locations;
- schedule management;
- session creation and editing;
- session transfer and cancellation;
- attendance tracking;
- subscriptions;
- remaining sessions logic;
- 7-day grace period;
- manual session balance adjustment by admin;
- charges and payments;
- payment confirmation by admin;
- payment methods `cash` and `bank_transfer`;
- debtors/basic debt reporting;
- notification templates and sending rules;
- quiet hours with deferred sending;
- client portal;
- basic trainer portal;
- audit trail for financial and sensitive actions;
- multilingual UI and notification templates;
- multi-location support.

## Planned Later Scope

### Phase 2

- flexible payroll schemes;
- trainer payroll reporting;
- waitlist automation;
- mass notifications;
- extended finance, attendance, and debt reports;
- import/export flows;
- archive flows for core business entities;
- richer location-level settings.

### Phase 3

- advanced analytics;
- more complex loyalty/discount logic;
- richer workflow automation;
- deeper localization controls;
- broader ops self-service;
- external integrations if they become necessary.

## Entity Model

This section is the implementation-oriented data model baseline.

### Identity and Access

#### User

- `id`
- `username`
- `password_hash`
- `role` (`admin`, `trainer`, `parent`)
- `is_active`
- `last_login_at`
- `created_at`
- `updated_at`

#### ParentAccount

- `id`
- `user_id -> User`
- `first_name`
- `last_name`
- `phone`
- `email`
- `preferred_language`
- `location_id -> Location nullable`
- `notes nullable`
- `created_at`
- `updated_at`

#### TrainerProfile

- `id`
- `user_id -> User`
- `first_name`
- `last_name`
- `phone`
- `email`
- `default_location_id -> Location nullable`
- `is_active`
- `created_at`
- `updated_at`

#### AdminProfile

- `id`
- `user_id -> User`
- `first_name`
- `last_name`
- `phone nullable`
- `email`
- `created_at`

### Catalog

#### Location

- `id`
- `code`
- `name`
- `address nullable`
- `timezone`
- `is_active`
- `created_at`
- `updated_at`

#### SessionType

- `id`
- `code` (`group`, `individual`, `split`)
- `name`
- `default_duration_minutes`
- `is_active`
- `created_at`

#### Group

- `id`
- `location_id -> Location`
- `name`
- `session_type_id -> SessionType`
- `default_trainer_id -> TrainerProfile nullable`
- `capacity`
- `min_clients_for_payroll nullable`
- `is_active`
- `created_at`
- `updated_at`

#### SubscriptionType

- `id`
- `location_id -> Location nullable`
- `code`
- `name`
- `session_type_id -> SessionType nullable`
- `sessions_count nullable`
- `duration_days`
- `grace_days default 7`
- `price_amount`
- `price_currency`
- `is_unlimited`
- `is_active`
- `created_at`
- `updated_at`

### Clients and Students

#### Student

- `id`
- `parent_account_id -> ParentAccount`
- `first_name`
- `last_name`
- `birth_date`
- `gender nullable`
- `phone nullable`
- `email nullable`
- `default_group_id -> Group nullable`
- `location_id -> Location nullable`
- `medical_notes nullable`
- `allergies nullable`
- `special_notes nullable`
- `is_active`
- `created_at`
- `updated_at`

#### EmergencyContact

- `id`
- `student_id -> Student`
- `full_name`
- `phone`
- `relationship nullable`
- `notes nullable`

#### StudentTag

- `id`
- `name`
- `color nullable`

#### StudentTagLink

- `id`
- `student_id -> Student`
- `tag_id -> StudentTag`

### Scheduling

#### RecurringTemplate

- `id`
- `location_id -> Location`
- `group_id -> Group nullable`
- `session_type_id -> SessionType`
- `trainer_id -> TrainerProfile`
- `weekday`
- `start_time`
- `end_time`
- `capacity`
- `is_active`
- `created_at`
- `updated_at`

#### Session

- `id`
- `location_id -> Location`
- `recurring_template_id -> RecurringTemplate nullable`
- `group_id -> Group nullable`
- `session_type_id -> SessionType`
- `trainer_id -> TrainerProfile`
- `substitute_trainer_id -> TrainerProfile nullable`
- `student_id -> Student nullable`
- `start_at`
- `end_at`
- `capacity`
- `status` (`planned`, `completed`, `cancelled`, `rescheduled`)
- `payroll_status` (`pending`, `counted`, `excluded`)
- `notes nullable`
- `created_at`
- `updated_at`

#### SessionParticipant

- `id`
- `session_id -> Session`
- `student_id -> Student`
- `source` (`group`, `manual`, `waitlist`)
- `created_at`

#### WaitlistEntry

- `id`
- `session_id -> Session`
- `student_id -> Student`
- `priority default 0`
- `status` (`active`, `promoted`, `cancelled`, `expired`)
- `created_at`
- `updated_at`

#### SessionRescheduleLog

- `id`
- `session_id -> Session`
- `old_start_at`
- `old_end_at`
- `new_start_at`
- `new_end_at`
- `changed_by_user_id -> User`
- `created_at`

#### SessionCancellationLog

- `id`
- `session_id -> Session`
- `reason nullable`
- `cancelled_by_user_id -> User`
- `created_at`

### Attendance

#### AttendanceRecord

- `id`
- `session_id -> Session`
- `student_id -> Student`
- `status` (`present`, `absent`, `excused`, `rescheduled`)
- `comment nullable`
- `marked_by_user_id -> User`
- `marked_at`
- `updated_at`

#### AttendanceChangeLog

- `id`
- `attendance_record_id -> AttendanceRecord`
- `old_status nullable`
- `new_status`
- `changed_by_user_id -> User`
- `changed_at`

### Subscriptions and Ledger

#### Subscription

- `id`
- `student_id -> Student`
- `subscription_type_id -> SubscriptionType`
- `location_id -> Location`
- `start_date`
- `base_end_date`
- `grace_end_date`
- `status` (`active`, `frozen`, `expired`, `cancelled`, `archived`)
- `created_by_user_id -> User nullable`
- `created_at`
- `updated_at`

#### FreezePeriod

- `id`
- `subscription_id -> Subscription`
- `start_date`
- `end_date`
- `created_by_user_id -> User`
- `created_at`

#### SessionLedgerEntry

- `id`
- `subscription_id -> Subscription`
- `student_id -> Student`
- `attendance_record_id -> AttendanceRecord nullable`
- `entry_type` (`purchase`, `attendance`, `correction`, `manual_adjustment`,
  `carryover`, `freeze_adjustment`)
- `delta_sessions`
- `effective_at`
- `created_by_user_id -> User nullable`
- `comment nullable`
- `created_at`

Rule:

- session balance is calculated as the sum of `delta_sessions`;
- ledger entries are append-only.

#### ManualLedgerAdjustment

- `id`
- `ledger_entry_id -> SessionLedgerEntry`
- `subscription_id -> Subscription`
- `applied_by_user_id -> User`
- `created_at`

### Billing

#### Charge

- `id`
- `student_id -> Student`
- `subscription_id -> Subscription nullable`
- `location_id -> Location`
- `description`
- `amount`
- `currency`
- `due_date`
- `status optional`
- `created_by_user_id -> User`
- `created_at`

#### Payment

- `id`
- `student_id -> Student`
- `parent_account_id -> ParentAccount nullable`
- `location_id -> Location`
- `amount`
- `currency`
- `payment_method` (`cash`, `bank_transfer`, `card`, `other`)
- `status` (`pending`, `confirmed`, `rejected`)
- `paid_at`
- `confirmed_at nullable`
- `created_by_user_id -> User nullable`
- `confirmed_by_user_id -> User nullable`
- `comment nullable`
- `created_at`
- `updated_at`

#### PaymentAllocation

- `id`
- `payment_id -> Payment`
- `charge_id -> Charge`
- `allocated_amount`
- `created_at`

#### ReceiptMetadata

- `id`
- `payment_id -> Payment`
- `file_name nullable`
- `mime_type nullable`
- `uploaded_at`
- `deleted_at nullable`
- `retention_until nullable`
- `is_deleted`

### Notifications

#### NotificationChannel

- `id`
- `code` (`email`, `sms`, `telegram`)
- `name`

#### NotificationTemplate

- `id`
- `code`
- `channel_id -> NotificationChannel`
- `event_type`
- `is_active`
- `created_at`
- `updated_at`

#### NotificationTemplateTranslation

- `id`
- `template_id -> NotificationTemplate`
- `language_code`
- `subject nullable`
- `body`
- `created_at`
- `updated_at`

#### NotificationRule

- `id`
- `location_id -> Location nullable`
- `event_type`
- `channel_id -> NotificationChannel`
- `template_id -> NotificationTemplate`
- `offset_minutes`
- `is_active`
- `created_at`
- `updated_at`

#### QuietHoursPolicy

- `id`
- `location_id -> Location nullable`
- `channel_id -> NotificationChannel`
- `starts_at`
- `ends_at`
- `timezone`
- `is_active`
- `created_at`

#### NotificationDelivery

- `id`
- `student_id -> Student nullable`
- `parent_account_id -> ParentAccount`
- `template_id -> NotificationTemplate nullable`
- `channel_id -> NotificationChannel`
- `language_code`
- `scheduled_at`
- `sent_at nullable`
- `status` (`queued`, `deferred`, `sent`, `failed`, `cancelled`)
- `dedup_key nullable`
- `payload_json`
- `error_message nullable`
- `created_at`
- `updated_at`

### Consent

#### Consent

- `id`
- `parent_account_id -> ParentAccount`
- `channel_code` (`email`, `sms`, `telegram`)
- `is_granted`
- `granted_at nullable`
- `revoked_at nullable`
- `policy_version nullable`
- `created_at`
- `updated_at`

### Payroll

#### PayrollScheme

- `id`
- `location_id -> Location nullable`
- `name`
- `is_active`
- `created_at`
- `updated_at`

#### PayrollRule

- `id`
- `scheme_id -> PayrollScheme`
- `session_type_id -> SessionType`
- `rule_type` (`group`, `individual`, `split`)
- `base_amount`
- `currency`
- `min_clients_threshold nullable`
- `extra_client_amount nullable`
- `is_active`
- `created_at`
- `updated_at`

#### TrainerPayrollAssignment

- `id`
- `trainer_id -> TrainerProfile`
- `scheme_id -> PayrollScheme`
- `effective_from`
- `effective_to nullable`
- `created_at`

#### PayrollPeriod

- `id`
- `location_id -> Location nullable`
- `date_from`
- `date_to`
- `status` (`draft`, `calculated`, `approved`, `exported`)
- `created_at`
- `updated_at`

#### PayrollCalculation

- `id`
- `period_id -> PayrollPeriod`
- `trainer_id -> TrainerProfile`
- `session_id -> Session`
- `rule_id -> PayrollRule`
- `base_amount`
- `extra_clients_count default 0`
- `extra_amount default 0`
- `final_amount`
- `currency`
- `created_at`

#### PayrollAdjustment

- `id`
- `period_id -> PayrollPeriod`
- `trainer_id -> TrainerProfile`
- `amount`
- `currency`
- `reason nullable`
- `created_by_user_id -> User`
- `created_at`

### Localization

#### Language

- `id`
- `code`
- `name`
- `is_active`

#### DictionaryKey

- `id`
- `domain`
- `code`
- `is_active`

#### DictionaryTranslation

- `id`
- `dictionary_key_id -> DictionaryKey`
- `language_code`
- `value`
- `created_at`
- `updated_at`

### Audit and Compliance

#### AuditLogEntry

- `id`
- `actor_user_id -> User nullable`
- `entity_type`
- `entity_id`
- `action`
- `payload_json`
- `created_at`

#### SensitiveActionLog

- `id`
- `actor_user_id -> User`
- `student_id -> Student nullable`
- `parent_account_id -> ParentAccount nullable`
- `action_type`
- `payload_json`
- `created_at`

#### ClientDataExport

- `id`
- `student_id -> Student nullable`
- `parent_account_id -> ParentAccount nullable`
- `requested_by_user_id -> User`
- `status`
- `file_path nullable`
- `created_at`
- `completed_at nullable`

### Archive Fields

Prefer archive flags over hard deletes for major business entities.

Suggested fields:

- `is_archived`
- `archived_at nullable`
- `archived_by_user_id nullable`

Recommended at minimum for:

- `ParentAccount`
- `Student`
- `Group`
- `Subscription`
- `Location`

## What Must Stay in Django Code

The following should remain in the coded backend rather than being moved into a
low-code source of truth:

- subscription ledger;
- attendance deduction rules;
- grace-period logic;
- manual balance adjustments;
- payment confirmation logic;
- debt calculation;
- quiet-hours scheduling behavior;
- payroll calculation engine;
- audit and compliance logic;
- critical import and rollback flows.

## What Is Managed in the Admin Settings UI

NocoBase was evaluated as a low-code layer for configuration/admin surfaces
during the hybrid rewrite (see Final Decision above) but was fully removed
from the running product; these surfaces are managed directly in the SwimCRM
admin UI (`/api/admin/settings/*` and related `/api/admin/notifications/`,
`/api/admin/payroll/` endpoints) under a normal admin session:

- locations;
- session types;
- dictionaries and translations;
- notification templates;
- quiet-hours policies;
- payroll schemes and rules;
- operational settings;
- CRUD-heavy internal admin lists.

These surfaces are not the source of truth for:

- ledger;
- billing core;
- attendance core;
- payroll calculation results;
- audit history.

## First-Release Decisions and Later Scope

The following decisions are fixed for the first production release. Items marked
as later scope are not blockers for the Hybrid Rewrite cutover.

### Quiet Hours

- Quiet hours are configured per notification channel: `email`, `sms`,
  `telegram`.
- Quiet hours are global policies in the first production release; they are
  not location-specific.
- Delivery uses the timezone configured on the quiet-hours policy.
- Client timezone does not affect delivery in the first production release.
- Messages due during quiet hours are deferred to the nearest allowed time for
  that channel.

### Subscription Rules

- Subscription validity uses a universal end-date plus 7 calendar days grace
  period in the first production release.
- Per-subscription-type grace periods are later scope.

### Waitlist and Scheduling

- Waitlist promotion is manual in the first production release.
- Admin promotes an active waitlist entry into the concrete session roster.
- Promotion is blocked if the session is full, cancelled, the entry is no
  longer active, or the client/participant has been archived.
- Notification-assisted or automatic promotion is later scope.

### Localization and Multi-Location

- First release supports the configured default language plus any active
  languages added by ops/admin through the admin settings UI before cutover.
- Language preference is stored per parent account in the first release.
  Location-specific language preference is later scope.
- UI labels, reference dictionary names, and notification templates must be
  localizable by language.
- Notification template selection is language-specific, not location-specific,
  in the first release.
- Pricing is global in the first release unless a later pricing model
  explicitly introduces location-scoped prices.
- Payroll schemes may be scoped by location.
- Quiet hours are channel-specific global policies in the first release; they
  are not location-specific.

### Archive and Operations

- Major business entities use archive/inactive flows instead of hard delete:
  client accounts, participants, trainers, groups, subscription types,
  notification rules, and quiet-hours policies.
- Archived client accounts and participants are read-only for new operational
  actions.
- Archived trainers cannot log in and cannot receive new operational work.
- Archived or inactive groups, subscription types, notification rules, and
  quiet-hours policies remain visible for history but are excluded from new
  routine operations.
- Payment history, charge history, attendance history, subscription ledger,
  freeze history, payroll calculation history, and audit history must not be
  hard-deleted.
- Receipt files may be purged according to retention rules, but internal
  payment records remain.
- Ops/admin users must be able to manage routine configuration without code:
  locations, session types, groups, subscription types, notification templates,
  notification rules, quiet-hours policies, localization dictionaries,
  languages, and payroll schemes.
- Financial, attendance, payroll calculation, and audit history mutations stay
  in guarded Django backend flows, not direct admin settings writes.

### Performance

- Expected first-release scale is about 600 clients total, with 150-200 weekly
  active clients.
- The most performance-critical screens are calendar/session roster, client
  detail, debtors report, and payroll report.
- First release does not define a formal SLO. The release gate must keep these
  screens covered by backend/API checks and smoke coverage; deeper telemetry and
  explicit p95 latency targets are later scope.

## Working Principle

Implementation should follow this order:

1. finalize domain rules;
2. lock the data model;
3. implement admin flows;
4. implement parent and trainer portals;
5. add automation and payroll depth;
6. expand reporting and operations tooling.

## Summary

This CRM is not a generic contact-tracking application. It is an operations
system with financial, scheduling, attendance, notification, and payroll rules.

The stable path is:

- preserve the current backend-centered architecture;
- expand it deliberately;
- keep critical business rules in code;
- use low-code tooling only where it reduces admin overhead without weakening
  the domain model.
