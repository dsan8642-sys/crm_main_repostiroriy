from django.core.exceptions import PermissionDenied, ValidationError
from django.http import Http404, JsonResponse


class ApiExceptionMiddleware:
    """Return JSON errors for API endpoints instead of rendering HTML error pages."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            return self.get_response(request)
        except ValidationError as exc:
            return self._json_validation_error(request, exc)
        except PermissionDenied as exc:
            return self._json_error(request, str(exc) or "Недостаточно прав", 403)
        except Http404 as exc:
            return self._json_error(request, str(exc) or "Не найдено", 404)

    def process_exception(self, request, exception):
        if isinstance(exception, ValidationError):
            return self._json_validation_error(request, exception)
        if isinstance(exception, PermissionDenied):
            return self._json_error(request, str(exception) or "Недостаточно прав", 403)
        if isinstance(exception, Http404):
            return self._json_error(request, str(exception) or "Не найдено", 404)
        return None

    def _json_error(self, request, message, status):
        if request.path.startswith("/api/"):
            return JsonResponse({"error": message}, status=status)
        raise

    def _json_validation_error(self, request, exception):
        if not request.path.startswith("/api/"):
            raise exception
        payload = {
            "error": exception.messages if hasattr(exception, "messages") else str(exception),
        }
        if hasattr(exception, "message_dict"):
            payload["errors"] = exception.message_dict
        return JsonResponse(payload, status=400)
