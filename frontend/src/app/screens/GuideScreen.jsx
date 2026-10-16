import React, { useEffect, useRef, useState } from 'react'
import { useLocale } from '../../i18n.jsx'
import './GuideScreen.css'

const adminClientGuides = [
  {
    id: 'clients-open', title: 'Найти клиента', route: 'Меню → Клиенты → поиск → строка клиента',
    image: '/guides/admin-clients-list.png',
    steps: ['Откройте «Клиенты».', 'Введите имя или телефон.', 'Нажмите строку клиента.'],
    pins: [[9, 16], [55, 34], [42, 43]],
  },
  {
    id: 'client-card', title: 'Ориентироваться в карточке', route: 'Клиенты → карточка клиента',
    image: '/guides/admin-clients-card.png',
    steps: ['Баланс — здесь.', 'Абонемент — рядом.', 'Пополнить или продать — кнопками ниже.', 'Даты и остаток — «Редактировать абонемент».'],
    pins: [[29, 33], [49, 33], [35, 45], [49, 45]],
  },
  {
    id: 'client-payment', title: 'Добавить оплату', route: 'Клиенты → карточка → Пополнить баланс',
    image: '/guides/admin-clients-payment.png',
    steps: ['Введите сумму.', 'Укажите дату.', 'Выберите способ оплаты.', 'Комментарий — по желанию.', 'Подтвердите оплату.'],
    pins: [[27, 54], [50, 54], [73, 54], [27, 61], [79, 68]],
  },
  {
    id: 'client-issue', title: 'Добавить абонемент', route: 'Клиенты → карточка → Продать абонемент',
    image: '/guides/admin-clients-issue.png',
    steps: ['Проверьте участника.', 'Выберите тип абонемента.', 'Укажите дату начала.', 'Укажите срок оплаты.', 'Отметьте галочку только при полной оплате.', 'Сохраните.'],
    pins: [[27, 44], [50, 44], [73, 44], [27, 52], [27, 59], [81, 67]],
  },
  {
    id: 'client-renew', title: 'Продлить абонемент', route: 'Клиенты → карточка → Абонементы → абонемент → Продлить',
    image: '/guides/admin-clients-renew.png',
    steps: ['Выберите абонемент.', 'Выберите тип продления.', 'Укажите дату начала.', 'Задайте срок оплаты.', 'Отметьте полную оплату, если она получена.', 'Сохраните.'],
    pins: [[27, 44], [50, 44], [73, 44], [27, 52], [27, 59], [81, 67]],
  },
  {
    id: 'client-edit-pass', title: 'Изменить абонемент или заморозить', route: 'Клиенты → карточка → Редактировать абонемент (на телефоне — в «Ещё»)',
    image: '/guides/admin-clients-edit-pass.png',
    steps: ['Измените дату начала.', 'Измените дату окончания.', 'Скорректируйте остаток.', 'Укажите начало заморозки.', 'Укажите окончание заморозки.', 'Выберите причину.', 'Сохраните.'],
    pins: [[27, 38], [50, 38], [73, 38], [27, 49], [50, 49], [27, 58], [81, 79]],
  },
]

