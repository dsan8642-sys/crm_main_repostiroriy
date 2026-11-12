import re

from common.schedule_palette import SCHEDULE_COLOR_KEYS


OPENAPI_VERSION = "3.1.0"
API_VERSION = "2026-11-03"
PATH_PARAMETER = re.compile(r"<(?:(?P<converter>\w+):)?(?P<name>\w+)>")
HTTP_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"}
GROUP_COLOR_KEY_SCHEMA = {
    "anyOf": [
        {"type": "null"},
        {"type": "string", "enum": sorted(SCHEDULE_COLOR_KEYS)},
        {"type": "string", "pattern": r"^#[0-9A-Fa-f]{6}$"},
    ],
}

BASE_LIST_PARAMETERS = [
    {"name": "page", "in": "query", "schema": {"type": "integer", "minimum": 1}},
    {"name": "page_size", "in": "query", "schema": {
        "type": "integer", "minimum": 1, "maximum": 200,
    }},
    {"name": "search", "in": "query", "schema": {"type": "string"}},
    {"name": "q", "in": "query", "deprecated": True, "schema": {"type": "string"}},
]


def _query_parameter(name, *, values=None, value_type="string", minimum=None, description=None):
    schema = {"type": value_type}
    if values:
        schema["enum"] = list(values)
    if minimum is not None:
        schema["minimum"] = minimum
    return {"name": name, "in": "query", "schema": schema,
            **({"description": description} if description else {})}


LIST_QUERY_POLICIES = {
    "/api/admin/clients/": [
        _query_parameter("all", values=("true", "false")),
        _query_parameter("active", values=("true", "false")),
        _query_parameter("group_id", value_type="integer", minimum=1),
        _query_parameter("trainer_id", value_type="integer", minimum=1),
        _query_parameter("debt", values=("yes", "no")),
        _query_parameter("subscription", values=("with", "without")),
        _query_parameter("balance", values=("positive", "negative", "zero")),
        _query_parameter("activity", values=("active", "inactive")),
    ],
    "/api/admin/trainers/": [
        _query_parameter("active", values=("true", "false")),
    ],
    "/api/admin/groups/": [
        _query_parameter("active", values=("true", "false")),
        _query_parameter("trainer_id", value_type="integer", minimum=1),
    ],
    "/api/admin/subscriptions/": [
        _query_parameter("category", values=(
            "active", "ending_soon", "depleted", "expired_remaining", "future", "history",
        )),
        _query_parameter("subscription_type_id", value_type="integer", minimum=1),
        _query_parameter("group_id", value_type="integer", minimum=1),
        _query_parameter("end_from"),
        _query_parameter("end_to"),
    ],
    "/api/admin/payments/": [
        _query_parameter("participant_id", value_type="integer", minimum=1),
        _query_parameter("status", values=("pending", "confirmed", "rejected")),
        _query_parameter("method", values=("cash", "card", "bank_transfer", "other")),
        _query_parameter("source", values=("admin", "client_top_up")),
    ],
    "/api/admin/debtors/": [
        _query_parameter("group_id", value_type="integer", minimum=1),
        _query_parameter("min_amount_minor", value_type="integer", minimum=1),
        _query_parameter("days_overdue_max", value_type="integer", minimum=1),
    ],
    "/api/trainer/history/": [
        _query_parameter("group_id", value_type="integer", minimum=1),
        _query_parameter("date_from"),
        _query_parameter("date_to"),
        _query_parameter("status", values=("active", "cancelled")),
    ],
    "/api/client/attendance/": [
        _query_parameter("student_id", value_type="integer", minimum=1),
        _query_parameter("date_from"),
        _query_parameter("date_to"),
        _query_parameter("status", values=("present", "absent", "excused", "rescheduled")),
    ],
    "/api/client/charges/": [
        _query_parameter("student_id", value_type="integer", minimum=1,
                         description="Optional ownership check; financial records cover the entire family."),
        _query_parameter("date_from"),
        _query_parameter("date_to"),
        _query_parameter("status", values=("overdue", "upcoming")),
    ],
    "/api/client/payment-history/": [
        _query_parameter("student_id", value_type="integer", minimum=1,
                         description="Optional ownership check; financial records cover the entire family."),
        _query_parameter("date_from"),
        _query_parameter("date_to"),
        _query_parameter("status", values=("pending", "confirmed", "rejected")),
        _query_parameter("method", values=("cash", "card", "bank_transfer", "other")),
        _query_parameter("source", values=("admin", "client_top_up")),
    ],
}

