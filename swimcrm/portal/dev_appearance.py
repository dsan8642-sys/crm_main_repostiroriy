"""Local design authoring. Never enabled on a production server."""
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from tempfile import NamedTemporaryFile
from threading import Lock
from urllib.parse import urlsplit
from zipfile import ZipFile

from django.conf import settings
from django.core.exceptions import ValidationError
from django.http import Http404, JsonResponse
from django.views.decorators.http import require_http_methods

from .admin_support import _admin_required
from .support import _json_body


ROOT = Path(__file__).resolve().parents[2]
# ponytail: one local development process; use a file lock if multiple writers are introduced.
SAVE_LOCK = Lock()


def color(key, label, group, *tokens):
    return {"key": key, "label": label, "group": group, "type": "color", "tokens": tokens}


def size(key, label, group, minimum, maximum, *tokens):
    return {"key": key, "label": label, "group": group, "type": "size",
            "min": minimum, "max": maximum, "tokens": tokens}


FIELDS = [
    color("primary", "Основные кнопки", "Кнопки", "--primary", "--ops-brand", "--accent", "--ops-accent"),
    color("hover", "Кнопка при наведении", "Кнопки", "--primary-hover", "--ops-brand-strong"),
    color("pressed", "Кнопка при нажатии", "Кнопки", "--primary-active"),
    color("buttonText", "Текст на цветной кнопке", "Кнопки", "--text-on-solid"),
    color("soft", "Мягкая заливка", "Кнопки", "--primary-soft", "--ops-brand-soft", "--ops-accent-soft"),
    size("controlHeight", "Высота обычных кнопок и полей", "Кнопки", 30, 56, "--control-h-md"),
    size("radius", "Скругление кнопок и полей", "Кнопки", 0, 24, "--radius-md"),
    color("page", "Фон страницы", "Карточки и фон", "--surface-page", "--ops-bg"),
    color("card", "Фон карточек и второстепенных кнопок", "Карточки и фон", "--surface-card", "--ops-panel"),
    color("border", "Разделители и рамки карточек", "Карточки и фон", "--border-subtle", "--ops-line-soft"),
    color("controlBorder", "Рамки полей и кнопок", "Карточки и фон", "--border-default", "--ops-line"),
    size("cardRadius", "Скругление карточек", "Карточки и фон", 0, 24, "--radius-lg"),
    {**size("cardPadding", "Внутренний отступ карточек", "Карточки и фон", 8, 32), "default": "16px",
     "rules": [{"selector": ".card-pad", "property": "padding"}]},
    color("text", "Основной текст", "Текст", "--text-body", "--ops-ink"),
    color("title", "Заголовки", "Текст", "--text-strong"),
    color("muted", "Второстепенный текст", "Текст", "--text-muted", "--ops-muted"),
    size("fontSize", "Основной размер текста", "Текст", 12, 18, "--fs-base"),
    size("smallFontSize", "Текст таблиц и элементов управления", "Текст", 12, 17, "--fs-sm"),
    size("titleSize", "Размер заголовка страницы", "Текст", 20, 36, "--fs-2xl"),
    {**color("tableHeader", "Фон шапки таблиц", "Таблицы и вкладки"), "default": "#eef1f5",
     "rules": [{"selector": ".table-wrap th", "property": "background-color"}]},
    size("rowHeight", "Высота обычных строк таблицы", "Таблицы и вкладки", 36, 68, "--row-h-default"),
    {**color("tabFill", "Заливка выбранной вкладки", "Таблицы и вкладки"), "default": "#ffffff",
     "rules": [{"selector": ".ops-tabs button.is-active, .ops-tabs button[aria-selected='true']", "property": "background-color"}]},
    {**color("tabText", "Текст выбранной вкладки", "Таблицы и вкладки"), "default": "#1a2129",
     "rules": [{"selector": ".ops-tabs button.is-active, .ops-tabs button[aria-selected='true']", "property": "color"}]},
]

ELEMENT_FIELDS = {
    "backgroundColor": ("background-color", "color"),
    "color": ("color", "color"),
    "borderColor": ("border-color", "color"),
    "borderRadius": ("border-radius", 0, 40),
    "padding": ("padding", 0, 48),
    "fontSize": ("font-size", 10, 40),
}
ELEMENT_FIELDS.update({
    f"{kind}{side}": (f"{kind}-{side.lower()}", 0, 96)
    for kind in ("padding", "margin") for side in ("Top", "Right", "Bottom", "Left")
})
SELECTOR = re.compile(r"#root(?: > [a-z][a-z0-9-]*(?::nth-of-type\([1-9][0-9]*\))?){1,20}\Z")
BLOCK_SELECTOR = re.compile(r'#root \[data-appearance-block-id="[0-9a-f-]{36}"\]\Z')
BLOCK_ID = re.compile(r'[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\Z')
ROUTE = re.compile(r"(?:admin|trainer|client)/[A-Za-z][A-Za-z0-9]*\Z")


