import type { Locale } from './types'

/** Строки простой вёрстки (2026-09-29) и SEO-слоя «для людей и ассистентов».
 *
 *  Блок «коротко» — ответ в первых строках: кто, где, сколько, как заказать.
 *  Так страницу понимают и поисковик, и ChatGPT/Perplexity/Gemini, которые
 *  цитируют короткие фактические абзацы. Здесь же стоят запросы, которых не
 *  было в видимом тексте: «złota rączka», «mąż na godzinę», «fachowiec»,
 *  «majster» и их аналоги на uk/ru/en.
 *
 *  Плейсхолдеры: {min} — минимальная визита, {n} — позиций в прайсе,
 *  {s} — услуг, {km} — радиус, {pct}/{max} — надбавка за срочность,
 *  {name} — услуга, {from} — цена от. */
export interface UiExtra {
  facts: {
    head: string
    lead: string
    rows: { k: string; v: string }[]
  }
  sfaq: {
    head: string
    /** aNoList — для услуги без своего прайса на странице */
    price: { q: string; a: string; aNoList: string }
    when: { q: string; a: string }
    area: { q: string; a: string }
    order: { q: string; a: string }
  }
  /** Три шага на главной, коротко (2026-11-24) */
  flow: { t: string; d: string }[]
  simple: {
    servicesHead: string
    pricesLink: string
    from: string
    included: string
    otherHead: string
    contactHead: string
    districtsHead: string
    /** Кнопка WhatsApp в герое — «написать», а не номер */
    write: string
    /** Когда можно звонить, когда писать */
    hours: string
  }
}

