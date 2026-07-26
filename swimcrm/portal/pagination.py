from math import ceil

from django.core.exceptions import ValidationError


DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200


def pagination_params(request):
    try:
        page = int(request.GET.get("page", 1))
        page_size = int(request.GET.get("page_size", DEFAULT_PAGE_SIZE))
    except (TypeError, ValueError) as exc:
        raise ValidationError("page and page_size must be integers") from exc
    if page < 1:
        raise ValidationError("page must be at least 1")
    if page_size < 1 or page_size > MAX_PAGE_SIZE:
        raise ValidationError(f"page_size must be between 1 and {MAX_PAGE_SIZE}")
    return page, page_size


def paginated_payload(request, rows, *, key, serializer):
    page, page_size = pagination_params(request)
    total = rows.count() if hasattr(rows, "count") and not isinstance(rows, list) else len(rows)
    start = (page - 1) * page_size
    page_rows = rows[start:start + page_size]
    pages = ceil(total / page_size) if total else 0
    return {
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
