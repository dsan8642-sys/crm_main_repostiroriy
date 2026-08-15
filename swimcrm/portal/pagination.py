from math import ceil

from django.core.exceptions import ValidationError


DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200
LIST_CONTRACT_PARAMS = frozenset({"page", "page_size", "search", "q", "order"})


def field_validation_error(field, message, *, code="invalid"):
    return ValidationError({
        field: ValidationError(message, code=code),
    })


def list_contract_requested(request, *, extra_params=()):
    """Return True only when the caller opted into the new list contract.

    Legacy endpoints use this guard to keep their exact no-param and
    legacy-filter response shapes while the new UI always sends page and
    page_size explicitly.
    """
    return any(
        name in request.GET
        for name in LIST_CONTRACT_PARAMS.union(extra_params)
    )


def search_param(request):
    """Support the new search parameter without changing legacy q callers."""
    name = "search" if "search" in request.GET else "q"
    return request.GET.get(name, "").strip()


def choice_param(request, name, choices, *, default="", allow_blank=True):
    value = request.GET.get(name, default)
    if value == "" and allow_blank:
        return value
    if value not in choices:
        raise field_validation_error(
            name,
            "Выберите допустимое значение.",
            code="invalid_choice",
        )
    return value


def positive_int_param(request, name, *, allow_blank=True):
    value = request.GET.get(name)
    if value in (None, "") and allow_blank:
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise field_validation_error(
            name,
            "Значение должно быть целым числом.",
            code="invalid_integer",
        ) from exc
    if parsed < 1:
        raise field_validation_error(
            name,
            "Значение должно быть не меньше 1.",
            code="min_value",
        )
    return parsed


def ordered_rows(request, rows, *, allowlist, default):
    order = request.GET.get("order", default)
    fields = allowlist.get(order)
    if fields is None:
        raise field_validation_error(
            "order",
            "Выберите допустимый порядок сортировки.",
            code="invalid_choice",
        )
    if callable(fields):
        return sorted(rows, key=fields)
    if hasattr(rows, "order_by"):
        return rows.order_by(*fields)
    raise TypeError("In-memory ordering requires a callable allowlist value")


def pagination_params(request, *, max_page_size=MAX_PAGE_SIZE):
    try:
        page = int(request.GET.get("page", 1))
    except (TypeError, ValueError) as exc:
        raise ValidationError({
            "page": ValidationError(
                "Номер страницы должен быть целым числом.", code="invalid_integer")
        }) from exc
    try:
        page_size = int(request.GET.get("page_size", DEFAULT_PAGE_SIZE))
    except (TypeError, ValueError) as exc:
        raise ValidationError({
            "page_size": ValidationError(
                "Размер страницы должен быть целым числом.", code="invalid_integer")
        }) from exc
    if page < 1:
        raise ValidationError({
            "page": ValidationError(
                "Номер страницы должен быть не меньше 1.", code="min_value")
        })
    if page_size < 1 or page_size > max_page_size:
        raise ValidationError({
            "page_size": ValidationError(
                f"Размер страницы должен быть от 1 до {max_page_size}.",
                code="out_of_range")
        })
    return page, page_size


def paginated_payload(
        request, rows, *, key, serializer, max_page_size=MAX_PAGE_SIZE,
        extra=None):
    page, page_size = pagination_params(
        request, max_page_size=max_page_size)
    total = rows.count() if hasattr(rows, "count") and not isinstance(rows, list) else len(rows)
    start = (page - 1) * page_size
    page_rows = rows[start:start + page_size]
    pages = ceil(total / page_size) if total else 0
    payload = {
        key: [serializer(row) for row in page_rows],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "pages": pages,
            "has_next": page < pages,
            "has_previous": page > 1 and total > 0,
        },
    }
    if extra:
        payload.update(extra)
    return payload
