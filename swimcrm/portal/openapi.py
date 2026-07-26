import re


OPENAPI_VERSION = "3.1.0"
API_VERSION = "2026-07-26"
PATH_PARAMETER = re.compile(r"<(?:(?P<converter>\w+):)?(?P<name>\w+)>")
HTTP_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"}


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
            if parameters:
                operation["parameters"] = parameters
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