const adminScheduleGuides = [
  {
    id: 'schedule-overview', title: 'Ориентироваться в расписании', route: 'Расписание → календарь или список',
    image: '/guides/admin-schedule-list.png',
    steps: ['Переключайте «Календарь» и «Список»; в календаре выбирайте неделю или месяц.', 'Перейдите к дате стрелками, полем даты или кнопкой «Сегодня».', 'В фильтрах задайте тип занятия, тренера, группу, локацию и статус.', 'В строке видны дата, время, места, тренировка, тренер, место и статус. Нажмите на занятие, чтобы открыть состав и посещаемость.'],
    pins: [[95, 12], [82, 28], [82, 12], [49, 34]],
  },
  {
    id: 'schedule-session', title: 'Посмотреть занятие и участников', route: 'Расписание → нажать занятие',
    image: '/guides/admin-schedule-attendance.png',
    steps: ['В карточке занятия проверьте группу или тип, время, тренера, место и статус; заметка показана ниже.', 'В списке участников видны имя, задолженность, группа и отметка посещаемости.', 'Отметьте «Был», «Не был» или «Перенос»; повторное нажатие снимает индивидуальную отметку. «Все присутствовали» попросит подтверждение и спишет по одному занятию каждому.', 'Здесь же можно добавить участника, отредактировать или отменить занятие; внизу — история изменений.'],
    pins: [[43, 38], [49, 55], [92, 14], [61, 28]],
  },
  {
    id: 'schedule-edit', title: 'Изменить занятие', route: 'Расписание → занятие → Изменить',
    image: '/guides/admin-schedule-edit.png',
    steps: ['Нажмите «Изменить» в строке списка или значок карандаша на занятии в календаре.', 'Измените тип и группу/участника, тренера, дату, время или длительность.', 'При необходимости измените локацию, лимит и заметку. Цена группы берётся из настроек группы; индивидуальную или сплит-цену можно менять здесь.', 'Нажмите «Сохранить занятие»; система проверит конфликт расписания.'],
    pins: [[40, 37], [61, 45], [50, 55], [81, 76]],
  },
  {
    id: 'schedule-cancel-restore', title: 'Отменить или восстановить занятие', route: 'Расписание → Список → действие в строке',
    image: '/guides/admin-schedule-list.png',
    steps: ['Нажмите «Отменить» у запланированного занятия — оно останется в списке со статусом «Отменено».', 'Чтобы вернуть его, нажмите «Восстановить тренировку» в отменённой строке.', '«Удалить» — отдельное действие для удаления занятия; выбирайте его только если занятие действительно нужно удалить.'],
    pins: [[89, 34], [86, 39], [96, 34]],
  },
  {
    id: 'schedule-copy-period', title: 'Скопировать расписание на период', route: 'Расписание → Копировать период',
    image: '/guides/admin-schedule-copy.png',
    steps: ['Укажите исходный период и даты, на которые нужно перенести занятия.', 'Оставьте нужные типы: групповые, индивидуальные и/или сплит.', 'Нажмите «Проверить» и посмотрите предварительный итог.', 'Подтвердите копирование готовых занятий кнопкой «Скопировать N» (число покажет система).'],
    pins: [[39, 47], [72, 47], [35, 58], [82, 66]],
  },
  {
    id: 'schedule-group', title: 'Добавить групповую тренировку', route: 'Расписание → Групповая тренировка',
    image: '/guides/admin-schedule-group.png',
    steps: ['Выберите группу и тренера.', 'Укажите дату, начало и длительность.', 'Проверьте место и лимит участников.', 'При необходимости добавьте заметку.', 'Нажмите «Создать занятие».'],
    pins: [[49, 39], [27, 49], [49, 49], [49, 56], [81, 73]],
  },
  {
    id: 'schedule-individual', title: 'Добавить индивидуальную тренировку', route: 'Расписание → Индивидуальная тренировка',
    image: '/guides/admin-schedule-individual.png',
    steps: ['Укажите участника.', 'Проверьте тренера.', 'Укажите дату, время и длительность.', 'Выберите место; при необходимости укажите цену и лимит.', 'Нажмите «Создать занятие».'],
    pins: [[49, 40], [72, 40], [49, 48], [72, 55], [81, 71]],
  },
  {
    id: 'schedule-split', title: 'Добавить сплит-тренировку', route: 'Расписание → Сплит-тренировка',
    image: '/guides/admin-schedule-split.png',
    steps: ['Укажите первого участника.', 'Укажите второго участника.', 'Выберите тренера и укажите дату, время и длительность.', 'Проверьте место и цену.', 'Нажмите «Создать занятие».'],
    pins: [[49, 40], [72, 40], [27, 47], [50, 54], [81, 72]],
  },
]

