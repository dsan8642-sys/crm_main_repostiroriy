from copy import deepcopy
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.util import Pt


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = Path(
    r"C:\Users\clans\.codex\plugins\cache\openai-curated-remote\openai-templates\0.1.0"
    r"\skills\artifact-template-market-trends-report\assets\reference.pptx"
)
OUT = ROOT / "docs" / "SwimCRM_client_presentation_ru.pptx"


TITLE_COLOR = RGBColor(26, 42, 54)
BODY_COLOR = RGBColor(58, 73, 86)
ACCENT = RGBColor(12, 111, 128)


def duplicate_slide(prs, index):
    source = prs.slides[index]
    blank = prs.slide_layouts[6]
    slide = prs.slides.add_slide(blank)
    for shape in source.shapes:
        slide.shapes._spTree.insert_element_before(deepcopy(shape.element), "p:extLst")
    return slide


def set_text(shape, text, size=None, bold=None, color=None, align=None):
    shape.text = text
    for paragraph in shape.text_frame.paragraphs:
        if align is not None:
            paragraph.alignment = align
        for run in paragraph.runs:
            run.font.name = "Aptos"
            if size:
                run.font.size = Pt(size)
            if bold is not None:
                run.font.bold = bold
            if color:
                run.font.color.rgb = color


def text_shapes(slide):
    return [shape for shape in slide.shapes if hasattr(shape, "text_frame")]


def fill_by_order(slide, values):
    shapes = text_shapes(slide)
    for idx, value in values.items():
        if idx < len(shapes):
            if isinstance(value, tuple):
                set_text(shapes[idx], *value)
            else:
                set_text(shapes[idx], value)


def wipe_unused(slide, keep_count):
    for shape in text_shapes(slide)[keep_count:]:
        set_text(shape, "")


def remove_template_residue(prs):
    banned = ("lorem", "ipsum", "[market", "[trend", "[capability", "[barrier")
    for slide in prs.slides:
        for shape in text_shapes(slide):
            text = shape.text or ""
            if any(token in text.lower() for token in banned):
                set_text(shape, "")


