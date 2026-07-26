from .admin_support import _admin_required


def require_admin_settings(request):
    # Settings are edited only through the authenticated first-party admin UI.
    return _admin_required(request)
