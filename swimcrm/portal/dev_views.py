from django.conf import settings
from django.contrib.auth import login, logout
from django.http import Http404, JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from accounts.models import ParentAccount, Role, Trainer, User


def _require_debug():
    if not settings.DEBUG:
        raise Http404()


def _user_payload(user):
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.get_full_name(),
        "email": user.email,
        "role": "client" if user.role == Role.PARENT else user.role,
        "internal_role": user.role,
        "is_staff": user.is_staff,
        "can_manage_administrators": user.is_superuser,
    }


def _demo_admin():
    user = (
        User.objects.filter(role=Role.ADMIN, is_active=True).order_by("id").first()
        or User.objects.filter(is_superuser=True, is_active=True).order_by("id").first()
    )
    if user:
        return user
    return User.objects.create_superuser(
        username="dev_admin",
        email="dev_admin@example.test",
        password="DevAdmin!2026",
        role=Role.ADMIN,
    )


def _demo_trainer():
    trainer = (
        Trainer.objects.select_related("user")
        .filter(user__role=Role.TRAINER, user__is_active=True, is_active=True)
        .order_by("id")
        .first()
    )
    if trainer:
        return trainer.user
    user = User.objects.create_user(
        username="dev_trainer",
        password="DevTrainer!2026",
        role=Role.TRAINER,
        first_name="Dev",
        last_name="Trainer",
        email="dev_trainer@example.test",
    )
    Trainer.objects.create(user=user, is_active=True)
    return user


def _demo_client():
    account = (
        ParentAccount.objects.select_related("user")
        .filter(user__role=Role.PARENT, user__is_active=True)
        .order_by("id")
        .first()
    )
    if account:
        return account.user
    user = User.objects.create_user(
        username="dev_client",
        password="DevClient!2026",
        role=Role.PARENT,
        first_name="Dev",
        last_name="Client",
        email="dev_client@example.test",
    )
    ParentAccount.objects.create(user=user, phone="+48000000001", email=user.email)
    return user


@require_GET
@ensure_csrf_cookie
def csrf(request):
    return JsonResponse({"ok": True, "csrf_token": get_token(request)})


@csrf_exempt
@require_POST
def dev_login(request, role):
    _require_debug()
    role_map = {
        "admin": _demo_admin,
        "trainer": _demo_trainer,
        "client": _demo_client,
    }
    factory = role_map.get(role)
    if factory is None:
        return JsonResponse({"error": "Unknown dev role"}, status=400)
    user = factory()
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return JsonResponse({"ok": True, "user": _user_payload(user)})


@csrf_exempt
@require_POST
def dev_logout(request):
    _require_debug()
    logout(request)
    return JsonResponse({"ok": True})


__all__ = [name for name in globals() if not name.startswith("__")]