def main():
    prs = Presentation(TEMPLATE)

    while len(prs.slides) < 10:
        duplicate_slide(prs, min(len(prs.slides) - 1, 5))

    slides = list(prs.slides)

    fill_by_order(
        slides[0],
        {
            0: ("SwimCRM для школы плавания", 42, True, TITLE_COLOR, None),
            1: ("Операционная CRM, которая связывает расписание, абонементы, оплаты и коммуникацию с родителями.", 18, False, BODY_COLOR, None),
            2: ("Клиентская презентация | июль 2026", 13, False, ACCENT, None),
        },
    )

    fill_by_order(
        slides[1],
        {
            0: ("SwimCRM | client deck", 9, False, BODY_COLOR, None),
            1: ("2", 16, True, ACCENT, PP_ALIGN.CENTER),
            2: ("О проекте", 32, True, TITLE_COLOR, None),
            3: (
                "SwimCRM — веб-система для частной школы плавания. Она помогает администрации вести клиентов, группы, тренеров, расписание, посещаемость, абонементы и оплаты в одном месте.\n\n"
                "Основные пользователи: администратор, тренер и родитель/клиент. Проблема, которую решает продукт: меньше ручного учета в таблицах, меньше ошибок в оплатах и прозрачная история по каждому участнику.",
                17,
                False,
                BODY_COLOR,
                None,
            ),
            4: ("Product positioning", 12, False, ACCENT, None),
        },
    )

    fill_by_order(
        slides[2],
        {
            0: ("SwimCRM | client deck", 9, False, BODY_COLOR, None),
            1: ("3", 16, True, ACCENT, PP_ALIGN.CENTER),
            2: ("Ключевые возможности сейчас", 30, True, TITLE_COLOR, None),
            3: ("Система уже закрывает основные ежедневные процессы школы: от записи клиента до контроля оплат и отчетности.", 15, False, BODY_COLOR, None),
            4: ("01", 27, True, ACCENT, PP_ALIGN.CENTER),
            5: ("Основной функционал: клиенты и семьи, группы, тренеры, расписание, посещаемость, абонементы, начисления и платежи.", 14, False, BODY_COLOR, None),
            6: ("02", 27, True, ACCENT, PP_ALIGN.CENTER),
            7: ("Автоматизация: списание занятий по статусам, контроль конфликтов тренера, отчеты, импорт/экспорт, планировщик уведомлений.", 14, False, BODY_COLOR, None),
            8: ("03", 27, True, ACCENT, PP_ALIGN.CENTER),
            9: ("Интерфейс: React SPA для админа, клиентский и тренерский контуры, адаптивная верстка и единая дизайн-система.", 14, False, BODY_COLOR, None),
        },
    )

    fill_by_order(
        slides[3],
        {
            0: ("SwimCRM | client deck", 9, False, BODY_COLOR, None),
            1: ("4", 16, True, ACCENT, PP_ALIGN.CENTER),
            2: ("Как это работает", 30, True, TITLE_COLOR, None),
            3: ("Flow от первого контакта до регулярного управления клиентом", 17, True, ACCENT, None),
            4: (
                "1. Администратор создает клиента или семейный аккаунт.\n"
                "2. Назначает участника в группу и выпускает абонемент.\n"
                "3. Система создает начисление и фиксирует оплату или чек.\n"
                "4. Тренер отмечает посещаемость после занятия.\n"
                "5. CRM обновляет остаток занятий, задолженности и напоминания.",
                16,
                False,
                BODY_COLOR,
                None,
            ),
        },
    )

    fill_by_order(
        slides[4],
        {
            0: ("SwimCRM | client deck", 9, False, BODY_COLOR, None),
            1: ("5", 16, True, ACCENT, PP_ALIGN.CENTER),
            2: ("Примеры использования", 30, True, TITLE_COLOR, None),
            3: ("Продажа абонемента\nАдмин создает абонемент, начисление и платеж. Клиент сразу видит актуальный статус.", 14, False, BODY_COLOR, None),
            4: ("Контроль посещаемости\nТренер отмечает занятие, CRM сама списывает или не списывает занятие по бизнес-правилам.", 14, False, BODY_COLOR, None),
            5: ("Работа с долгами\nАдмин видит просрочки, клиентов с малым остатком занятий и может запускать напоминания.", 14, False, BODY_COLOR, None),
            6: ("Отчетность\nРуководитель получает доходы, посещаемость и неоплаченные счета без ручной сборки таблиц.", 14, False, BODY_COLOR, None),
        },
    )

    fill_by_order(
        slides[5],
        {
            0: ("SwimCRM | client deck", 9, False, BODY_COLOR, None),
            1: ("6", 16, True, ACCENT, PP_ALIGN.CENTER),
            2: ("Ограничения — честно", 30, True, TITLE_COLOR, None),
            3: ("Онлайн-оплата пока не подключена. Сейчас платежи вводятся администратором или подтверждаются по загруженному чеку.", 14, False, BODY_COLOR, None),
            4: ("Telegram и SMS имеют рабочие интерфейсы/заглушки; для боевого запуска нужны провайдеры, токены и тестирование доставки.", 14, False, BODY_COLOR, None),
            5: ("Планировщик уведомлений готов как команда, но в production его нужно поставить в Celery beat или cron.", 14, False, BODY_COLOR, None),
            6: ("PostgreSQL-релиз требует отдельной проверки backup/restore и реальных production env-переменных.", 14, False, BODY_COLOR, None),
            7: ("Некоторые старые внутренние названия моделей еще сохраняют терминологию ParentAccount/Student.", 14, False, BODY_COLOR, None),
        },
    )

    fill_by_order(
        slides[6],
        {
            0: ("SwimCRM | client deck", 9, False, BODY_COLOR, None),
            1: ("7", 16, True, ACCENT, PP_ALIGN.CENTER),
            2: ("Что можно улучшить", 30, True, TITLE_COLOR, None),
            3: ("UX\nУпростить массовые действия в админке, добавить быстрые фильтры по группам, статусам оплат и остаткам занятий.", 14, False, BODY_COLOR, None),
            4: ("Функционал\nПодключить боевой Telegram/SMS, массовые рассылки, админ-экшены для импортов и отчетов.", 14, False, BODY_COLOR, None),
            5: ("Автоматизация\nНастроить Celery/Redis, регулярные backup/restore проверки, мониторинг ошибок уведомлений.", 14, False, BODY_COLOR, None),
            6: ("Коммерция\nДобавить онлайн-оплаты и автоматическое сопоставление платежей, когда бизнес будет готов.", 14, False, BODY_COLOR, None),
        },
    )

    fill_by_order(
        slides[7],
        {
            0: ("SwimCRM | client deck", 9, False, BODY_COLOR, None),
            1: ("8", 16, True, ACCENT, PP_ALIGN.CENTER),
            2: ("Roadmap развития", 30, True, TITLE_COLOR, None),
            3: ("Quick wins\nЗапустить production env-check, настроить регулярный планировщик, включить админские действия для отчетов.", 14, False, BODY_COLOR, None),
            4: ("Среднесрочно\nБоевой Telegram/SMS, массовые рассылки, расширенные UX-сценарии для администратора и тренера.", 14, False, BODY_COLOR, None),
            5: ("Продвинутые функции\nОнлайн-оплата, автоматическая сверка банковских платежей, BI-дашборды и прогноз продлений.", 14, False, BODY_COLOR, None),
            6: ("Техническая зрелость\nPostgreSQL hardening, backup/restore drill, мониторинг очередей и delivery logs.", 14, False, BODY_COLOR, None),
        },
    )

    fill_by_order(
        slides[8],
        {
            0: ("SwimCRM | client deck", 9, False, BODY_COLOR, None),
            1: ("9", 16, True, ACCENT, PP_ALIGN.CENTER),
            2: ("Бизнес-ценность", 30, True, TITLE_COLOR, None),
            3: ("CRM снижает зависимость от ручных таблиц и памяти сотрудников. Это особенно важно, когда школа растет и появляется много групп, тренеров и оплат.", 15, False, BODY_COLOR, None),
            4: ("Время", 27, True, ACCENT, PP_ALIGN.CENTER),
            5: ("меньше ручной сверки оплат, посещаемости и остатков занятий.", 14, False, BODY_COLOR, None),
            6: ("Деньги", 27, True, ACCENT, PP_ALIGN.CENTER),
            7: ("быстрее видно долги, окончания абонементов и клиентов для продления.", 14, False, BODY_COLOR, None),
            8: ("Контроль", 27, True, ACCENT, PP_ALIGN.CENTER),
            9: ("история действий, RODO-согласия, отчеты и прозрачные правила списания.", 14, False, BODY_COLOR, None),
        },
    )

    fill_by_order(
        slides[9],
        {
            0: ("SwimCRM | client deck", 9, False, BODY_COLOR, None),
            1: ("10", 16, True, ACCENT, PP_ALIGN.CENTER),
            2: ("Итог", 32, True, TITLE_COLOR, None),
            3: (
                "SwimCRM уже является практичной основой для операционного управления школой плавания: клиенты, расписание, посещаемость, абонементы, платежи, отчеты и коммуникации собраны вокруг единой логики.\n\n"
                "Главная ценность — не просто список функций, а управляемость бизнеса: меньше ошибок, быстрее контроль оплат, прозрачная история и готовая база для масштабирования.",
                17,
                False,
                BODY_COLOR,
                None,
            ),
            4: ("Recommended next step: production pilot", 12, False, ACCENT, None),
        },
    )

    remove_template_residue(prs)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    prs.save(OUT)
    print(OUT)


if __name__ == "__main__":
    main()
