"""Section 6: validate uploaded receipt files by type and size.

Extension + size are the spec's literal requirement; a magic-byte check is added
as defence-in-depth so a renamed file (e.g. evil.exe -> evil.pdf) is still rejected.
Validators run on full_clean()/ModelForm (admin, parent portal), not on bare .save().
"""
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator

ALLOWED_RECEIPT_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"]

# Leading signatures of the allowed types.
_SIGNATURES = (
    b"%PDF",                     # PDF
    b"\x89PNG\r\n\x1a\n",        # PNG
    b"\xff\xd8\xff",             # JPEG
)

validate_receipt_extension = FileExtensionValidator(
    allowed_extensions=ALLOWED_RECEIPT_EXTENSIONS)


def validate_receipt_size(f):
    max_mb = getattr(settings, "RECEIPT_MAX_SIZE_MB", 10)
    if f.size > max_mb * 1024 * 1024:
        raise ValidationError(
            f"Файл больше {max_mb} МБ. Загрузите меньший чек (PDF/JPG/PNG).")


def validate_receipt_content(f):
    """Reject files whose actual bytes don't match an allowed PDF/JPG/PNG signature."""
    try:
        f.seek(0)
        head = f.read(8)
        f.seek(0)
    except Exception:
        return  # already-stored/unreadable value -> skip (extension+size still applied)
    if not any(head.startswith(sig) for sig in _SIGNATURES):
        raise ValidationError("Файл не похож на PDF/JPG/PNG (не совпала сигнатура файла).")