LIST_ORDER_POLICIES = {
    "/api/admin/clients/": ("name", "-name", "id", "-id"),
    "/api/admin/trainers/": ("name", "-name", "id", "-id"),
    "/api/admin/groups/": ("sort_order", "name", "-name", "id", "-id"),
    "/api/admin/payments/": ("-date", "date", "-amount", "amount", "status", "-status"),
    "/api/admin/debtors/": ("-balance", "balance", "name", "-due", "due"),
    "/api/trainer/history/": ("-date", "date", "group", "-group"),
    "/api/client/attendance/": ("-date", "date", "status", "-status"),
    "/api/client/charges/": ("-date", "date", "-amount", "amount"),
    "/api/client/payment-history/": (
        "-date", "date", "-amount", "amount", "status", "-status"),
}

SUBSCRIPTION_OPERATION_PATHS = {
    "/api/admin/participants/{participant_id}/subscriptions/",
    "/api/admin/subscriptions/{subscription_id}/renew/",
}

SUBSCRIPTION_UPDATE_PATHS = {
    "/api/admin/subscriptions/{subscription_id}/",
}

SUBSCRIPTION_COMBINED_UPDATE_PATHS = {
    "/api/admin/subscriptions/{subscription_id}/update/",
}


def _allowed_methods(view):
    methods = set()
    visited = set()

    def visit(value):
        value_id = id(value)
        if value_id in visited:
            return
        visited.add(value_id)
        if isinstance(value, (list, tuple, set)):
            strings = {item.upper() for item in value if isinstance(item, str)}
            if strings and strings <= HTTP_METHODS:
                methods.update(strings)
            return
        if callable(value):
            for cell in getattr(value, "__closure__", None) or ():
                try:
                    visit(cell.cell_contents)
                except ValueError:
                    continue
            wrapped = getattr(value, "__wrapped__", None)
            if wrapped is not None:
                visit(wrapped)

    visit(view)
    return sorted(methods or {"GET"})


def _openapi_path(route):
    return PATH_PARAMETER.sub(
        lambda match: "{" + match.group("name") + "}", f"/api/{route}")


def _path_parameters(route):
    parameters = []
    for match in PATH_PARAMETER.finditer(route):
        converter = match.group("converter") or "str"
        parameters.append({
            "name": match.group("name"),
            "in": "path",
            "required": True,
            "schema": {"type": "integer"} if converter == "int" else {"type": "string"},
        })
    return parameters


