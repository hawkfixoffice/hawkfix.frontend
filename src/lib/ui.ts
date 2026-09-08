import type { Locale } from './types'

/** Строки интерфейса нового сайта. Тексты страниц берутся из content/ (со старого сайта),
 *  здесь — только новая обвязка: навигация, секции главной, формы, баннер cookie. */
export interface UiStrings {
  nav: { services: string; prices: string; about: string; contact: string }
  cta: { quote: string; call: string; whatsapp: string; more: string; allServices: string; toQuote: string }
  hero: { eyebrow: string; kicker: string; tagline: string; sub: string; scroll: string }
  home: {
    benefitLabel: string; benefitHead: string; benefitHeadTail: string; benefitLead: string
    minVisitTitle: string; minVisitNote: string
    included: string; excluded: string
    calcLabel: string; calcHead: string; calcLead: string
    stepsLabel: string; stepsHead: string
    steps: { t: string; d: string }[]
    servicesLabel: string; servicesHead: string; servicesLead: string
    pricesLabel: string; pricesHead: string; pricesLead: string
    reviewsLabel: string; reviewsHead: string
    ctaHead: string; ctaLead: string
  }
  service: { included: string; priceFrom: string; other: string; backToServices: string; askAbout: string }
  prices: { from: string; perUnit: string; group: string; positions: string }
  breadcrumbs: { home: string }
  form: {
    name: string; phone: string; email: string; address: string; district: string
    comment: string; when: string; urgent: string; submit: string; sending: string
    ok: string; okNote: string; error: string; required: string; agree: string
  }
  cookie: {
    title: string; text: string; accept: string; reject: string; settings: string
    necessary: string; necessaryNote: string; analytics: string; analyticsNote: string
    save: string; more: string
  }
  footer: { services: string; company: string; legal: string; rights: string; photos: string }
  a11y: { skip: string; menu: string; close: string; lang: string; remove: string; add: string; minus: string; plus: string }
}

