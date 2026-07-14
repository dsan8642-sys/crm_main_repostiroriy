"""
Infrastructure endpoints for readiness checks and the application shell.

These are not domain views: they do not touch models or business logic. They
exist so the SPA dev server and uptime checks can confirm the backend is alive,
and so the site root returns a useful response instead of a 404.
"""
from django.http import JsonResponse


def health(request):
    """Liveness/ping endpoint consumed by the frontend and uptime checks."""
    return JsonResponse({
        "status": "ok",
        "service": "swimcrm",
        "component": "backend",
    })


def root(request):
    """Minimal landing payload so `/` is not a bare 404 in dev."""
    return JsonResponse({
        "service": "swimcrm",
        "message": "SwimCRM backend is running.",
        "admin": "/admin/",
        "health": "/api/health/",
    })
