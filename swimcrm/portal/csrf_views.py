from django.http import JsonResponse


CSRF_MESSAGES = {
    "ru": "Сессия формы устарела. Обновите страницу и повторите действие.",
    "uk": "Сесія форми застаріла. Оновіть сторінку та повторіть дію.",
    "pl": "Sesja formularza wygasła. Odśwież stronę i spróbuj ponownie.",
    "en": "The form session expired. Refresh the page and try again.",
}


def _request_language(request):
    for item in request.headers.get("Accept-Language", "").split(","):
        code = item.split(";", 1)[0].strip().lower().split("-", 1)[0]
        if code == "ua":
            code = "uk"
        if code in CSRF_MESSAGES:
            return code
    return "ru"


def csrf_failure(request, reason=""):
    """Return the API's stable error contract without exposing CSRF diagnostics."""

    return JsonResponse(
        {
            "error": CSRF_MESSAGES[_request_language(request)],
            "code": "csrf_failed",
            "errors": {},
            "non_field_errors": [],
        },
        status=403,
    )
