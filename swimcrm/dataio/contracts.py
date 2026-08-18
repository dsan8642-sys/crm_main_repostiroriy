"""One versioned schema registry shared by CRM export and import."""
from dataclasses import dataclass
from hashlib import sha256
import json
import re

from django.core.exceptions import ValidationError


SCHEMA_VERSION = "2"
SOURCE_SYSTEM = "swimcrm"
METADATA_KEYS = ("schema_version", "exported_at", "source_system", "entity_type")


@dataclass(frozen=True)
class FieldSpec:
    key: str
    label: str
    aliases: tuple[str, ...] = ()
    value_type: str = "string"
    required: bool = False
    value_format: str = ""
    validation: str = ""
    editable: bool = True
    relation: str = ""
    matching: str = ""
    default: str = ""


@dataclass(frozen=True)
class EntityContract:
    key: str
    label: str
    fields: tuple[FieldSpec, ...]
    dependencies: tuple[str, ...] = ()

    @property
    def field_map(self):
        return {field.key: field for field in self.fields}


def F(key, label, *aliases, **kwargs):
    return FieldSpec(key=key, label=label, aliases=tuple(aliases), **kwargs)


CONTRACTS = {
    "trainers": EntityContract("trainers", "Тренеры", (
        F("record_id", "Internal ID", "id", "ID", value_type="integer", editable=False),
        F("username", "Username", "Логин", required=True, validation="unique username"),
        F("first_name", "Имя", "Имя тренера"),
        F("last_name", "Фамилия", "Фамилия тренера"),
        F("email", "Email", "Почта", value_type="email"),
        F("phone", "Телефон", value_type="phone"),
        F("is_active", "Активен", "active", value_type="boolean", default="true"),
    )),
    "groups": EntityContract("groups", "Группы", (
        F("record_id", "Internal ID", "id", "ID", value_type="integer", editable=False),
        F("name", "Группа", "Название", "group", required=True, validation="unique name"),
        F("description", "Описание"),
        F("default_trainer_id", "ID тренера по умолчанию", value_type="integer",
          relation="trainers", matching="record_id", editable=False),
        F("default_trainer_username", "Тренер по умолчанию", "Тренер",
          relation="trainers", matching="username then exact unique name"),
        F("price_minor", "Цена, minor units", "Цена", value_type="integer",
          validation="non-negative integer"),
        F("currency", "Валюта", value_type="currency", default="PLN"),
        F("default_capacity", "Вместимость", value_type="integer",
          validation="positive integer"),
        F("color_key", "Цвет расписания"),
        F("is_active", "Активна", "Активен", "active", value_type="boolean", default="true"),
    ), dependencies=("trainers",)),
    "clients": EntityContract("clients", "Клиенты", (
        F("record_id", "Internal ID", "id", "ID", value_type="integer", editable=False),
        F("parent_record_id", "Family internal ID", value_type="integer", editable=False,
          relation="parent_account", matching="record_id"),
        F("parent_username", "Логин семьи", "username"),
        F("parent_first_name", "Имя владельца аккаунта"),
        F("parent_last_name", "Фамилия владельца аккаунта", "Родитель"),
        F("parent_phone", "Телефон", "phone", value_type="phone"),
        F("parent_email", "Email семьи", value_type="email"),
        F("parent_instagram_username", "Instagram семьи"),
        F("preferred_language", "Язык", default="pl"),
        F("first_name", "Имя"),
        F("last_name", "Фамилия"),
        F("name", "ФИО", "name"),
        F("birth_date", "Дата рождения", value_type="date", value_format="ISO 8601 date"),
        F("email", "Email", "Почта", value_type="email"),
        F("is_account_holder", "Владелец аккаунта", value_type="boolean", default="false"),
        F("group_id", "Group internal ID", value_type="integer", editable=False,
          relation="groups", matching="record_id then name"),
        F("group_name", "Группа", "group", relation="groups", matching="exact name"),
        F("group_ids", "Group internal IDs", relation="groups",
          matching="semicolon-separated record IDs"),
        F("group_names", "Группы", relation="groups",
          matching="semicolon-separated exact names"),
        F("medical_info", "Медицинская информация"),
        F("contraindications", "Противопоказания"),
        F("emergency_contact_name", "Экстренный контакт"),
        F("emergency_contact_phone", "Телефон экстренного контакта", value_type="phone"),
        F("is_active", "Активен", "active", value_type="boolean", default="true"),
        F("admin_comments", "Комментарий администратора", "Комментарий"),
        F("subscription_type_name", "Абонемент", "subscription", relation="subscription_type",
          matching="exact name"),
    ), dependencies=("groups",)),
    "payments": EntityContract("payments", "Оплаты", (
        F("record_id", "Internal ID", "id", "ID", value_type="integer", editable=False),
        F("client_id", "Client internal ID", value_type="integer", editable=False,
          relation="clients", matching="record_id first"),
        F("client_email", "Email клиента", value_type="email", relation="clients",
          matching="exact normalized email"),
        F("client_phone", "Телефон клиента", value_type="phone", relation="clients",
          matching="exact normalized family phone"),
        F("client_first_name", "Имя клиента", relation="clients"),
        F("client_last_name", "Фамилия клиента", relation="clients"),
        F("client_birth_date", "Дата рождения клиента", value_type="date", relation="clients"),
        F("client", "Клиент", "ФИО клиента", relation="clients",
          matching="legacy exact unique name or manual selection"),
        F("create_client", "Создать нового клиента", value_type="boolean", editable=False,
          relation="clients", matching="explicit user action only"),
        F("amount", "Сумма", required=True, value_type="decimal", value_format="exact major units"),
        F("amount_minor", "Сумма, minor units", value_type="integer", editable=False),
        F("currency", "Валюта", value_type="currency", default="PLN"),
        F("paid_at", "Дата", "Дата оплаты", required=True, value_type="date",
          value_format="ISO 8601 date"),
        F("method", "Способ", "Способ оплаты", required=True, value_type="enum"),
        F("status", "Статус", value_type="enum", default="confirmed"),
        F("comment", "Комментарий"),
        F("reference_id", "Reference ID", "ID транзакции"),
        F("source", "Источник", value_type="enum", editable=False),
        F("created_at", "Создан", value_type="datetime", editable=False,
          value_format="ISO 8601 with timezone"),
        F("confirmed_at", "Подтверждён", value_type="datetime", editable=False,
          value_format="ISO 8601 with timezone"),
    ), dependencies=("clients",)),
    "attendance": EntityContract("attendance", "Посещаемость", (
        F("record_id", "Internal ID", "id", "ID", value_type="integer", editable=False),
        F("session_id", "Session internal ID", value_type="integer", editable=False,
          relation="sessions", matching="record_id then deterministic session tuple"),
        F("client_id", "Client internal ID", value_type="integer", editable=False,
          relation="clients", matching="record_id first"),
        F("client_email", "Email клиента", value_type="email", relation="clients"),
        F("client_phone", "Телефон клиента", value_type="phone", relation="clients"),
        F("client_first_name", "Имя клиента", relation="clients"),
        F("client_last_name", "Фамилия клиента", relation="clients"),
        F("client_birth_date", "Дата рождения клиента", value_type="date", relation="clients"),
        F("client", "Клиент", "ФИО клиента", relation="clients"),
        F("create_client", "Создать нового клиента", value_type="boolean", editable=False,
          relation="clients", matching="explicit user action only"),
        F("group_id", "Group internal ID", value_type="integer", editable=False,
          relation="groups", matching="record_id then exact name"),
        F("group_name", "Группа", "group", relation="groups"),
        F("trainer_id", "Trainer internal ID", value_type="integer", editable=False,
          relation="trainers", matching="record_id then username/email"),
        F("trainer_username", "Тренер", "username тренера", relation="trainers"),
        F("trainer_email", "Email тренера", value_type="email", relation="trainers"),
        F("session_type", "Тип занятия", value_type="enum", default="group"),
        F("start_at", "Дата", "Начало", required=True, value_type="datetime",
          value_format="ISO 8601 with timezone"),
        F("end_at", "Окончание", value_type="datetime", value_format="ISO 8601 with timezone"),
        F("duration_minutes", "Длительность, мин", value_type="integer"),
        F("location", "Локация"),
        F("max_participants", "Вместимость", value_type="integer"),
        F("price_minor", "Цена занятия, minor units", value_type="integer", editable=False),
        F("currency", "Валюта", value_type="currency", editable=False),
        F("status", "Статус", required=True, value_type="enum"),
        F("comment", "Комментарий"),
        F("financial_effects_enabled", "Финансовые последствия", value_type="boolean",
          editable=False),
        F("marked_at", "Отмечено", value_type="datetime", editable=False,
          value_format="ISO 8601 with timezone"),
    ), dependencies=("clients", "groups", "trainers")),
}