def validate_values(values):
    if not isinstance(values, dict) or set(values) - {field["key"] for field in FIELDS}:
        raise ValidationError("Неизвестные настройки оформления.")
    for field in FIELDS:
        if field["key"] not in values:
            continue
        value = values[field["key"]]
        valid = isinstance(value, str)
        if valid and field["type"] == "color":
            valid = bool(re.fullmatch(r"#[0-9a-fA-F]{6}", value))
        elif valid:
            valid = bool(re.fullmatch(r"\d{1,2}px", value)) and field["min"] <= int(value[:-2]) <= field["max"]
        if not valid:
            raise ValidationError(f"Недопустимое значение: {field['label']}.")
    return values


def validate_state(state):
    if not isinstance(state, dict) or not {"values", "presets"} <= set(state) or set(state) - {"values", "presets", "overrides", "blocks"}:
        raise ValidationError("Ожидаются настройки и варианты оформления.")
    validate_values(state["values"])
    state = {**state, "overrides": validate_overrides(state.get("overrides", [])), "blocks": validate_blocks(state.get("blocks", []))}
    presets = state["presets"]
    if not isinstance(presets, list) or len(presets) > 20:
        raise ValidationError("Можно сохранить до 20 вариантов.")
    names = set()
    for preset in presets:
        if not isinstance(preset, dict) or not {"name", "values"} <= set(preset) or set(preset) - {"name", "values", "overrides", "blocks"}:
            raise ValidationError("Некорректный вариант оформления.")
        name = preset["name"]
        if not isinstance(name, str) or not name.strip() or name != name.strip() or len(name) > 60 or name.casefold() in names:
            raise ValidationError("Названия вариантов должны быть уникальными, от 1 до 60 символов.")
        names.add(name.casefold())
        validate_values(preset["values"])
        validate_overrides(preset.get("overrides", []))
        validate_blocks(preset.get("blocks", []))
    return state


def validate_blocks(blocks):
    if not isinstance(blocks, list) or len(blocks) > 50:
        raise ValidationError("Можно добавить до 50 элементов.")
    ids = set()
    for block in blocks:
        if not isinstance(block, dict) or set(block) != {"id", "route", "parent", "kind", "text"}:
            raise ValidationError("Некорректный добавленный элемент.")
        if (not isinstance(block["id"], str) or not BLOCK_ID.fullmatch(block["id"]) or block["id"] in ids
                or not isinstance(block["route"], str) or not ROUTE.fullmatch(block["route"])
                or not isinstance(block["parent"], str) or not (SELECTOR.fullmatch(block["parent"]) or block["parent"] == "#root")
                or not isinstance(block["kind"], str) or block["kind"] not in {"text", "block"} or not isinstance(block["text"], str)
                or len(block["text"]) > 500 or "\x00" in block["text"]):
            raise ValidationError("Некорректный добавленный элемент.")
        ids.add(block["id"])
    return blocks


def validate_overrides(overrides):
    if not isinstance(overrides, list) or len(overrides) > 100:
        raise ValidationError("Можно настроить до 100 элементов.")
    seen = set()
    for item in overrides:
        if not isinstance(item, dict) or not {"route", "selector", "label", "properties"} <= set(item) or set(item) - {"route", "selector", "label", "properties", "text", "match", "visibility"}:
            raise ValidationError("Некорректная настройка элемента.")
        route, selector, label, properties = (item[key] for key in ("route", "selector", "label", "properties"))
        if not all(isinstance(value, str) for value in (route, selector, label)) or not ROUTE.fullmatch(route) or not (SELECTOR.fullmatch(selector) or BLOCK_SELECTOR.fullmatch(selector)) or not label.strip() or len(label) > 120 or (route, selector) in seen:
            raise ValidationError("Некорректный адрес элемента.")
        seen.add((route, selector))
        visibility = item.get("visibility")
        if not isinstance(properties, dict) or set(properties) - ELEMENT_FIELDS.keys() or (visibility is not None and (not isinstance(visibility, str) or visibility not in {"hidden", "removed"})):
            raise ValidationError("Некорректные свойства элемента.")
        has_text = "text" in item or "match" in item
        if has_text and (set(item) & {"text", "match"}) != {"text", "match"}:
            raise ValidationError("Для замены текста нужны текст и контроль исходной надписи.")
        if has_text and (not isinstance(item["text"], str) or len(item["text"]) > 500 or "\x00" in item["text"] or not isinstance(item["match"], str) or not re.fullmatch(r"[0-9a-f]{64}", item["match"])):
            raise ValidationError("Некорректная замена текста.")
        if not properties and not has_text and not item.get("visibility"):
            raise ValidationError("Пустая настройка элемента.")
        for key, value in properties.items():
            definition = ELEMENT_FIELDS[key]
            if not isinstance(value, str):
                raise ValidationError("Некорректное значение свойства элемента.")
            if definition[1] == "color":
                valid = bool(re.fullmatch(r"#[0-9a-fA-F]{6}", value))
            else:
                valid = bool(re.fullmatch(r"\d{1,2}px", value)) and definition[1] <= int(value[:-2]) <= definition[2]
            if not valid:
                raise ValidationError("Некорректное значение свойства элемента.")
    return overrides


