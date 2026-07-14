"""
Infrastructure endpoints for the project shell (Step 1 plumbing only).

These are NOT domain views — no models, no business logic. They exist so the
SPA dev server (and uptime checks) can confirm the backend is alive, and so the
site root returns something friendly instead of a 404. Domain APIs (section 2/3
of the spec) will live in the individual app packages, not here.
"""
from django.http import JsonResponse


def health(request):
    """Liveness/ping endpoint consumed by the frontend placeholder."""
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