export const UI: Record<Locale, UiStrings> = {
  pl: {
    nav: { services: 'Usługi', prices: 'Cennik', about: 'O nas', contact: 'Kontakt' },
    cta: { quote: 'Policz cenę', call: 'Zadzwoń', whatsapp: 'WhatsApp', more: 'Więcej', allServices: 'Wszystkie usługi', toQuote: 'Do wyceny' },
    hero: {
      eyebrow: 'Serwis domowy · Warszawa',
      kicker: 'Warszawa i 25 km wokół',
      tagline: 'Złota rączka,\nktórej cenę znasz z góry.',
      sub: 'Zaznaczasz, co jest do zrobienia — cena i czas liczą się na bieżąco. Bez telefonu, bez „wycenimy na miejscu”.',
      scroll: 'Zobacz, jak to działa',
    },
    home: {
      benefitLabel: 'Co robimy', benefitHead: 'Jedna ekipa na', benefitHeadTail: 'całe mieszkanie.',
      benefitLead: 'Hydraulika, elektryka, meble, ściany, sprzątanie, przeprowadzki i ogród. Nie szukasz pięciu fachowców — dzwonisz raz.',
      minVisitTitle: 'Minimalna wizyta', minVisitNote: 'Dojazd uzupełnia koszt prac do minimum. Płatne kilometry poza miastem liczymy osobno.',
      included: 'W cenie', excluded: 'Poza ceną',
      calcLabel: 'Wycena', calcHead: 'Kosztorys składasz sam.', calcLead: 'Zaznacz prace z listy — od razu widzisz cenę i czas. Kosztorys wysyłasz jednym przyciskiem.',
      stepsLabel: 'Jak to działa', stepsHead: 'Trzy kroki, zero niespodzianek.',
      steps: [
        { t: 'Zaznaczasz prace', d: 'Lista 105 pozycji z cenami. Szukasz po nazwie albo przeglądasz grupami.' },
        { t: 'Widzisz cenę i czas', d: 'Suma przelicza się przy każdym kliknięciu. Wiesz, ile zapłacisz, zanim wyślesz.' },
        { t: 'Przyjeżdżamy', d: 'Potwierdzamy termin. Cena z kosztorysu jest wiążąca — zmienia się tylko za Twoją zgodą.' },
      ],
      servicesLabel: 'Usługi', servicesHead: 'Od cieknącego kranu', servicesLead: 'do przeprowadzki przez pół Polski.',
      pricesLabel: 'Cennik', pricesHead: 'Ceny bez gwiazdek.', pricesLead: 'Każda grupa prac ma stawkę od. Pełny cennik — 105 pozycji.',
      reviewsLabel: 'Opinie', reviewsHead: 'Co mówią klienci.',
      ctaHead: 'Opisz problem — dostaniesz cenę.', ctaLead: 'Wstępna wycena z opisu lub zdjęć jest bezpłatna.',
    },
    service: { included: 'Co wchodzi', priceFrom: 'Cena od', other: 'Inne usługi', backToServices: 'Wszystkie usługi', askAbout: 'Zgłoś tę usługę' },
    prices: { from: 'od', perUnit: 'za', group: 'Grupa', positions: 'pozycji' },
    breadcrumbs: { home: 'Strona główna' },
    form: {
      name: 'Imię', phone: 'Telefon', email: 'E-mail', address: 'Ulica i numer', district: 'Dzielnica',
      comment: 'Opisz, co jest do zrobienia', when: 'Kiedy', urgent: 'Dziś lub jutro (+50%)',
      submit: 'Wyślij zlecenie', sending: 'Wysyłamy…',
      ok: 'Mamy Twoje zgłoszenie.', okNote: 'Odzywamy się w godzinach pracy, zwykle w ciągu godziny.',
      error: 'Nie udało się wysłać. Zadzwoń albo napisz na WhatsApp.',
      required: 'To pole jest wymagane.', agree: 'Wysyłając zgłoszenie akceptujesz',
    },
    cookie: {
      title: 'Ciasteczka', text: 'Używamy plików cookie. Niezbędne — żeby strona działała. Analityczne włączamy tylko za Twoją zgodą.',
      accept: 'Akceptuję wszystkie', reject: 'Tylko niezbędne', settings: 'Ustawienia',
      necessary: 'Niezbędne', necessaryNote: 'Zapamiętują Twój wybór i wersję językową. Zawsze aktywne.',
      analytics: 'Analityczne', analyticsNote: 'Anonimowa statystyka odwiedzin. Bez nich strona działa tak samo.',
      save: 'Zapisz wybór', more: 'Polityka cookies',
    },
    footer: { services: 'Usługi', company: 'Firma', legal: 'Dokumenty', rights: 'Wszelkie prawa zastrzeżone', photos: 'Zdjęcia' },
    a11y: { skip: 'Przejdź do treści', menu: 'Menu', close: 'Zamknij', lang: 'Język', remove: 'Usuń', add: 'Dodaj', minus: 'Mniej', plus: 'Więcej' },
  },

  uk: {
    nav: { services: 'Послуги', prices: 'Ціни', about: 'Про нас', contact: 'Контакти' },
    cta: { quote: 'Порахувати ціну', call: 'Подзвонити', whatsapp: 'WhatsApp', more: 'Докладніше', allServices: 'Усі послуги', toQuote: 'До кошторису' },
    hero: {
      eyebrow: 'Домашній сервіс · Варшава',
      kicker: 'Варшава і 25 км навколо',
      tagline: 'Майстер,\nчию ціну ви знаєте наперед.',
      sub: 'Позначаєте, що треба зробити — ціна й час рахуються одразу. Без дзвінків і без «оцінимо на місці».',
      scroll: 'Подивитись, як це працює',
    },
    home: {
      benefitLabel: 'Що ми робимо', benefitHead: 'Одна бригада на', benefitHeadTail: 'усю квартиру.',
      benefitLead: 'Сантехніка, електрика, меблі, стіни, прибирання, переїзди та сад. Не шукаєте п’ятьох майстрів — телефонуєте один раз.',
      minVisitTitle: 'Мінімальний виїзд', minVisitNote: 'Дорога добирає вартість робіт до мінімуму. Платні кілометри за містом рахуємо окремо.',
      included: 'У ціні', excluded: 'Поза ціною',
      calcLabel: 'Кошторис', calcHead: 'Кошторис складаєте самі.', calcLead: 'Позначте роботи зі списку — одразу бачите ціну й час. Надсилаєте однією кнопкою.',
      stepsLabel: 'Як це працює', stepsHead: 'Три кроки, жодних сюрпризів.',
      steps: [
        { t: 'Позначаєте роботи', d: 'Список зі 105 позицій із цінами. Шукайте за назвою або дивіться групами.' },
        { t: 'Бачите ціну й час', d: 'Сума перераховується з кожним кліком. Ви знаєте суму ще до відправки.' },
        { t: 'Ми приїздимо', d: 'Підтверджуємо час. Ціна з кошторису незмінна — тільки за вашою згодою.' },
      ],
      servicesLabel: 'Послуги', servicesHead: 'Від крана, що тече,', servicesLead: 'до переїзду через пів Польщі.',
      pricesLabel: 'Ціни', pricesHead: 'Ціни без зірочок.', pricesLead: 'У кожної групи робіт є ставка «від». Повний прайс — 105 позицій.',
      reviewsLabel: 'Відгуки', reviewsHead: 'Що кажуть клієнти.',
      ctaHead: 'Опишіть проблему — отримаєте ціну.', ctaLead: 'Попередня оцінка з опису чи фото безкоштовна.',
    },
    service: { included: 'Що входить', priceFrom: 'Ціна від', other: 'Інші послуги', backToServices: 'Усі послуги', askAbout: 'Замовити цю послугу' },
    prices: { from: 'від', perUnit: 'за', group: 'Група', positions: 'позицій' },
    breadcrumbs: { home: 'Головна' },
    form: {
      name: 'Ім’я', phone: 'Телефон', email: 'E-mail', address: 'Вулиця і номер', district: 'Район',
      comment: 'Опишіть, що треба зробити', when: 'Коли', urgent: 'Сьогодні або завтра (+50%)',
      submit: 'Надіслати заявку', sending: 'Надсилаємо…',
      ok: 'Заявку отримали.', okNote: 'Відповідаємо в робочі години, зазвичай протягом години.',
      error: 'Не вдалося надіслати. Зателефонуйте або напишіть у WhatsApp.',
      required: 'Це поле обов’язкове.', agree: 'Надсилаючи заявку, ви приймаєте',
    },
    cookie: {
      title: 'Файли cookie', text: 'Ми використовуємо cookie. Необхідні — щоб сайт працював. Аналітичні вмикаємо лише за вашою згодою.',
      accept: 'Прийняти всі', reject: 'Лише необхідні', settings: 'Налаштування',
      necessary: 'Необхідні', necessaryNote: 'Запам’ятовують ваш вибір і мову. Завжди активні.',
      analytics: 'Аналітичні', analyticsNote: 'Анонімна статистика відвідувань. Без них сайт працює так само.',
      save: 'Зберегти вибір', more: 'Політика cookie',
    },
    footer: { services: 'Послуги', company: 'Компанія', legal: 'Документи', rights: 'Усі права захищені', photos: 'Фото' },
    a11y: { skip: 'Перейти до змісту', menu: 'Меню', close: 'Закрити', lang: 'Мова', remove: 'Видалити', add: 'Додати', minus: 'Менше', plus: 'Більше' },
  },

  ru: {
    nav: { services: 'Услуги', prices: 'Цены', about: 'О нас', contact: 'Контакты' },
    cta: { quote: 'Посчитать цену', call: 'Позвонить', whatsapp: 'WhatsApp', more: 'Подробнее', allServices: 'Все услуги', toQuote: 'К смете' },
    hero: {
      eyebrow: 'Домашний сервис · Варшава',
      kicker: 'Варшава и 25 км вокруг',
      tagline: 'Мастер,\nцену которого вы знаете заранее.',
      sub: 'Отмечаете, что нужно сделать — цена и время считаются сразу. Без звонков и без «оценим на месте».',
      scroll: 'Посмотреть, как это работает',
    },
    home: {
      benefitLabel: 'Что мы делаем', benefitHead: 'Одна бригада на', benefitHeadTail: 'всю квартиру.',
      benefitLead: 'Сантехника, электрика, мебель, стены, уборка, переезды и сад. Не ищете пятерых мастеров — звоните один раз.',
      minVisitTitle: 'Минимальный выезд', minVisitNote: 'Дорога добирает стоимость работ до минимума. Платные километры за городом считаем отдельно.',
      included: 'В цене', excluded: 'Вне цены',
      calcLabel: 'Смета', calcHead: 'Смету вы составляете сами.', calcLead: 'Отметьте работы из списка — сразу видите цену и время. Отправляете одной кнопкой.',
      stepsLabel: 'Как это работает', stepsHead: 'Три шага, никаких сюрпризов.',
      steps: [
        { t: 'Отмечаете работы', d: 'Список из 105 позиций с ценами. Ищите по названию или смотрите по группам.' },
        { t: 'Видите цену и время', d: 'Сумма пересчитывается на каждом клике. Вы знаете сумму до отправки.' },
        { t: 'Мы приезжаем', d: 'Подтверждаем время. Цена из сметы не меняется — только с вашего согласия.' },
      ],
      servicesLabel: 'Услуги', servicesHead: 'От текущего крана', servicesLead: 'до переезда через полстраны.',
      pricesLabel: 'Цены', pricesHead: 'Цены без звёздочек.', pricesLead: 'У каждой группы работ есть ставка «от». Полный прайс — 105 позиций.',
      reviewsLabel: 'Отзывы', reviewsHead: 'Что говорят клиенты.',
      ctaHead: 'Опишите проблему — получите цену.', ctaLead: 'Предварительная оценка по описанию или фото бесплатна.',
    },
    service: { included: 'Что входит', priceFrom: 'Цена от', other: 'Другие услуги', backToServices: 'Все услуги', askAbout: 'Заказать эту услугу' },
    prices: { from: 'от', perUnit: 'за', group: 'Группа', positions: 'позиций' },
    breadcrumbs: { home: 'Главная' },
    form: {
      name: 'Имя', phone: 'Телефон', email: 'E-mail', address: 'Улица и номер', district: 'Район',
      comment: 'Опишите, что нужно сделать', when: 'Когда', urgent: 'Сегодня или завтра (+50%)',
      submit: 'Отправить заявку', sending: 'Отправляем…',
      ok: 'Заявку получили.', okNote: 'Отвечаем в рабочие часы, обычно в течение часа.',
      error: 'Не удалось отправить. Позвоните или напишите в WhatsApp.',
      required: 'Это поле обязательно.', agree: 'Отправляя заявку, вы принимаете',
    },
    cookie: {
      title: 'Файлы cookie', text: 'Мы используем cookie. Необходимые — чтобы сайт работал. Аналитические включаем только с вашего согласия.',
      accept: 'Принять все', reject: 'Только необходимые', settings: 'Настройки',
      necessary: 'Необходимые', necessaryNote: 'Запоминают ваш выбор и язык. Всегда активны.',
      analytics: 'Аналитические', analyticsNote: 'Анонимная статистика посещений. Без них сайт работает так же.',
      save: 'Сохранить выбор', more: 'Политика cookie',
    },
    footer: { services: 'Услуги', company: 'Компания', legal: 'Документы', rights: 'Все права защищены', photos: 'Фото' },
    a11y: { skip: 'Перейти к содержимому', menu: 'Меню', close: 'Закрыть', lang: 'Язык', remove: 'Удалить', add: 'Добавить', minus: 'Меньше', plus: 'Больше' },
  },

  en: {
    nav: { services: 'Services', prices: 'Prices', about: 'About', contact: 'Contact' },
    cta: { quote: 'Get a price', call: 'Call', whatsapp: 'WhatsApp', more: 'Learn more', allServices: 'All services', toQuote: 'To the quote' },
    hero: {
      eyebrow: 'Home services · Warsaw',
      kicker: 'Warsaw and 25 km around',
      tagline: 'A handyman whose\nprice you know upfront.',
      sub: 'Tick what needs doing — price and time add up as you go. No phone tag, no “we’ll quote on site”.',
      scroll: 'See how it works',
    },
    home: {
      benefitLabel: 'What we do', benefitHead: 'One crew for', benefitHeadTail: 'the whole flat.',
      benefitLead: 'Plumbing, electrics, furniture, walls, cleaning, moving and the garden. You don’t hunt for five trades — you call once.',
      minVisitTitle: 'Minimum visit', minVisitNote: 'Travel tops the labour up to the minimum. Paid kilometres outside the city are counted separately.',
      included: 'Included', excluded: 'Not included',
      calcLabel: 'Quote', calcHead: 'You build the quote yourself.', calcLead: 'Tick the jobs — the price and time appear straight away. Send it with one button.',
      stepsLabel: 'How it works', stepsHead: 'Three steps, no surprises.',
      steps: [
        { t: 'Tick the jobs', d: '105 priced items. Search by name or browse by group.' },
        { t: 'See price and time', d: 'The total recalculates on every click. You know the figure before you send.' },
        { t: 'We turn up', d: 'We confirm the slot. The quoted price holds — it changes only with your agreement.' },
      ],
      servicesLabel: 'Services', servicesHead: 'From a dripping tap', servicesLead: 'to a move across Poland.',
      pricesLabel: 'Prices', pricesHead: 'Prices without asterisks.', pricesLead: 'Every group of work has a “from” rate. Full price list — 105 items.',
      reviewsLabel: 'Reviews', reviewsHead: 'What clients say.',
      ctaHead: 'Describe the problem — get a price.', ctaLead: 'A first estimate from your description or photos is free.',
    },
    service: { included: 'What’s included', priceFrom: 'Price from', other: 'Other services', backToServices: 'All services', askAbout: 'Book this service' },
    prices: { from: 'from', perUnit: 'per', group: 'Group', positions: 'items' },
    breadcrumbs: { home: 'Home' },
    form: {
      name: 'Name', phone: 'Phone', email: 'Email', address: 'Street and number', district: 'District',
      comment: 'Describe what needs doing', when: 'When', urgent: 'Today or tomorrow (+50%)',
      submit: 'Send the request', sending: 'Sending…',
      ok: 'We’ve got your request.', okNote: 'We reply during working hours, usually within the hour.',
      error: 'Sending failed. Call us or write on WhatsApp.',
      required: 'This field is required.', agree: 'By sending the request you accept the',
    },
    cookie: {
      title: 'Cookies', text: 'We use cookies. The necessary ones keep the site working. Analytics load only with your consent.',
      accept: 'Accept all', reject: 'Necessary only', settings: 'Settings',
      necessary: 'Necessary', necessaryNote: 'Remember your choice and language. Always on.',
      analytics: 'Analytics', analyticsNote: 'Anonymous visit statistics. The site works the same without them.',
      save: 'Save choice', more: 'Cookie policy',
    },
    footer: { services: 'Services', company: 'Company', legal: 'Legal', rights: 'All rights reserved', photos: 'Photos' },
    a11y: { skip: 'Skip to content', menu: 'Menu', close: 'Close', lang: 'Language', remove: 'Remove', add: 'Add', minus: 'Less', plus: 'More' },
  },
}

export const CONTACT = {
  phone: '+48 532 481 505',
  phoneHref: 'tel:+48532481505',
  whatsapp: '48735369350',
  email: 'info@hawkfix.pl',
  facebook: 'https://www.facebook.com/profile.php?id=61593152744112',
  city: 'Warszawa',
  radiusKm: 25,
}
