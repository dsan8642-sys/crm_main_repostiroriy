NOCOBASE_ENDPOINT_SCHEMAS = {
    ("GET", "/api/nocobase/health/"): {
        "mode": "read_only",
        "token": "NOCOBASE_BRIDGE_TOKEN",
        "top_level_keys": ["ok", "bridge", "mode", "config_api"],
        "forbidden_keys": [],
    },
    ("GET", "/api/nocobase/ops-status/"): {
        "mode": "read_only",
        "token": "NOCOBASE_BRIDGE_TOKEN",
        "top_level_keys": [
            "ok", "status", "generated_at", "service", "component",
            "notifications", "receipt_cleanup", "celery", "warnings", "critical",
        ],
        "nested_keys": {
            "notifications": [
                "by_status", "by_channel", "due_pending", "scheduled_future",
                "failed_last_24h", "oldest_due_at", "oldest_due_age_minutes",
                "latest_failure",
            ],
            "receipt_cleanup": ["retention_days", "expired_receipts_waiting_cleanup"],
            "celery": ["worker_config", "beat_schedule"],
        },
        "forbidden_keys": ["token", "password", "secret", "receipt_file"],
    },
    ("GET", "/api/nocobase/clients/"): {
        "mode": "read_only",
        "token": "NOCOBASE_BRIDGE_TOKEN",
        "top_level_keys": ["clients", "count"],
        "collection_key": "clients",
        "item_keys": [
            "participant_id", "client_id", "first_name", "last_name", "full_name",
            "birth_date", "participant_email", "is_account_holder", "is_active",
            "group", "parent", "balance_minor", "currency", "has_overdue_charge",
            "latest_payment", "active_subscription",
        ],
        "nested_keys": {
            "group": ["id", "name"],
            "parent": [
                "id", "full_name", "phone", "email", "telegram_chat_id",
                "preferred_language",
            ],
            "latest_payment": [
                "id", "amount_minor", "currency", "paid_at", "method", "status",
                "confirmed_at",
            ],
            "active_subscription": [
                "id", "type", "status", "start_date", "base_end_date",
                "effective_end_date", "grace_end_date", "remaining_sessions",
            ],
        },
        "forbidden_keys": [
            "medical_info", "admin_comments", "receipt", "receipt_file", "comment",
            "internal_note", "ledger_entries",
        ],
    },
    ("GET", "/api/nocobase/debtors/"): {
        "mode": "read_only",
        "token": "NOCOBASE_BRIDGE_TOKEN",
        "top_level_keys": ["debtors", "count"],
        "collection_key": "debtors",
        "item_keys": [
            "participant_id", "client_id", "full_name", "group", "parent_phone",
            "parent_email", "reasons", "balance_minor", "currency",
        ],
        "forbidden_keys": ["ledger_entries", "payment_receipts", "medical_info", "admin_comments"],
    },
    ("GET", "/api/nocobase/payroll/periods/"): {
        "mode": "read_only",
        "token": "NOCOBASE_BRIDGE_TOKEN",
        "top_level_keys": ["periods"],
        "collection_key": "periods",
        "item_keys": [
            "id", "date_from", "date_to", "location", "status",
            "totals_by_trainer", "calculations_count", "created_at", "updated_at",
        ],
        "forbidden_keys": [
            "recalculate", "approve", "export", "pay", "payouts", "adjustments",
            "attendance_history",
        ],
    },
    ("GET", "/api/nocobase/payroll/periods/<id>/"): {
        "mode": "read_only",
        "token": "NOCOBASE_BRIDGE_TOKEN",
        "object_keys": [
            "id", "date_from", "date_to", "location", "status",
            "totals_by_trainer", "calculations_count", "created_at", "updated_at",
            "calculations",
        ],
        "nested_keys": {
            "calculations": [
                "id", "period_id", "trainer_id", "trainer", "session_id",
                "session_start_at", "session_type", "location",
                "attended_clients_count", "base_amount_minor", "extra_clients_count",
                "extra_amount_minor", "final_amount_minor", "currency",
            ],
        },
        "forbidden_keys": [
            "recalculate", "approve", "export", "pay", "payouts", "adjustments",
            "attendance_history",
        ],
    },
    ("GET", "/api/nocobase/config/notification-templates/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "top_level_keys": ["templates"],
        "collection_key": "templates",
        "item_keys": ["id", "event_type", "channel", "subject", "body"],
        "forbidden_keys": [
            "logs", "notification_logs", "delivery_state", "provider_message_id",
            "dedup_key", "retries", "error",
        ],
    },
    ("POST", "/api/nocobase/config/notification-templates/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": ["id", "event_type", "channel", "subject", "body"],
        "forbidden_keys": [
            "logs", "notification_logs", "delivery_state", "provider_message_id",
            "dedup_key", "retries", "error",
        ],
    },
    ("GET", "/api/nocobase/config/notification-templates/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": ["id", "event_type", "channel", "subject", "body"],
        "forbidden_keys": [
            "logs", "notification_logs", "delivery_state", "provider_message_id",
            "dedup_key", "retries", "error",
        ],
    },
    ("POST/PATCH/PUT", "/api/nocobase/config/notification-templates/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": ["id", "event_type", "channel", "subject", "body"],
        "forbidden_keys": [
            "logs", "notification_logs", "delivery_state", "provider_message_id",
            "dedup_key", "retries", "error",
        ],
    },
    ("DELETE", "/api/nocobase/config/notification-templates/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "top_level_keys": ["deleted", "id"],
        "forbidden_keys": [
            "logs", "notification_logs", "delivery_state", "provider_message_id",
            "dedup_key", "retries", "error",
        ],
    },
    ("GET", "/api/nocobase/config/notification-rules/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "top_level_keys": ["rules"],
        "collection_key": "rules",
        "item_keys": [
            "id", "event_type", "channel", "template_id", "template",
            "offset_minutes", "is_active",
        ],
        "nested_keys": {
            "template": ["id", "event_type", "channel", "subject", "body"],
        },
        "forbidden_keys": [
            "logs", "notification_logs", "delivery_state", "provider_message_id",
            "dedup_key", "retries", "error",
        ],
    },
    ("POST", "/api/nocobase/config/notification-rules/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": [
            "id", "event_type", "channel", "template_id", "template",
            "offset_minutes", "is_active",
        ],
        "nested_keys": {
            "template": ["id", "event_type", "channel", "subject", "body"],
        },
        "forbidden_keys": [
            "logs", "notification_logs", "delivery_state", "provider_message_id",
            "dedup_key", "retries", "error",
        ],
    },
    ("GET", "/api/nocobase/config/notification-rules/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": [
            "id", "event_type", "channel", "template_id", "template",
            "offset_minutes", "is_active",
        ],
        "nested_keys": {
            "template": ["id", "event_type", "channel", "subject", "body"],
        },
        "forbidden_keys": [
            "logs", "notification_logs", "delivery_state", "provider_message_id",
            "dedup_key", "retries", "error",
        ],
    },
    ("POST/PATCH/PUT", "/api/nocobase/config/notification-rules/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": [
            "id", "event_type", "channel", "template_id", "template",
            "offset_minutes", "is_active",
        ],
        "nested_keys": {
            "template": ["id", "event_type", "channel", "subject", "body"],
        },
        "forbidden_keys": [
            "logs", "notification_logs", "delivery_state", "provider_message_id",
            "dedup_key", "retries", "error",
        ],
    },
    ("DELETE", "/api/nocobase/config/notification-rules/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": [
            "id", "event_type", "channel", "template_id", "template",
            "offset_minutes", "is_active",
        ],
        "nested_keys": {
            "template": ["id", "event_type", "channel", "subject", "body"],
        },
        "forbidden_keys": [
            "logs", "notification_logs", "delivery_state", "provider_message_id",
            "dedup_key", "retries", "error",
        ],
    },
    ("GET", "/api/nocobase/config/locations/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "top_level_keys": ["locations"],
        "collection_key": "locations",
        "item_keys": [
            "id", "code", "name", "address", "timezone", "is_active",
            "created_at", "updated_at",
        ],
        "forbidden_keys": ["sessions", "attendance", "payments", "ledger_entries"],
    },
    ("POST", "/api/nocobase/config/locations/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": [
            "id", "code", "name", "address", "timezone", "is_active",
            "created_at", "updated_at",
        ],
        "forbidden_keys": ["sessions", "attendance", "payments", "ledger_entries"],
    },
    ("GET", "/api/nocobase/config/locations/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": [
            "id", "code", "name", "address", "timezone", "is_active",
            "created_at", "updated_at",
        ],
        "forbidden_keys": ["sessions", "attendance", "payments", "ledger_entries"],
    },
    ("POST/PATCH/PUT", "/api/nocobase/config/locations/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": [
            "id", "code", "name", "address", "timezone", "is_active",
            "created_at", "updated_at",
        ],
        "forbidden_keys": ["sessions", "attendance", "payments", "ledger_entries"],
    },
    ("DELETE", "/api/nocobase/config/locations/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": [
            "id", "code", "name", "address", "timezone", "is_active",
            "created_at", "updated_at",
        ],
        "forbidden_keys": ["sessions", "attendance", "payments", "ledger_entries"],
    },
    ("GET", "/api/nocobase/config/session-types/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "top_level_keys": ["session_types"],
        "collection_key": "session_types",
        "item_keys": [
            "id", "code", "label", "default_capacity", "is_active",
            "created_at", "updated_at",
        ],
        "forbidden_keys": ["sessions", "attendance", "payroll_calculations"],
    },
    ("POST", "/api/nocobase/config/session-types/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": [
            "id", "code", "label", "default_capacity", "is_active",
            "created_at", "updated_at",
        ],
        "forbidden_keys": ["sessions", "attendance", "payroll_calculations"],
    },
    ("GET", "/api/nocobase/config/session-types/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": [
            "id", "code", "label", "default_capacity", "is_active",
            "created_at", "updated_at",
        ],
        "forbidden_keys": ["sessions", "attendance", "payroll_calculations"],
    },
    ("POST/PATCH/PUT", "/api/nocobase/config/session-types/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": [
            "id", "code", "label", "default_capacity", "is_active",
            "created_at", "updated_at",
        ],
        "forbidden_keys": ["sessions", "attendance", "payroll_calculations"],
    },
    ("DELETE", "/api/nocobase/config/session-types/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": [
            "id", "code", "label", "default_capacity", "is_active",
            "created_at", "updated_at",
        ],
        "forbidden_keys": ["sessions", "attendance", "payroll_calculations"],
    },
    ("GET", "/api/nocobase/config/quiet-hours/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "top_level_keys": ["policies"],
        "collection_key": "policies",
        "item_keys": ["id", "channel", "starts_at", "ends_at", "timezone", "is_active", "created_at"],
        "forbidden_keys": ["notification_logs", "delivery_state"],
    },
    ("POST", "/api/nocobase/config/quiet-hours/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": ["id", "channel", "starts_at", "ends_at", "timezone", "is_active", "created_at"],
        "forbidden_keys": ["notification_logs", "delivery_state"],
    },
    ("GET", "/api/nocobase/config/quiet-hours/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": ["id", "channel", "starts_at", "ends_at", "timezone", "is_active", "created_at"],
        "forbidden_keys": ["notification_logs", "delivery_state"],
    },
    ("POST/PATCH/PUT", "/api/nocobase/config/quiet-hours/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": ["id", "channel", "starts_at", "ends_at", "timezone", "is_active", "created_at"],
        "forbidden_keys": ["notification_logs", "delivery_state"],
    },
    ("DELETE", "/api/nocobase/config/quiet-hours/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": ["id", "channel", "starts_at", "ends_at", "timezone", "is_active", "created_at"],
        "forbidden_keys": ["notification_logs", "delivery_state"],
    },
    ("GET", "/api/nocobase/config/payroll/schemes/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "top_level_keys": ["schemes"],
        "collection_key": "schemes",
        "item_keys": ["id", "name", "location", "is_active", "created_at", "updated_at"],
        "forbidden_keys": ["calculations", "payouts"],
    },
    ("POST", "/api/nocobase/config/payroll/schemes/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": ["id", "name", "location", "is_active", "created_at", "updated_at"],
        "forbidden_keys": ["calculations", "payouts"],
    },
    ("GET", "/api/nocobase/config/payroll/schemes/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": ["id", "name", "location", "is_active", "created_at", "updated_at"],
        "forbidden_keys": ["calculations", "payouts"],
    },
    ("POST/PATCH/PUT", "/api/nocobase/config/payroll/schemes/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": ["id", "name", "location", "is_active", "created_at", "updated_at"],
        "forbidden_keys": ["calculations", "payouts"],
    },
    ("DELETE", "/api/nocobase/config/payroll/schemes/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": ["id", "name", "location", "is_active", "created_at", "updated_at"],
        "forbidden_keys": ["calculations", "payouts"],
    },
    ("GET", "/api/nocobase/config/payroll/rules/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "top_level_keys": ["rules"],
        "collection_key": "rules",
        "item_keys": [
            "id", "scheme_id", "scheme", "session_type", "rule_type",
            "base_amount_minor", "currency", "min_clients_threshold",
            "extra_client_amount_minor", "is_active", "created_at", "updated_at",
        ],
        "forbidden_keys": ["calculations", "payouts", "attendance_history"],
    },
    ("POST", "/api/nocobase/config/payroll/rules/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": [
            "id", "scheme_id", "scheme", "session_type", "rule_type",
            "base_amount_minor", "currency", "min_clients_threshold",
            "extra_client_amount_minor", "is_active", "created_at", "updated_at",
        ],
        "forbidden_keys": ["calculations", "payouts", "attendance_history"],
    },
    ("GET", "/api/nocobase/config/payroll/rules/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": [
            "id", "scheme_id", "scheme", "session_type", "rule_type",
            "base_amount_minor", "currency", "min_clients_threshold",
            "extra_client_amount_minor", "is_active", "created_at", "updated_at",
        ],
        "forbidden_keys": ["calculations", "payouts", "attendance_history"],
    },
    ("POST/PATCH/PUT", "/api/nocobase/config/payroll/rules/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": [
            "id", "scheme_id", "scheme", "session_type", "rule_type",
            "base_amount_minor", "currency", "min_clients_threshold",
            "extra_client_amount_minor", "is_active", "created_at", "updated_at",
        ],
        "forbidden_keys": ["calculations", "payouts", "attendance_history"],
    },
    ("DELETE", "/api/nocobase/config/payroll/rules/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": [
            "id", "scheme_id", "scheme", "session_type", "rule_type",
            "base_amount_minor", "currency", "min_clients_threshold",
            "extra_client_amount_minor", "is_active", "created_at", "updated_at",
        ],
        "forbidden_keys": ["calculations", "payouts", "attendance_history"],
    },
    ("GET", "/api/nocobase/config/payroll/assignments/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "top_level_keys": ["assignments"],
        "collection_key": "assignments",
        "item_keys": [
            "id", "trainer_id", "trainer", "scheme_id", "scheme",
            "effective_from", "effective_to", "created_at",
        ],
        "forbidden_keys": ["calculations", "payouts"],
    },
    ("POST", "/api/nocobase/config/payroll/assignments/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": [
            "id", "trainer_id", "trainer", "scheme_id", "scheme",
            "effective_from", "effective_to", "created_at",
        ],
        "forbidden_keys": ["calculations", "payouts"],
    },
    ("GET", "/api/nocobase/config/languages/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "top_level_keys": ["languages"],
        "collection_key": "languages",
        "item_keys": ["id", "code", "name", "is_active"],
        "forbidden_keys": [],
    },
    ("POST", "/api/nocobase/config/languages/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": ["id", "code", "name", "is_active"],
        "forbidden_keys": [],
    },
    ("GET", "/api/nocobase/config/languages/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": ["id", "code", "name", "is_active"],
        "forbidden_keys": [],
    },
    ("POST/PATCH/PUT", "/api/nocobase/config/languages/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": ["id", "code", "name", "is_active"],
        "forbidden_keys": [],
    },
    ("DELETE", "/api/nocobase/config/languages/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": ["id", "code", "name", "is_active"],
        "forbidden_keys": [],
    },
    ("GET", "/api/nocobase/config/dictionary-keys/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "top_level_keys": ["keys"],
        "collection_key": "keys",
        "item_keys": ["id", "domain", "code", "is_active"],
        "forbidden_keys": [],
    },
    ("POST", "/api/nocobase/config/dictionary-keys/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": ["id", "domain", "code", "is_active"],
        "forbidden_keys": [],
    },
    ("GET", "/api/nocobase/config/dictionary-keys/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": ["id", "domain", "code", "is_active"],
        "forbidden_keys": [],
    },
    ("POST/PATCH/PUT", "/api/nocobase/config/dictionary-keys/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": ["id", "domain", "code", "is_active"],
        "forbidden_keys": [],
    },
    ("DELETE", "/api/nocobase/config/dictionary-keys/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": ["id", "domain", "code", "is_active"],
        "forbidden_keys": [],
    },
    ("GET", "/api/nocobase/config/dictionary-translations/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "top_level_keys": ["translations"],
        "collection_key": "translations",
        "item_keys": [
            "id", "key_id", "domain", "code", "language_code", "value",
            "created_at", "updated_at",
        ],
        "forbidden_keys": [],
    },
    ("POST", "/api/nocobase/config/dictionary-translations/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": [
            "id", "key_id", "domain", "code", "language_code", "value",
            "created_at", "updated_at",
        ],
        "forbidden_keys": [],
    },
    ("GET", "/api/nocobase/config/dictionary-translations/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": [
            "id", "key_id", "domain", "code", "language_code", "value",
            "created_at", "updated_at",
        ],
        "forbidden_keys": [],
    },
    ("POST/PATCH/PUT", "/api/nocobase/config/dictionary-translations/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": [
            "id", "key_id", "domain", "code", "language_code", "value",
            "created_at", "updated_at",
        ],
        "forbidden_keys": [],
    },
    ("DELETE", "/api/nocobase/config/dictionary-translations/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "top_level_keys": ["deleted", "id"],
        "forbidden_keys": [],
    },
    ("GET", "/api/nocobase/config/notification-template-translations/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "top_level_keys": ["translations"],
        "collection_key": "translations",
        "item_keys": [
            "id", "template_id", "event_type", "channel", "language_code",
            "subject", "body", "created_at", "updated_at",
        ],
        "forbidden_keys": ["notification_logs", "delivery_state"],
    },
    ("POST", "/api/nocobase/config/notification-template-translations/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": [
            "id", "template_id", "event_type", "channel", "language_code",
            "subject", "body", "created_at", "updated_at",
        ],
        "forbidden_keys": ["notification_logs", "delivery_state"],
    },
    ("GET", "/api/nocobase/config/notification-template-translations/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": [
            "id", "template_id", "event_type", "channel", "language_code",
            "subject", "body", "created_at", "updated_at",
        ],
        "forbidden_keys": ["notification_logs", "delivery_state"],
    },
    ("POST/PATCH/PUT", "/api/nocobase/config/notification-template-translations/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "object_keys": [
            "id", "template_id", "event_type", "channel", "language_code",
            "subject", "body", "created_at", "updated_at",
        ],
        "forbidden_keys": ["notification_logs", "delivery_state"],
    },
    ("DELETE", "/api/nocobase/config/notification-template-translations/<id>/"): {
        "mode": "guarded_config",
        "token": "NOCOBASE_CONFIG_TOKEN",
        "top_level_keys": ["deleted", "id"],
        "forbidden_keys": [],
    },
}