export const EXTRA: Record<Locale, UiExtra> = {
  pl: {
    flow: [
      { t: 'Opisz problem', d: 'lub wybierz z listy' },
      { t: 'Widzisz cenę', d: 'przed wysłaniem' },
      { t: 'Przyjeżdżamy', d: 'potwierdzamy termin' },
    ],
    facts: {
      head: 'HAWK.FIX w skrócie',
      lead: 'HAWK.FIX to złota rączka w Warszawie — mąż na godzinę bez zgadywania ceny. Jeden fachowiec albo cała ekipa do drobnych napraw, montażu, sprzątania i przeprowadzek. Cenę widzisz, zanim zamówisz.',
      rows: [
        { k: 'Gdzie', v: 'Warszawa i {km} km wokół: Mokotów, Wola, Praga, Ursynów, Bielany, Białołęka i inne dzielnice.' },
        { k: 'Ile kosztuje', v: 'Minimalna wizyta {min} zł. Cennik ma {n} pozycji z cenami — wiesz z góry, ile zapłacisz.' },
        { k: 'Co robimy', v: '{s} usług: hydraulik, elektryk, montaż mebli i AGD, ściany, sprzątanie, przeprowadzki, ogród.' },
        { k: 'Kiedy', v: 'Od poniedziałku do piątku, 08:00–20:00. Przyjazd dziś lub jutro: +{pct}%, najwyżej +{max} zł.' },
        { k: 'Jak zamówić', v: 'Kosztorys na tej stronie albo WhatsApp. Majster potwierdza termin i przyjeżdża.' },
        { k: 'Języki', v: 'Polski, українська, русский, English.' },
        { k: 'Kontakt', v: 'WhatsApp +48 735 369 350: dzwoń w dni robocze 9:00–17:00, pisz o każdej porze.' },
      ],
    },
    sfaq: {
      head: 'Pytania o tę usługę',
      price: { q: 'Ile kosztuje {name} w Warszawie?', a: '{name}: od {from} zł. Minimalna wizyta to {min} zł — dojazd uzupełnia koszt prac do minimum. Ceny wszystkich prac są na tej stronie, a dokładną sumę pokazuje kalkulator.', aNoList: '{name}: od {from} zł — tyle kosztuje minimalna wizyta, dojazd uzupełnia koszt prac do minimum. Dokładną sumę pokazuje kalkulator na stronie głównej.' },
      when: { q: 'Jak szybko przyjedzie fachowiec?', a: 'Pracujemy od poniedziałku do piątku, 08:00–20:00. Dzień i godzinę przyjazdu ustalamy na WhatsApp. Przyjazd dziś lub jutro kosztuje +{pct}%, najwyżej +{max} zł.' },
      area: { q: 'Czy dojeżdżacie poza Warszawę?', a: 'Tak, do {km} km od Warszawy. Płatne kilometry poza miastem liczymy osobno.' },
      order: { q: 'Jak zamówić złotą rączkę?', a: 'Opisz, co się stało, albo zaznacz prace w kalkulatorze i wyślij na WhatsApp — cenę z cennika widzisz od razu, a zgłoszenie dostaje numer.' },
    },
    simple: {
      servicesHead: 'Co naprawiamy',
      pricesLink: 'Pełny cennik',
      from: 'od',
      included: 'Co wchodzi',
      otherHead: 'Inne usługi',
      contactHead: 'Napisz do nas',
      districtsHead: 'Dzielnice',
      write: 'Napisz',
      hours: 'Dzwoń w dni robocze 9:00–17:00, pisz o każdej porze.',
    },
  },

  uk: {
    flow: [
      { t: 'Опишіть проблему', d: 'або оберіть зі списку' },
      { t: 'Бачите ціну', d: 'ще до відправки' },
      { t: 'Приїжджаємо', d: 'підтверджуємо час' },
    ],
    facts: {
      head: 'HAWK.FIX коротко',
      lead: 'HAWK.FIX — майстер на годину у Варшаві (złota rączka): чоловік на годину без вгадування ціни. Один майстер або ціла бригада для дрібного ремонту, монтажу, прибирання та переїздів. Ціну бачите ще до замовлення.',
      rows: [
        { k: 'Де', v: 'Варшава і {km} км навколо: Мокотув, Воля, Прага, Урсинув, Беляни, Бялоленка та інші райони.' },
        { k: 'Скільки коштує', v: 'Мінімальний виїзд {min} zł. У прайсі {n} позицій із цінами — суму знаєте наперед.' },
        { k: 'Що робимо', v: '{s} послуг: сантехнік, електрик, збирання меблів і техніки, стіни, прибирання, переїзди, сад.' },
        { k: 'Коли', v: 'З понеділка по пʼятницю, 08:00–20:00. Виїзд сьогодні або завтра: +{pct}%, не більше +{max} zł.' },
        { k: 'Як замовити', v: 'Кошторис на цьому сайті або WhatsApp. Майстер підтверджує час і приїжджає.' },
        { k: 'Мови', v: 'Polski, українська, русский, English.' },
        { k: 'Зв’язок', v: 'WhatsApp +48 735 369 350: телефонуйте в робочі дні з 9:00 до 17:00, пишіть будь-коли.' },
      ],
    },
    sfaq: {
      head: 'Питання про цю послугу',
      price: { q: 'Скільки коштує {name} у Варшаві?', a: '{name}: від {from} zł. Мінімальний виїзд — {min} zł: дорога добирає вартість робіт до мінімуму. Ціни всіх робіт — на цій сторінці, точну суму покаже калькулятор.', aNoList: '{name}: від {from} zł — це мінімальний виїзд, дорога добирає вартість робіт до мінімуму. Точну суму покаже калькулятор на головній.' },
      when: { q: 'Як швидко приїде майстер?', a: 'Працюємо з понеділка по пʼятницю, 08:00–20:00. День і час приїзду узгоджуємо у WhatsApp. Виїзд сьогодні або завтра — +{pct}%, не більше +{max} zł.' },
      area: { q: 'Чи їздите за межі Варшави?', a: 'Так, до {km} км від Варшави. Платні кілометри за містом рахуємо окремо.' },
      order: { q: 'Як замовити майстра на годину?', a: 'Опишіть, що сталося, або позначте роботи в калькуляторі й надішліть у WhatsApp — ціну з прайсу бачите одразу, а заявка отримує номер.' },
    },
    simple: {
      servicesHead: 'Що ремонтуємо',
      pricesLink: 'Повний прайс',
      from: 'від',
      included: 'Що входить',
      otherHead: 'Інші послуги',
      contactHead: 'Напишіть нам',
      districtsHead: 'Райони',
      write: 'Написати',
      hours: 'Телефонуйте в робочі дні з 9:00 до 17:00, пишіть будь-коли.',
    },
  },

  ru: {
    flow: [
      { t: 'Опишите проблему', d: 'или выберите из списка' },
      { t: 'Видите цену', d: 'ещё до отправки' },
      { t: 'Приезжаем', d: 'подтверждаем время' },
    ],
    facts: {
      head: 'HAWK.FIX коротко',
      lead: 'HAWK.FIX — мастер на час в Варшаве (złota rączka): муж на час без угадывания цены. Один мастер или целая бригада для мелкого ремонта, монтажа, уборки и переездов. Цену видите ещё до заказа.',
      rows: [
        { k: 'Где', v: 'Варшава и {km} км вокруг: Мокотув, Воля, Прага, Урсинув, Беляны, Бялоленка и другие районы.' },
        { k: 'Сколько стоит', v: 'Минимальный выезд {min} zł. В прайсе {n} позиций с ценами — сумму знаете заранее.' },
        { k: 'Что делаем', v: '{s} услуг: сантехник, электрик, сборка мебели и техники, стены, уборка, переезды, сад.' },
        { k: 'Когда', v: 'С понедельника по пятницу, 08:00–20:00. Выезд сегодня или завтра: +{pct}%, не больше +{max} zł.' },
        { k: 'Как заказать', v: 'Смета на этом сайте или WhatsApp. Мастер подтверждает время и приезжает.' },
        { k: 'Языки', v: 'Polski, українська, русский, English.' },
        { k: 'Связь', v: 'WhatsApp +48 735 369 350: звоните в рабочие дни с 9:00 до 17:00, пишите в любое время.' },
      ],
    },
    sfaq: {
      head: 'Вопросы об этой услуге',
      price: { q: 'Сколько стоит {name} в Варшаве?', a: '{name}: от {from} zł. Минимальный выезд — {min} zł: дорога добирает стоимость работ до минимума. Цены всех работ — на этой странице, точную сумму покажет калькулятор.', aNoList: '{name}: от {from} zł — это минимальный выезд, дорога добирает стоимость работ до минимума. Точную сумму покажет калькулятор на главной.' },
      when: { q: 'Как быстро приедет мастер?', a: 'Работаем с понедельника по пятницу, 08:00–20:00. День и время приезда согласуем в WhatsApp. Выезд сегодня или завтра — +{pct}%, не больше +{max} zł.' },
      area: { q: 'Выезжаете за пределы Варшавы?', a: 'Да, до {km} км от Варшавы. Платные километры за городом считаем отдельно.' },
      order: { q: 'Как заказать мастера на час?', a: 'Опишите, что случилось, или отметьте работы в калькуляторе и отправьте в WhatsApp — цену из прайса видите сразу, а заявка получает номер.' },
    },
    simple: {
      servicesHead: 'Что ремонтируем',
      pricesLink: 'Полный прайс',
      from: 'от',
      included: 'Что входит',
      otherHead: 'Другие услуги',
      contactHead: 'Напишите нам',
      districtsHead: 'Районы',
      write: 'Написать',
      hours: 'Звоните в рабочие дни с 9:00 до 17:00, пишите в любое время.',
    },
  },

  en: {
    flow: [
      { t: 'Describe the problem', d: 'or pick from the list' },
      { t: 'See the price', d: 'before you send' },
      { t: 'We come over', d: 'we confirm the time' },
    ],
    facts: {
      head: 'HAWK.FIX in short',
      lead: 'HAWK.FIX is a handyman service in Warsaw (złota rączka) — a husband for hire without guessing the price. One handyman or a whole crew for small repairs, assembly, cleaning and moving. You see the price before you order.',
      rows: [
        { k: 'Where', v: 'Warsaw and {km} km around: Mokotów, Wola, Praga, Ursynów, Bielany, Białołęka and other districts.' },
        { k: 'Price', v: 'Minimum visit {min} zł. The price list has {n} items with prices — you know the total up front.' },
        { k: 'What we do', v: '{s} services: plumber, electrician, furniture and appliance assembly, walls, cleaning, moving, garden.' },
        { k: 'When', v: 'Monday to Friday, 08:00–20:00. Visit today or tomorrow: +{pct}%, at most +{max} zł.' },
        { k: 'How to order', v: 'Build the estimate on this site or message us on WhatsApp. The handyman confirms the time and comes over.' },
        { k: 'Languages', v: 'Polski, українська, русский, English.' },
        { k: 'Contact', v: 'WhatsApp +48 735 369 350: call on weekdays 9:00–17:00, message us any time.' },
      ],
    },
    sfaq: {
      head: 'Questions about this service',
      price: { q: 'How much does {name} cost in Warsaw?', a: '{name}: from {from} zł. The minimum visit is {min} zł — travel tops the cost of work up to the minimum. Prices of all jobs are on this page, and the calculator shows the exact total.', aNoList: '{name}: from {from} zł — that is the minimum visit; travel tops the cost of work up to the minimum. The calculator on the home page shows the exact total.' },
      when: { q: 'How soon can a handyman come?', a: 'We work Monday to Friday, 08:00–20:00. We agree the day and arrival time on WhatsApp. A visit today or tomorrow costs +{pct}%, at most +{max} zł.' },
      area: { q: 'Do you travel outside Warsaw?', a: 'Yes, up to {km} km from Warsaw. Paid kilometres outside the city are charged separately.' },
      order: { q: 'How do I book a handyman?', a: 'Describe what happened or tick the jobs in the calculator and send it on WhatsApp — you see the list price right away and the request gets a number.' },
    },
    simple: {
      servicesHead: 'What we fix',
      pricesLink: 'Full price list',
      from: 'from',
      included: 'What’s included',
      otherHead: 'Other services',
      contactHead: 'Message us',
      districtsHead: 'Districts',
      write: 'Message us',
      hours: 'Call on weekdays 9:00–17:00, message us any time.',
    },
  },
}

/** Подстановка {плейсхолдеров}; неизвестные оставляем как есть. */
export function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
}