def render_css(values, overrides=(), mode="custom"):
    scope = f':root[data-appearance="{mode}"]'
    tokens, rules = [], []
    for field in FIELDS:
        if field["key"] not in values:
            continue
        value = values[field["key"]]
        tokens.extend(f"  {token}: {value};" for token in field["tokens"])
        for rule in field.get("rules", []):
            selectors = ", ".join(f"{scope} {selector.strip()}" for selector in rule["selector"].split(","))
            rules.append(f"{selectors} {{ {rule['property']}: {value} !important; }}")
    for item in overrides:
        if not item["properties"] and not item.get("visibility"):
            continue
        scoped = f'{scope}[data-appearance-route="{item["route"]}"] {item["selector"]}'
        declarations = " ".join(f"{ELEMENT_FIELDS[key][0]}: {value} !important;" for key, value in item["properties"].items())
        if item.get("visibility") == "hidden":
            declarations += " visibility: hidden !important;"
        elif item.get("visibility") == "removed":
            declarations += " display: none !important;"
        rules.append(f"{scoped} {{ {declarations} }}")
    return "/* Generated from design/appearance.json by the local appearance editor. */\n" + scope + " {\n" + "\n".join(tokens) + "\n}\n" + "\n".join(rules) + "\n"


def read_state():
    content = (ROOT / "design/appearance.json").read_bytes()
    return validate_state(json.loads(content)), hashlib.sha256(content).hexdigest()


def atomic_write(path, content):
    temporary = None
    try:
        with NamedTemporaryFile(dir=path.parent, delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(content)
        temporary.replace(path)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


@require_http_methods(["GET", "POST"])
def appearance(request):
    host = urlsplit("//" + request.get_host()).hostname
    if not settings.DEBUG or settings.ENVIRONMENT not in {"development", "dev", "local"} or request.META.get("REMOTE_ADDR") not in {"127.0.0.1", "::1"} or host not in {"localhost", "127.0.0.1", "::1"}:
        raise Http404
    _admin_required(request)
    with SAVE_LOCK:
        try:
            state, revision = read_state()
        except (OSError, ValueError):
            return JsonResponse({"error": "Не удалось прочитать файл оформления."}, status=500)
        if request.method == "POST":
            if len(request.body) > 65536:
                return JsonResponse({"error": "Слишком большой набор настроек."}, status=400)
            data = _json_body(request)
            if not isinstance(data, dict):
                raise ValidationError("Ожидается объект настроек.")
            if data.get("revision") != revision:
                return JsonResponse({"error": "Оформление изменилось в другой вкладке. Закройте редактор и откройте его снова."}, status=409)
            state = validate_state(data.get("state"))
            css = render_css(state["values"], state["overrides"]).encode("utf-8")
            files = {
                ROOT / "design/tokens/appearance.css": css,
                ROOT / "frontend/src/design/tokens/appearance.css": css,
                ROOT / "design/appearance.json": (json.dumps(state, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
                ROOT / "frontend/src/design/appearance.json": (json.dumps(state, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
            }
            previous = {}
            try:
                previous = {path: path.read_bytes() for path in files}
                backups = ROOT / "backups/appearance"
                backups.mkdir(parents=True, exist_ok=True)
                backup = backups / f"appearance-{datetime.now():%Y%m%d-%H%M%S-%f}.zip"
                with ZipFile(backup, "x") as archive:
                    for path, content in previous.items():
                        archive.writestr(path.relative_to(ROOT).as_posix(), content)
                for path, content in files.items():
                    atomic_write(path, content)
            except OSError:
                for path, content in previous.items():
                    atomic_write(path, content)
                return JsonResponse({"error": "Не удалось сохранить оформление. Проверьте доступ к файлам проекта."}, status=500)
            state, revision = read_state()
        response = JsonResponse({"fields": FIELDS, "state": state, "revision": revision})
        response["Cache-Control"] = "no-store"
        return response
