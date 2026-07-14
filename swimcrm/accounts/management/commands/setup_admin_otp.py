from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from accounts.models import AdminOTPDevice, User
from accounts.otp import generate_totp_secret, provisioning_uri, verify_totp


class Command(BaseCommand):
    help = "Создаёт или подтверждает TOTP-2FA для администратора."

    def add_arguments(self, parser):
        parser.add_argument("username")
        parser.add_argument("--code", help="Код из authenticator app для подтверждения")
        parser.add_argument("--reset", action="store_true", help="Сгенерировать новый secret")

    def handle(self, *args, **options):
        try:
            user = User.objects.get(username=options["username"])
        except User.DoesNotExist as exc:
            raise CommandError("Пользователь не найден") from exc
        if not (user.is_staff or user.is_superuser or user.role == "admin"):
            raise CommandError("2FA настраивается только для администратора/staff")

        device, created = AdminOTPDevice.objects.get_or_create(
            user=user, defaults={"secret": generate_totp_secret()})
        if options["reset"]:
            device.secret = generate_totp_secret()
            device.is_confirmed = False
            device.confirmed_at = None
            device.save(update_fields=["secret", "is_confirmed", "confirmed_at"])

        if options.get("code"):
            if not verify_totp(device.secret, options["code"]):
                raise CommandError("Код не подошёл")
            device.is_confirmed = True
            device.confirmed_at = timezone.now()
            device.save(update_fields=["is_confirmed", "confirmed_at"])
            self.stdout.write(self.style.SUCCESS("2FA подтверждена"))
            return

        self.stdout.write("Добавьте TOTP в authenticator app:")
        self.stdout.write(f"Secret: {device.secret}")
        self.stdout.write(f"URI: {provisioning_uri(secret=device.secret, username=user.username)}")
        self.stdout.write("Затем подтвердите: manage.py setup_admin_otp <username> --code 123456")
