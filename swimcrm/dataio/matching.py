"""Deterministic relation matching for staged imports."""
from dataclasses import dataclass, field
from difflib import SequenceMatcher
import re

from students.models import Student


def requested(value):
    return str(value or "").strip().casefold() in {"true", "1", "yes", "да", "tak"}


@dataclass
class StudentMatch:
    student: Student | None = None
    reason: str = ""
    confidence: str = "none"
    ambiguous: bool = False
    candidates: list[dict] = field(default_factory=list)


def normalize_phone(value):
    value = str(value or "").strip()
    digits = re.sub(r"\D", "", value)
    return ("+" + digits) if digits else ""


def normalize_email(value):
    return str(value or "").strip().casefold()


def _candidate_payload(student, score=None):
    payload = {
        "id": student.id,
        "name": student.full_name,
        "email": student.email,
        "phone": student.parent.phone,
        "birth_date": student.birth_date.isoformat() if student.birth_date else "",
    }
    if score is not None:
        payload["score"] = round(score, 3)
    return payload


def _unique(qs, reason, confidence="exact"):
    matches = list(qs[:3])
    if len(matches) == 1:
        return StudentMatch(matches[0], reason, confidence)
    if len(matches) > 1:
        return StudentMatch(
            reason=f"Неоднозначное совпадение: {reason}",
            confidence="ambiguous",
            ambiguous=True,
            candidates=[_candidate_payload(student) for student in matches],
        )
    return None


def match_student(data):
    """Stable ID -> email -> phone -> name+birth -> legacy name -> fuzzy suggestion."""
    base = Student.objects.select_related("parent__user")
    raw_id = data.get("client_id") or data.get("student_id")
    if raw_id not in (None, ""):
        try:
            student = base.filter(pk=int(raw_id)).first()
        except (TypeError, ValueError):
            student = None
        if student is not None:
            reason = ("Клиент выбран вручную" if data.get("_manual_client_override")
                      else "Совпал стабильный internal ID")
            return StudentMatch(student, reason, "manual" if data.get("_manual_client_override") else "exact")

    legacy = str(data.get("client") or "").strip()
    email = normalize_email(
        data.get("client_email") or data.get("email") or (legacy if "@" in legacy else ""))
    if email:
        result = _unique(base.filter(email__iexact=email), "Совпал email")
        if result:
            return result

    phone = normalize_phone(data.get("client_phone") or data.get("phone"))
    first = str(data.get("client_first_name") or data.get("first_name") or "").strip()
    last = str(data.get("client_last_name") or data.get("last_name") or "").strip()
    birth = str(data.get("client_birth_date") or data.get("birth_date") or "").strip()
    if phone:
        phone_matches = [student for student in base if normalize_phone(student.parent.phone) == phone]
        if first or last:
            phone_matches = [student for student in phone_matches
                             if (not first or student.first_name.casefold() == first.casefold())
                             and (not last or student.last_name.casefold() == last.casefold())]
        if birth:
            phone_matches = [student for student in phone_matches
                             if student.birth_date and student.birth_date.isoformat() == birth]
        if len(phone_matches) == 1:
            details = "телефон"
            if first or last:
                details += " и имя"
            if birth:
                details += " и дата рождения"
            return StudentMatch(phone_matches[0], f"Совпали {details}", "exact")
        if len(phone_matches) > 1:
            return StudentMatch(
                reason="Неоднозначный семейный телефон; выберите участника вручную",
                confidence="ambiguous", ambiguous=True,
                candidates=[_candidate_payload(student) for student in phone_matches[:20]],
            )

    if first and last and birth:
        result = _unique(base.filter(
            first_name__iexact=first, last_name__iexact=last, birth_date=birth),
            "Совпали имя, фамилия и дата рождения")
        if result:
            return result

    if legacy and not (first or last):
        parts = legacy.split(maxsplit=1)
        last, first = (parts[0], parts[1]) if len(parts) > 1 else (parts[0], "")
    if first or last:
        result = _unique(base.filter(first_name__iexact=first, last_name__iexact=last),
                         "Совпали имя и фамилия")
        if result:
            return result

    needle = " ".join(value for value in (last, first) if value).casefold()
    suggestions = []
    if needle:
        for student in base:
            score = SequenceMatcher(None, needle, student.full_name.casefold()).ratio()
            if score >= 0.72:
                suggestions.append((score, student))
    suggestions.sort(key=lambda item: (-item[0], item[1].id))
    if suggestions:
        return StudentMatch(
            reason="Возможно совпадение по имени — требуется подтверждение",
            confidence="suggestion",
            candidates=[_candidate_payload(student, score) for score, student in suggestions[:5]],
        )
    return StudentMatch(reason="Клиент не найден", confidence="none")