const adminGroupGuides = [
  {
    id: 'group-create', title: 'Создать или изменить группу', route: 'Группы → Новая группа / Карточка группы → Редактировать',
    image: '/guides/admin-groups-create.png',
    steps: ['Введите название и описание.', 'Укажите вместимость.', 'Назначьте тренера.', 'Выберите место занятий.', 'Цена и настройки записи — по необходимости.', 'Нажмите «Сохранить».'],
    pins: [[37, 33], [74, 33], [74, 43], [25, 52], [49, 43], [81, 77]],
  },
  {
    id: 'group-members', title: 'Добавить участника в группу', route: 'Группы → открыть группу → Добавить',
    image: '/guides/admin-groups-add-member.png',
    steps: ['Выберите клиента из списка.', 'Нажмите «Добавить».'],
    pins: [[49, 51], [63, 57]],
  },
]

const adminTrainerGuides = [
  {
    id: 'trainer-create', title: 'Добавить тренера', route: 'Тренеры → Новый тренер',
    image: '/guides/admin-trainers-create.png',
    steps: ['Введите имя и фамилию.', 'Укажите логин для входа.', 'Добавьте email и телефон.', 'Проверьте статус «Активен».', 'Нажмите «Сохранить».'],
    pins: [[23, 49], [73, 49], [23, 56], [73, 52], [81, 61]],
  },
  {
    id: 'trainer-card', title: 'Открыть карточку тренера', route: 'Тренеры → Профиль',
    image: '/guides/admin-trainers-card.png',
    steps: ['Нажмите «Профиль» у тренера.', 'В карточке проверьте контакты и группы.', 'Вкладка «Расписание» показывает занятия.', 'Кнопками справа можно изменить данные или доступ.'],
    pins: [[95, 52], [34, 44], [27, 37], [84, 31]],
  },
  {
    id: 'trainer-salary', title: 'Добавить ставку и рассчитать зарплату', route: 'Тренеры → Профиль → Зарплата и ставки',
    image: '/guides/admin-trainers-card.png',
    steps: ['Откройте профиль тренера и перейдите во вкладку «Зарплата и ставки».', 'Нажмите «Создать ставку»: для первой оставьте создание новой схемы, для следующей выберите существующую. Укажите тип занятия и базовую сумму в PLN; для группы также задайте порог клиентов и доплату за каждого сверх порога. Нажмите «Сохранить ставку». Расчёт за даты — отдельно, через «Рассчитать период».'],
    pins: [[95, 52], [42, 37]],
  },
]

const trainerGuides = [
  {
    id: 'today', title: 'Открыть занятие', route: 'Сегодня → Открыть посещаемость',
    image: '/guides/trainer-today.png',
    steps: ['Найдите ближайшее занятие.', 'Нажмите «Открыть посещаемость».'],
    pins: [[32, 22], [90, 24]],
  },
  {
    id: 'attendance', title: 'Отметить посещаемость', route: 'Занятие → список учеников',
    image: '/guides/trainer-attendance.png',
    steps: ['Найдите ученика.', 'Выберите статус: «Был»/«Не был» списывают занятие, «Уважительная» — нет. Повторное нажатие снимает отметку.', 'Для всей группы нажмите «Все присутствовали» и подтвердите.'],
    pins: [[30, 30], [84, 30], [92, 15]],
  },
  {
    id: 'schedule', title: 'Посмотреть расписание', route: 'Расписание → день → занятие',
    image: '/guides/trainer-schedule.png',
    steps: ['Выберите день.', 'Нажмите занятие, чтобы открыть его.'],
    pins: [[70, 26], [70, 34]],
  },
  {
    id: 'groups', title: 'Посмотреть группу', route: 'Мои группы → карточка группы',
    image: '/guides/trainer-groups.png',
    steps: ['Найдите свою группу.', 'Нажмите карточку, чтобы увидеть состав.'],
    pins: [[9, 23], [32, 22]],
  },
  {
    id: 'history', title: 'Найти прошедшее занятие', route: 'История → поиск и фильтры',
    image: '/guides/trainer-history.png',
    steps: ['Введите группу или имя ученика.', 'При необходимости откройте фильтры.', 'Выберите занятие в списке.'],
    pins: [[52, 21], [95, 21], [58, 32]],
  },
]

