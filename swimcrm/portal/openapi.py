import re


OPENAPI_VERSION = "3.1.0"
API_VERSION = "2026-08-14"
PATH_PARAMETER = re.compile(r"<(?:(?P<converter>\w+):)?(?P<name>\w+)>")
HTTP_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"}

BASE_LIST_PARAMETERS = [
    {"name": "page", "in": "query", "schema": {"type": "integer", "minimum": 1}},
    {"name": "page_size", "in": "query", "schema": {
        "type": "integer", "minimum": 1, "maximum": 200,
    }},
    {"name": "search", "in": "query", "schema": {"type": "string"}},
    {"name": "q", "in": "query", "deprecated": True, "schema": {"type": "string"}},
]


def _query_parameter(name, *, values=None, value_type="string", minimum=None):
    schema = {"type": value_type}
    if values:
        schema["enum"] = list(values)
    if minimum is not None:
        schema["minimum"] = minimum
    return {"name": name, "in": "query", "schema": schema}


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
        _query_parameter("student_id", value_type="integer", minimum=1),
        _query_parameter("date_from"),
        _query_parameter("date_to"),
        _query_parameter("status", values=("overdue", "upcoming")),
    ],
    "/api/client/payment-history/": [
        _query_parameter("student_id", value_type="integer", minimum=1),
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
    "/api/admin/groups/": ("name", "-name", "id", "-id"),
    "/api/admin/payments/": ("-date", "date", "-amount", "amount", "status", "-status"),
    "/api/admin/debtors/": ("-balance", "balance", "name", "-due", "due"),
    "/api/trainer/history/": ("-date", "date", "group", "-group"),
    "/api/client/attendance/": ("-date", "date", "status", "-status"),
    "/api/client/charges/": ("-date", "date", "-amount", "amount"),
    "/api/client/payment-history/": (
        "-date", "date", "-amount", "amount", "status", "-status"),
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
            operation_parameters = list(parameters)
            if method == "GET" and path in LIST_QUERY_POLICIES:
                operation_parameters.extend(BASE_LIST_PARAMETERS)
                operation_parameters.extend(LIST_QUERY_POLICIES[path])
                if path in LIST_ORDER_POLICIES:
                    operation_parameters.append(_query_parameter(
                        "order", values=LIST_ORDER_POLICIES[path]))
                operation["x-page-size-500"] = (
                    "blocked pending endpoint query and payload budgets"
                )
            if operation_parameters:
                operation["parameters"] = operation_parameters
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
            },
        },
        "security": [{"djangoSession": []}],
    }