def build_openapi_schema():
    # Imported lazily to avoid a circular import while Django constructs urls.py.
    from .urls import urlpatterns

    paths = {}
    operation_ids = set()
    for pattern in urlpatterns:
        route = str(pattern.pattern)
        path = _openapi_path(route)
        parameters = _path_parameters(route)
        route_name = pattern.name or re.sub(r"\W+", "_", route).strip("_")
        for method in _allowed_methods(pattern.callback):
            if method in {"HEAD", "OPTIONS"}:
                continue
            operation_id = f"{method.lower()}_{route_name.replace('-', '_')}"
            if operation_id in operation_ids:
                operation_id = f"{operation_id}_{len(operation_ids)}"
            operation_ids.add(operation_id)
            operation = {
                "operationId": operation_id,
                "responses": {
                    "200": {"description": "Successful response"},
                    "400": {
                        "description": "Validation error",
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/ApiError"},
                            },
                        },
                    },
                },
            }
            auth_bodies = {
                "/api/auth/mfa/setup/": ["current_password"],
                "/api/auth/mfa/verify/": ["code"],
                "/api/admin/system/administrators/": ["full_name", "username", "current_password"],
                "/api/auth/activate/": ["activation_token", "password"],
            }
            if method == "POST" and path in auth_bodies:
                fields = auth_bodies[path]
                operation["requestBody"] = {"required": True, "content": {"application/json": {"schema": {
                    "type": "object", "required": fields,
                    "properties": {field: {"type": "string"} for field in fields},
                }}}}
            if method == "POST" and path == "/api/auth/login/":
                operation["responses"]["200"]["content"] = {"application/json": {"schema": {
                    "type": "object",
                    "properties": {
                        "mfa_required": {"type": "boolean"},
                        "offer_mfa_setup": {"type": "boolean"},
                    },
                }}}
            if method == "POST" and path.startswith("/api/admin/system/administrators/{user_id}/"):
                operation["requestBody"] = {"required": True, "content": {"application/json": {"schema": {
                    "type": "object", "required": ["current_password"],
                    "properties": {"current_password": {"type": "string"}},
                }}}}
            if path.startswith(("/api/admin/", "/api/documents/")):
                operation["responses"]["403"] = {"description": "Administrator TOTP required when enrolled; code mfa_required"}
            operation_parameters = list(parameters)
            if method == "GET" and path == "/api/admin/payroll/preview/":
                operation["description"] = "Read-only salary preview for completed sessions; no payroll period is created or changed."
                operation_parameters.extend([
                    {"name": "date_from", "in": "query", "required": True, "schema": {"type": "string", "format": "date"}},
                    {"name": "date_to", "in": "query", "required": True, "schema": {"type": "string", "format": "date"}},
                    _query_parameter("trainer_id", value_type="integer", minimum=1),
                ])
            if method == "GET" and path in LIST_QUERY_POLICIES:
                operation_parameters.extend(BASE_LIST_PARAMETERS)
                operation_parameters.extend(LIST_QUERY_POLICIES[path])
                if path in LIST_ORDER_POLICIES:
                    operation_parameters.append(_query_parameter(
                        "order", values=LIST_ORDER_POLICIES[path]))
                operation["x-page-size-500"] = (
                    "blocked pending endpoint query and payload budgets"
                )
            if method == "GET" and path == "/api/admin/clients/{client_id}/":
                operation_parameters.append(_query_parameter(
                    "include_unmarked", values=("1",),
                    description="Include completed unmarked roster sessions in a separate unmarked_attendance array."))
            if method == "GET" and path == "/api/trainer/sessions/":
                operation_parameters.extend([
                    _query_parameter("date_from"), _query_parameter("date_to"),
                    _query_parameter("status", values=("active", "cancelled")),
                    _query_parameter("page", value_type="integer", minimum=1),
                    _query_parameter("page_size", value_type="integer", minimum=1,
                                     description="Maximum 200; supplying page or page_size adds pagination to the response."),
                ])
            if operation_parameters:
                operation["parameters"] = operation_parameters
            if "/notes/" in path and "/participants/" in path:
                operation["description"] = (
                    "Internal participant notes. Admins may access any participant; trainers must be assigned "
                    "to the specified session and the participant must be on its roster. Cancelled sessions "
                    "allow GET only. Client accounts have no access."
                )
                if method in {"POST", "PATCH"}:
                    operation["requestBody"] = {"required": True, "content": {"application/json": {"schema": {
                        "type": "object", "required": ["body"], "properties": {
                            "body": {"type": "string", "minLength": 1, "maxLength": 4000},
                        },
                    }}}}
                if method == "GET" or method in {"POST", "PATCH"}:
                    note_schema = {"type": "object", "properties": {
                        "id": {"type": "integer"}, "body": {"type": "string"},
                        "author": {"type": ["string", "null"]}, "imported": {"type": "boolean"},
                        "created_at": {"type": "string", "format": "date-time"},
                        "updated_at": {"type": "string", "format": "date-time"},
                        "edited": {"type": "boolean"}, "can_manage": {"type": "boolean"},
                    }}
                    response_schema = {"type": "object", "properties": {"notes": {"type": "array", "items": note_schema}}} if method == "GET" else note_schema
                    operation["responses"]["200" if method == "GET" or method == "PATCH" else "201"] = {
                        "description": "Private response; Cache-Control: private, no-store",
                        "content": {"application/json": {"schema": response_schema}},
                    }
            if path in {"/api/admin/payroll/rates/", "/api/admin/payroll/rates/{rate_id}/"} and method in {"POST", "PATCH"}:
                operation["requestBody"] = {"required": True, "content": {"application/json": {"schema": {
                    "type": "object", "properties": {
                        "name": {"type": "string"}, "session_type": {"enum": ["group", "individual", "split"]},
                        "base_amount_minor": {"type": "integer", "minimum": 0},
                        "currency": {"enum": ["PLN", "EUR", "USD"]},
                        "min_clients_threshold": {"type": ["integer", "null"], "minimum": 0},
                        "extra_client_amount_minor": {"type": ["integer", "null"], "minimum": 0},
                        "effective_from": {"type": "string", "format": "date"},
                    },
                }}}}
            if path == "/api/admin/payroll/assign-rates/" and method == "POST":
                operation["requestBody"] = {"required": True, "content": {"application/json": {"schema": {
                    "type": "object", "required": ["rate_id", "trainer_ids", "effective_from"],
                    "properties": {"rate_id": {"type": "integer"},
                                   "trainer_ids": {"type": "array", "items": {"type": "integer"}},
                                   "location": {"type": "string"},
                                   "effective_from": {"type": "string", "format": "date"}},
                }}}}
            if method == "POST" and path == "/api/admin/participants/{participant_id}/photo/":
                operation["requestBody"] = {
                    "required": True,
                    "content": {"multipart/form-data": {"schema": {
                        "type": "object", "required": ["photo"],
                        "properties": {"photo": {"type": "string", "format": "binary"}},
                    }}},
                }
            if method == "GET" and path.endswith("/photo/"):
                operation["responses"]["200"] = {
                    "description": "Protected JPEG; private, no-store",
                    "content": {"image/jpeg": {"schema": {"type": "string", "format": "binary"}}},
                }
            if method in {"POST", "PATCH"} and path in {
                "/api/admin/groups/", "/api/admin/groups/{group_id}/",
            }:
                operation["requestBody"] = {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "properties": {
                            "color_key": GROUP_COLOR_KEY_SCHEMA,
                            "group": {"type": "object", "properties": {
                                "color_key": GROUP_COLOR_KEY_SCHEMA,
                            }},
                        },
                    }}},
                }
            if method == "POST" and path == "/api/dev/appearance/":
                appearance_schema = {
                    "type": "object", "required": ["revision", "state"],
                    "properties": {
                        "revision": {"type": "string"},
                        "state": {
                            "type": "object", "required": ["values", "presets"],
                            "properties": {
                                "values": {"type": "object", "additionalProperties": {"type": "string"}},
                                "presets": {"type": "array", "maxItems": 20, "items": {"type": "object"}},
                            },
                        },
                    },
                }
                operation["requestBody"] = {
                    "required": True,
                    "content": {"application/json": {"schema": appearance_schema}},
                }
            if method == "POST" and path in SUBSCRIPTION_OPERATION_PATHS:
                operation["requestBody"] = {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "$ref": "#/components/schemas/SubscriptionOperation",
                    }}},
                }
            if method == "POST" and path in SUBSCRIPTION_UPDATE_PATHS:
                operation["requestBody"] = {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "$ref": "#/components/schemas/SubscriptionUpdate",
                    }}},
                }
            if method == "POST" and path in SUBSCRIPTION_COMBINED_UPDATE_PATHS:
                operation["requestBody"] = {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "$ref": "#/components/schemas/SubscriptionCombinedUpdate",
                    }}},
                }
            if method == "POST" and path == "/api/admin/subscriptions/{subscription_id}/cancel-sale/":
                operation["description"] = "Cancel an unused subscription sale, reverse its charge, and credit paid funds to the family balance atomically."
            if method == "POST" and path == "/api/admin/charges/{charge_id}/reverse/":
                operation["description"] = "Reverse a manual charge within 48 hours of its creation. Exact idempotent replays remain valid afterward."
            if method == "POST" and path == "/api/admin/participants/{participant_id}/attendance/payment/":
                operation["requestBody"] = {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object", "required": ["attendance_ids", "source"],
                        "properties": {
                            "attendance_ids": {"type": "array", "minItems": 1, "maxItems": 2000,
                                               "uniqueItems": True, "items": {"type": "integer", "minimum": 1}},
                            "source": {"type": "string", "enum": ["account", "subscription"]},
                            "subscription_id": {"type": "integer", "minimum": 1,
                                                "description": "Required if more than one eligible subscription is available. Eligible means not cancelled and either not expired (effective end date, Warsaw today) or has a positive session balance."},
                        },
                        "description": "Atomically reassign billable visits without changing payments. Explicit reassignment enables billing for selected history-only visits. Negative subscription balances and visits before the subscription start date are allowed.",
                    }}},
                }
            if method == "POST" and path == "/api/admin/settings/session-types/":
                operation["requestBody"] = {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "required": ["code", "label", "base_type"],
                        "properties": {
                            "code": {"type": "string", "pattern": "^[a-z][a-z0-9_-]*$"},
                            "label": {"type": "string"},
                            "base_type": {"type": "string", "enum": ["group", "individual", "split"]},
                            "default_capacity": {"type": ["integer", "null"], "minimum": 1},
                            "default_duration_minutes": {"type": "integer", "minimum": 15},
                            "default_price_minor": {"type": ["integer", "null"], "minimum": 0},
                        },
                    }}},
                }
            if method == "PATCH" and path == "/api/admin/settings/client-portal/":
                operation["requestBody"] = {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "required": ["history_from"],
                        "properties": {
                            "history_from": {
                                "anyOf": [
                                    {"type": "string", "format": "date"},
                                    {"type": "string", "enum": [""]},
                                    {"type": "null"},
                                ],
                                "description": "Set the first client-visible history date; null or an empty string disables the cutoff.",
                            },
                        },
                    }}},
                }
            if method in {"POST", "DELETE"} and path in {
                "/api/client/schedule/sessions/{session_id}/booking/",
                "/api/client/schedule/sessions/{session_id}/waitlist/",
                "/api/admin/schedule/sessions/{session_id}/attendance/",
                "/api/trainer/sessions/{session_id}/attendance/",
            }:
                attendance_mark = method == "POST" and path.endswith("/attendance/")
                operation["requestBody"] = {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object",
                        "required": ["student_id", "status"] if attendance_mark else ["student_id"],
                        "properties": {
                            "student_id": {"type": "integer", "minimum": 1},
                            **({"status": {"type": "string", "enum": ["present", "absent", "excused", "rescheduled"]}} if attendance_mark else {}),
                        },
                    }}},
                }
            paths.setdefault(path, {})[method.lower()] = operation

    return {
        "openapi": OPENAPI_VERSION,
        "info": {
            "title": "SwimCRM API",
            "version": API_VERSION,
            "description": "Canonical machine-readable API route and method contract.",
        },
        "servers": [{"url": "/api"}],
        "paths": dict(sorted(paths.items())),
        "components": {
            "securitySchemes": {
                "djangoSession": {"type": "apiKey", "in": "cookie", "name": "sessionid"},
            },
            "schemas": {
                "ApiError": {
                    "type": "object",
                    "required": ["error"],
                    "properties": {"error": {}},
                },
                "Pagination": {
                    "type": "object",
                    "required": [
                        "page", "page_size", "total", "pages",
                        "has_next", "has_previous",
                    ],
                    "properties": {
                        "page": {"type": "integer", "minimum": 1},
                        "page_size": {"type": "integer", "minimum": 1, "maximum": 200},
                        "total": {"type": "integer", "minimum": 0},
                        "pages": {"type": "integer", "minimum": 0},
                        "has_next": {"type": "boolean"},
                        "has_previous": {"type": "boolean"},
                    },
                },
                "SubscriptionOperation": {
                    "type": "object",
                    "required": ["subscription_type_id", "idempotency_key"],
                    "properties": {
                        "subscription_type_id": {"type": "integer", "minimum": 1},
                        "price_minor": {"type": "integer", "minimum": 0, "description": "Final sale price in minor units; cannot exceed the current catalog price. Defaults to catalog price."},
                        "start_date": {"type": "string", "format": "date"},
                        "due_date": {"type": "string", "format": "date"},
                        "idempotency_key": {"type": "string", "minLength": 1, "maxLength": 128},
                        "payment_received": {"type": "boolean", "default": False},
                        "payment_method": {
                            "type": "string",
                            "enum": ["cash", "bank_transfer", "card", "other"],
                            "description": "Required when payment_received is true.",
                        },
                        "payment_date": {
                            "type": "string", "format": "date",
                            "description": "Required when payment_received is true.",
                        },
                    },
                },
                "SubscriptionUpdate": {
                    "type": "object",
                    "description": (
                        "Update either the subscription status or its effective end date. "
                        "Freeze history and session ledger entries are preserved."
                    ),
                    "properties": {
                        "status": {
                            "type": "string",
                            "enum": ["active", "frozen", "expired"],
                        },
                        "effective_end_date": {"type": "string", "format": "date"},
                    },
                    "anyOf": [
                        {"required": ["status"]},
                        {"required": ["effective_end_date"]},
                    ],
                },
                "SubscriptionCombinedUpdate": {
                    "type": "object",
                    "required": ["reason"],
                    "properties": {
                        "reason": {"type": "string", "minLength": 1, "maxLength": 255},
                        "start_date": {"type": "string", "format": "date",
                                       "description": "Independent from the end date; does not recalculate past attendance."},
                        "effective_end_date": {"type": "string", "format": "date"},
                        "remaining_sessions": {"type": "integer", "minimum": 0},
                        "freeze": {"type": "object", "required": ["start_date", "end_date"],
                                   "properties": {"start_date": {"type": "string", "format": "date"},
                                                  "end_date": {"type": "string", "format": "date"}}},
                    },
                },
            },
        },
        "security": [{"djangoSession": []}],
    }