export function GuideScreen({ role = 'trainer', embedded = false, sectionId = 'clients' }) {
  const { t } = useLocale()
  const adminSections = [
        { id: 'clients', title: 'Клиенты', guides: adminClientGuides },
        { id: 'schedule', title: 'Расписание', guides: adminScheduleGuides },
        { id: 'groups', title: 'Группы', guides: adminGroupGuides },
        { id: 'trainers', title: 'Тренеры', guides: adminTrainerGuides },
      ]
  const sections = role === 'admin'
    ? adminSections.filter((section) => section.id === sectionId)
    : [{ id: 'trainer', title: '', guides: trainerGuides }]
  const guides = sections[0]?.guides || []
  const [selectedGuideId, setSelectedGuideId] = useState(guides[0]?.id || '')
  const [zoomedGuide, setZoomedGuide] = useState(null)
  const dialogRef = useRef(null)

  useEffect(() => { setSelectedGuideId(guides[0]?.id || '') }, [sectionId, role])
  useEffect(() => { if (zoomedGuide) dialogRef.current?.showModal() }, [zoomedGuide])

  return <div className={`${embedded ? '' : 'page page-wide '}ops-guide-page`} lang="ru">
    {!embedded && <div className="page-head"><div>
      <h1 className="page-title">{t('runtime.trainer.guide.title')}</h1>
      <p className="page-desc">{t('runtime.trainer.guide.desc')}</p>
    </div></div>}
    <p className="ops-guide-note">Снимки реального интерфейса с учебными данными. Нажмите снимок, чтобы увеличить.</p>
    {sections.map((section) => <section className="ops-guide-section" key={section.id} aria-labelledby={section.title ? `ops-guide-${section.id}-title` : undefined}>
      {section.title && <h2 id={`ops-guide-${section.id}-title`}>{section.title}</h2>}
      {role === 'admin' && <nav className="ops-guide-subnav" aria-label={`Темы инструкции: ${section.title}`}>
        {section.guides.map((guide) => <button type="button" key={guide.id} data-testid={`guide-topic-${guide.id}`} className={selectedGuideId === guide.id ? 'is-active' : ''} aria-pressed={selectedGuideId === guide.id} onClick={() => setSelectedGuideId(guide.id)}>{guide.title}</button>)}
      </nav>}
      <div className="ops-guide-list">
      {section.guides.filter((guide) => role !== 'admin' || guide.id === selectedGuideId).map((guide) => <article id={`guide-${role}-${guide.id}`} className="card ops-guide-card" key={guide.id} data-testid={`guide-${role}-${guide.id}`}>
        <h2>{guide.title}</h2>
        <p className="ops-guide-route">{guide.route}</p>
        <button type="button" className="ops-guide-image" onClick={() => setZoomedGuide(guide)} aria-label={`Увеличить снимок: ${guide.title}`}>
          <img src={guide.image} alt={`Экран SwimCRM: ${guide.title}`} loading="lazy" />
          {guide.pins.map(([x, y], index) => <span className="ops-guide-pin" style={{ left: `${x}%`, top: `${y}%` }} key={index} aria-hidden="true">{index + 1}</span>)}
        </button>
        <ol className="ops-guide-steps">
          {guide.steps.map((step, index) => <li key={step}><span aria-hidden="true">{index + 1}</span>{step}</li>)}
        </ol>
      </article>)}
      </div>
    </section>)}
    <dialog ref={dialogRef} className="ops-guide-dialog" onClose={() => setZoomedGuide(null)} aria-label={zoomedGuide?.title}>
      {zoomedGuide && <>
        <form method="dialog"><button type="submit">{t('common.close')}</button></form>
        <div className="ops-guide-dialog-scroll"><div className="ops-guide-dialog-image">
          <img src={zoomedGuide.image} alt={`Экран SwimCRM: ${zoomedGuide.title}`} />
          {zoomedGuide.pins.map(([x, y], index) => <span className="ops-guide-pin" style={{ left: `${x}%`, top: `${y}%` }} key={index} aria-hidden="true">{index + 1}</span>)}
        </div></div>
      </>}
    </dialog>
  </div>
}