TARGET_ALIASES = {
    "phone": "parent_phone",
    "group": "group_name",
    "subscription": "subscription_type_name",
    "last_name": "last_name",
    "first_name": "first_name",
    "name": "name",
    "email": "email",
}


def _normalized_header(value):
    return re.sub(r"\s+", " ", str(value or "").strip()).casefold()


def field_options(entity):
    contract = CONTRACTS[entity]
    return [{
        "key": field.key,
        "label": field.label,
        "type": field.value_type,
        "required": field.required,
        "editable": field.editable,
        "relation": field.relation,
    } for field in contract.fields]


def suggest_mapping(entity, headers):
    contract = CONTRACTS[entity]
    aliases = {}
    for field in contract.fields:
        for value in (field.key, field.label, f"{field.key} [{field.label}]", *field.aliases):
            aliases.setdefault(_normalized_header(value), field.key)
    return {
        header: aliases[_normalized_header(header)]
        for header in headers
        if _normalized_header(header) in aliases
    }


def normalize_mapping_target(entity, value):
    value = TARGET_ALIASES.get(str(value or "").strip(), str(value or "").strip())
    if value and value not in CONTRACTS[entity].field_map:
        raise ValidationError(f"Неизвестное поле CRM: {value}")
    return value


def prepare_rows(entity, headers, rows, mapping=None):
    """Map own exports or external aliases to canonical keys and validate metadata."""
    if entity not in CONTRACTS:
        raise ValidationError(f"Неизвестный тип импорта: {entity}")
    proposed = suggest_mapping(entity, headers)
    effective = dict(proposed)
    for source, target in (mapping or {}).items():
        target = normalize_mapping_target(entity, target)
        if target:
            effective[source] = target
        else:
            effective.pop(source, None)

    prepared = []
    metadata = {}
    own_export = all(key in headers for key in METADATA_KEYS)
    for raw_row in rows:
        if own_export:
            row_metadata = {key: str(raw_row.get(key, "")).strip() for key in METADATA_KEYS}
            if not metadata:
                metadata = row_metadata
            elif row_metadata != metadata:
                raise ValidationError("Метаданные собственного export различаются между строками")
        canonical = {}
        for source, target in effective.items():
            value = raw_row.get(source, "")
            if isinstance(value, str) and len(value) > 1 and value[0] == "'" and value[1] in "=+-@":
                value = value[1:]
            canonical[target] = value
        # Server-side staging adds this marker after parsing. Preserve it only
        # when it was not a user-supplied file column, so a file cannot forge
        # the displayed confidence level.
        if ("_manual_client_override" in raw_row
                and "_manual_client_override" not in headers):
            canonical["_manual_client_override"] = bool(
                raw_row["_manual_client_override"])
        prepared.append(canonical)

    if own_export and rows:
        if metadata.get("entity_type") != entity:
            raise ValidationError(
                f"Файл содержит entity_type={metadata.get('entity_type') or 'пусто'}, ожидался {entity}")
        if metadata.get("source_system") != SOURCE_SYSTEM:
            raise ValidationError("Неизвестный source_system собственного export")
        if metadata.get("schema_version") not in {"1", SCHEMA_VERSION}:
            raise ValidationError(
                f"Неподдерживаемая schema_version: {metadata.get('schema_version') or 'пусто'}")

    required = [field.key for field in CONTRACTS[entity].fields if field.required]
    mapped_targets = set(effective.values())
    required_missing = [key for key in required if key not in mapped_targets]
    unused_headers = [header for header in headers if header not in effective and header not in METADATA_KEYS]
    source_samples = {}
    for header in headers:
        for raw_row in rows[:20]:
            value = str(raw_row.get(header, "") or "").strip()
            if value:
                source_samples[header] = value[:160]
                break
    return {
        "rows": prepared,
        "mapping": effective,
        "suggested_mapping": proposed,
        "metadata": metadata,
        "own_export": own_export,
        "required_missing": required_missing,
        "unused_headers": unused_headers,
        "source_samples": source_samples,
    }


def stable_row_key(entity, row):
    payload = json.dumps(row, ensure_ascii=False, sort_keys=True, default=str, separators=(",", ":"))
    return sha256(f"{entity}\0{payload}".encode("utf-8")).hexdigest()


def contract_payload():
    return {
        "schema_version": SCHEMA_VERSION,
        "source_system": SOURCE_SYSTEM,
        "entities": {
            key: {
                "label": contract.label,
                "dependencies": contract.dependencies,
                "fields": field_options(key),
            }
            for key, contract in CONTRACTS.items()
        },
    }
