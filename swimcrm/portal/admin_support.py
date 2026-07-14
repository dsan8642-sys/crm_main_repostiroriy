from .support import *

def _admin_required(request):
    return _require_role(request, Role.ADMIN)


__all__ = ["_admin_required"]
