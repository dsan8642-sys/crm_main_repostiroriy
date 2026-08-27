from django.core.exceptions import NON_FIELD_ERRORS, PermissionDenied, ValidationError
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
        errors = {}
        non_field_errors = []
        if hasattr(exception, "error_dict"):
            for field, field_errors in exception.error_dict.items():
                target = non_field_errors if field == NON_FIELD_ERRORS else errors.setdefault(field, [])
                target.extend(self._validation_items(field_errors))
        else:
            non_field_errors = self._validation_items(
                getattr(exception, "error_list", [exception]))
        payload = {
            "error": "Проверьте отмеченные поля.",
            "code": "validation_error",
            "errors": errors,
            "non_field_errors": non_field_errors,
        }
        return JsonResponse(payload, status=400)

    @staticmethod
    def _validation_items(field_errors):
        items = []
        for error in field_errors:
            message = getattr(error, "message", str(error))
            params = getattr(error, "params", None) or {}
            try:
                message = message % params
            except (KeyError, TypeError, ValueError):
                pass
            items.append({
                "code": getattr(error, "code", None) or "invalid",
                "message": str(message),
            })
        return items
