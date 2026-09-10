// HAWK.FIX — приём заявок с сайта.
// Единственный путь записи в таблицу leads: у неё нет ни одной RLS-политики,
// поэтому anon-ключом туда не попасть, а функция ходит service-ключом.

const ALLOWED_ORIGINS = [
  'https://hawkfix.pl',
  'https://www.hawkfix.pl',
  // витрина для проверки — без неё браузер режет ответ по CORS и форма молчит
  'https://hawnfix.barabashflow.pl',
  'http://localhost:4173',
  'http://localhost:5173',
]

const LOCALES = ['pl', 'uk', 'ru', 'en']

/** Куда падают заявки и от кого шлём. Домен hawkfix.pl подтверждён в Resend. */
const MAIL_TO = 'hawk.fix.office@gmail.com'
const MAIL_FROM = 'HAWK.FIX <zgloszenia@hawkfix.pl>'

const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

interface Item { name?: string; qty?: number; sum?: number }

/** Письмо владельцу в фирменном оформлении сайта.
 *  Вёрстка на таблицах и с инлайновыми стилями — иначе Outlook разъедет.
 *  Скругления в нём игнорируются, углы станут прямыми: это допустимо. */
function buildEmail(row: Record<string, unknown>, orderNo: string) {
  const items = (row.items as Item[]) ?? []
  const totals = (row.totals ?? {}) as Record<string, number>
  const money = (n: unknown) => (typeof n === 'number' ? `${Math.round(n)} zł` : '—')

  const INK = '#111312', MINT = '#6eefa0', FOREST = '#1a4a2e'
  const PAPER = '#f1f1ef', GREY = '#e9e9e9', MUTED = '#6b6b6b'
  // Кавычки ТОЛЬКО одинарные: стек попадает в style="...", и двойная кавычка
  // внутри обрывает атрибут — стиль тогда отваливается целиком.
  const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
  const digits = String(row.phone ?? '').replace(/[^+\d]/g, '')

  // Gmail выбрасывает <body> и его стили, поэтому font-family дублируем
  // на каждом контейнере, а не полагаемся на наследование.
  const card = (inner: string, bg = '#ffffff', pad = '24px 28px') =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="background:${bg};border-radius:20px;margin-bottom:12px">
       <tr><td style="padding:${pad};font-family:${FONT}">${inner}</td></tr></table>`

  const line = (label: string, value: unknown, strong = true) =>
    value
      ? `<tr>
           <td style="padding:7px 16px 7px 0;font-family:${FONT};color:${MUTED};font-size:14px;white-space:nowrap">${label}</td>
           <td style="padding:7px 0;font-family:${FONT};font-size:16px;${strong ? 'font-weight:600;' : ''}color:${INK}">${esc(value)}</td>
         </tr>`
      : ''

  const rows = items.length
    ? items.map((i, n) =>
        `<tr>
           <td style="padding:11px 0;border-top:${n ? `1px solid ${GREY}` : '0'};font-family:${FONT};font-size:15px;color:${INK}">${esc(i.name)}</td>
           <td style="padding:11px 8px;border-top:${n ? `1px solid ${GREY}` : '0'};font-size:14px;color:${MUTED};text-align:center;white-space:nowrap">×${esc(i.qty)}</td>
           <td style="padding:11px 0;border-top:${n ? `1px solid ${GREY}` : '0'};font-size:15px;color:${INK};text-align:right;white-space:nowrap">${money(i.sum)}</td>
         </tr>`).join('')
    : `<tr><td style="padding:11px 0;color:${MUTED};font-size:15px">Bez pozycji z cennika — tylko opis od klienta</td></tr>`

  const btn = (href: string, label: string, bg: string, color: string) =>
    `<a href="${href}" style="display:inline-block;background:${bg};color:${color};text-decoration:none;
        padding:14px 26px;border-radius:999px;font-size:15px;font-weight:600;font-family:${FONT}">${label}</a>`

  const html = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>${esc(orderNo)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};font-family:${FONT};color:${INK};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">
  ${esc(row.name)} · ${esc(row.phone)} · ${money(totals.total)}${row.urgent ? ' · PILNE' : ''}
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER}">
<tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;font-family:${FONT}">

  <tr><td style="padding-bottom:16px;font-family:${FONT};font-size:19px;font-weight:600;letter-spacing:-.02em;color:${INK}">
    HAWK<span style="color:${FOREST}">.</span>FIX
  </td></tr>

  <tr><td>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${INK};border-radius:24px;margin-bottom:12px">
      <tr><td style="padding:30px 28px;font-family:${FONT}">
        <div style="font-size:14px;color:#8c8c8c;padding-bottom:6px">Nowe zgłoszenie ze strony</div>
        <div style="font-family:${FONT};font-size:42px;line-height:1.05;letter-spacing:-.035em;color:#ffffff">${esc(orderNo)}</div>
        ${row.urgent ? `<div style="margin-top:14px"><span style="display:inline-block;background:${MINT};color:${INK};
             border-radius:999px;padding:7px 16px;font-size:13px;font-weight:600">Pilne · dopłata +50%</span></div>` : ''}
      </td></tr>
    </table>
  </td></tr>

  <tr><td>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${MINT};border-radius:20px;margin-bottom:12px">
      <tr>
        <td style="padding:22px 28px;font-family:${FONT}">
          <div style="font-size:14px;color:rgba(17,19,18,.65)">Razem z kosztorysu</div>
          <div style="font-family:${FONT};font-size:38px;line-height:1.05;letter-spacing:-.035em;color:${INK}">${money(totals.total)}</div>
        </td>
        ${totals.hours ? `<td align="right" style="padding:22px 28px;font-family:${FONT};font-size:14px;color:rgba(17,19,18,.65);white-space:nowrap">
          ok. ${esc(totals.hours)} godz.</td>` : ''}
      </tr>
    </table>
  </td></tr>

  <tr><td>${card(`
    <div style="font-family:${FONT};font-size:22px;letter-spacing:-.02em;color:${INK};padding-bottom:12px">Klient</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      ${line('Imię', row.name)}
      ${line('Telefon', row.phone)}
      ${line('E-mail', row.email)}
      ${line('Dzielnica', row.district)}
      ${line('Adres', row.address)}
      ${line('Termin', [row.when_date, row.when_time].filter(Boolean).join(', '))}
      ${line('Język', row.locale, false)}
      ${line('Strona', row.page, false)}
    </table>
    ${row.comment ? `<div style="margin-top:16px;padding:16px 18px;background:${PAPER};border-radius:14px;
         font-family:${FONT};font-size:15px;line-height:1.5;color:${INK};white-space:pre-wrap">${esc(row.comment)}</div>` : ''}
  `)}</td></tr>

  <tr><td>${card(`
    <div style="font-family:${FONT};font-size:22px;letter-spacing:-.02em;color:${INK};padding-bottom:8px">Kosztorys</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin-top:14px;border-top:2px solid ${INK}">
      <tr><td style="padding:12px 0 4px;color:${MUTED};font-size:14px">Robocizna</td>
          <td style="padding:12px 0 4px;text-align:right;font-size:15px">${money(totals.labour)}</td></tr>
      ${totals.urgentFee ? `<tr><td style="padding:4px 0;color:${MUTED};font-size:14px">Dopłata za pilne</td>
          <td style="padding:4px 0;text-align:right;font-size:15px">${money(totals.urgentFee)}</td></tr>` : ''}
      ${totals.minimum && totals.labour < totals.minimum ? `<tr><td style="padding:4px 0;color:${MUTED};font-size:14px">Minimalna wizyta</td>
          <td style="padding:4px 0;text-align:right;font-size:15px">${money(totals.minimum)}</td></tr>` : ''}
      <tr><td style="padding:10px 0 0;font-size:17px;font-weight:600">Razem</td>
          <td style="padding:10px 0 0;text-align:right;font-size:24px;letter-spacing:-.02em;font-weight:600">${money(totals.total)}</td></tr>
    </table>
  `)}</td></tr>

  <tr><td align="center" style="padding:8px 0 4px">
    ${btn(`tel:${digits}`, 'Zadzwoń do klienta', MINT, INK)}
    ${digits ? '&nbsp;&nbsp;' + btn(`https://wa.me/${digits.replace(/\D/g, '')}`, 'WhatsApp', FOREST, '#ffffff') : ''}
  </td></tr>

  <tr><td align="center" style="padding:22px 10px 0;font-family:${FONT};color:#9a9a9a;font-size:12px;line-height:1.6">
    Wiadomość wysłana automatycznie z hawkfix.pl<br>
    ${esc(new Date().toISOString().replace('T', ' ').slice(0, 16))} UTC
  </td></tr>

</table></td></tr></table></body></html>`

  const text = [
    `HAWK.FIX — nowe zgłoszenie ${orderNo}`,
    row.urgent ? 'PILNE (+50%)' : '', '',
    `Razem: ${money(totals.total)}${totals.hours ? ` (ok. ${totals.hours} godz.)` : ''}`, '',
    `Imię: ${row.name}`,
    `Telefon: ${row.phone}`,
    row.email ? `E-mail: ${row.email}` : '',
    row.district ? `Dzielnica: ${row.district}` : '',
    row.address ? `Adres: ${row.address}` : '',
    row.when_date ? `Termin: ${row.when_date}${row.when_time ? ', ' + row.when_time : ''}` : '',
    row.comment ? `\nOpis: ${row.comment}` : '', '',
    'Kosztorys:',
    ...items.map((i) => `  - ${i.name} x${i.qty} = ${money(i.sum)}`),
    '', `Robocizna: ${money(totals.labour)}`,
    totals.urgentFee ? `Dopłata za pilne: ${money(totals.urgentFee)}` : '',
    `Razem: ${money(totals.total)}`,
  ].filter(Boolean).join('\n')

  return { html, text }
}

/** Подписи письма клиенту на его языке. */
const CLIENT_TEXT = {
  pl: {
    subject: (no: string) => `Zgłoszenie ${no} przyjęte — HAWK.FIX`,
    kicker: 'Zgłoszenie przyjęte',
    lead: 'Dziękujemy! Zgłoszenie jest w realizacji — odezwiemy się telefonicznie, żeby potwierdzić termin.',
    order: 'Numer zgłoszenia',
    estimate: 'Twój kosztorys',
    total: 'Razem',
    hours: 'ok. {h} godz.',
    urgent: 'Pilne · dopłata +50%',
    note: 'Cena z kosztorysu jest wiążąca dla prac z cennika. Jeśli na miejscu okaże się, że zakres jest inny, powiemy o tym przed rozpoczęciem pracy.',
    call: 'Zadzwoń do nas',
    keep: 'Zachowaj ten e-mail — numer zgłoszenia przyda się przy kontakcie.',
    auto: 'Wiadomość wysłana automatycznie z hawkfix.pl',
    noItems: 'Bez pozycji z cennika — wycenimy na podstawie opisu.',
    visit: 'Termin i adres', vDate: 'Kiedy', vTime: 'Okno przyjazdu', vAddr: 'Adres',
  },
  uk: {
    subject: (no: string) => `Заявка ${no} прийнята — HAWK.FIX`,
    kicker: 'Заявка прийнята',
    lead: 'Дякуємо! Заявка в роботі — зателефонуємо, щоб підтвердити час.',
    order: 'Номер заявки',
    estimate: 'Ваш кошторис',
    total: 'Разом',
    hours: 'бл. {h} год.',
    urgent: 'Терміново · +50%',
    note: 'Ціна з кошторису чинна для робіт із прайсу. Якщо на місці обсяг виявиться іншим, скажемо про це до початку роботи.',
    call: 'Зателефонувати нам',
    keep: 'Збережіть цей лист — номер заявки знадобиться при зверненні.',
    auto: 'Лист надіслано автоматично з hawkfix.pl',
    noItems: 'Без позицій із прайсу — порахуємо за описом.',
    visit: 'Час і адреса', vDate: 'Коли', vTime: 'Вікно приїзду', vAddr: 'Адреса',
  },
  ru: {
    subject: (no: string) => `Заявка ${no} принята — HAWK.FIX`,
    kicker: 'Заявка принята',
    lead: 'Спасибо! Заявка в работе — позвоним, чтобы подтвердить время.',
    order: 'Номер заявки',
    estimate: 'Ваша смета',
    total: 'Итого',
    hours: 'ок. {h} ч.',
    urgent: 'Срочно · +50%',
    note: 'Цена из сметы действует для работ из прайса. Если на месте объём окажется другим, скажем об этом до начала работы.',
    call: 'Позвонить нам',
    keep: 'Сохраните это письмо — номер заявки пригодится при обращении.',
    auto: 'Письмо отправлено автоматически с hawkfix.pl',
    noItems: 'Без позиций из прайса — посчитаем по описанию.',
    visit: 'Время и адрес', vDate: 'Когда', vTime: 'Окно приезда', vAddr: 'Адрес',
  },
  en: {
    subject: (no: string) => `Request ${no} received — HAWK.FIX`,
    kicker: 'Request received',
    lead: 'Thank you! Your request is in progress — we will call to confirm the time.',
    order: 'Request number',
    estimate: 'Your estimate',
    total: 'Total',
    hours: 'approx. {h} hrs',
    urgent: 'Urgent · +50%',
    note: 'The estimate holds for priced items. If the scope turns out different on site, we tell you before starting.',
    call: 'Call us',
    keep: 'Keep this e-mail — the request number helps when you get in touch.',
    auto: 'Sent automatically from hawkfix.pl',
    noItems: 'No priced items — we will quote from your description.',
    visit: 'Time and address', vDate: 'When', vTime: 'Arrival window', vAddr: 'Address',
  },
} as const

/** Письмо клиенту: подтверждение, что заявка принята и в работе.
 *  Тот же дизайн, что у письма владельцу, но без внутренних данных. */
function buildClientEmail(row: Record<string, unknown>, orderNo: string) {
  const L = CLIENT_TEXT[(row.locale as keyof typeof CLIENT_TEXT)] ?? CLIENT_TEXT.pl
  const items = (row.items as Item[]) ?? []
  const totals = (row.totals ?? {}) as Record<string, number>
  const money = (n: unknown) => (typeof n === 'number' ? `${Math.round(n)} zł` : '—')

  const INK = '#111312', MINT = '#6eefa0', FOREST = '#1a4a2e'
  const PAPER = '#f1f1ef', GREY = '#e9e9e9', MUTED = '#6b6b6b'
  const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

  const rows = items.length
    ? items.map((i, n) =>
        `<tr>
           <td style="padding:11px 0;border-top:${n ? `1px solid ${GREY}` : '0'};font-family:${FONT};font-size:15px;color:${INK}">${esc(i.name)}</td>
           <td style="padding:11px 8px;border-top:${n ? `1px solid ${GREY}` : '0'};font-size:14px;color:${MUTED};text-align:center;white-space:nowrap">×${esc(i.qty)}</td>
           <td style="padding:11px 0;border-top:${n ? `1px solid ${GREY}` : '0'};font-size:15px;color:${INK};text-align:right;white-space:nowrap">${money(i.sum)}</td>
         </tr>`).join('')
    : `<tr><td style="padding:11px 0;color:${MUTED};font-size:15px;font-family:${FONT}">${L.noItems}</td></tr>`

  const html = `<!doctype html>
<html lang="${esc(row.locale)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>${esc(orderNo)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};font-family:${FONT};color:${INK};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${L.lead}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER}">
<tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;font-family:${FONT}">

  <tr><td style="padding-bottom:16px;font-family:${FONT};font-size:19px;font-weight:600;letter-spacing:-.02em;color:${INK}">
    HAWK<span style="color:${FOREST}">.</span>FIX
  </td></tr>

  <tr><td>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${INK};border-radius:24px;margin-bottom:12px">
      <tr><td style="padding:30px 28px;font-family:${FONT}">
        <div style="font-size:14px;color:#8c8c8c;padding-bottom:6px">${L.kicker}</div>
        <div style="font-family:${FONT};font-size:42px;line-height:1.05;letter-spacing:-.035em;color:#ffffff">${esc(orderNo)}</div>
        <div style="margin-top:14px;font-size:15px;line-height:1.55;color:#d4d7d5">${L.lead}</div>
        ${row.urgent ? `<div style="margin-top:14px"><span style="display:inline-block;background:${MINT};color:${INK};
             border-radius:999px;padding:7px 16px;font-size:13px;font-weight:600">${L.urgent}</span></div>` : ''}
      </td></tr>
    </table>
  </td></tr>

  <tr><td>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${MINT};border-radius:20px;margin-bottom:12px">
      <tr>
        <td style="padding:22px 28px;font-family:${FONT}">
          <div style="font-size:14px;color:rgba(17,19,18,.65)">${L.total}</div>
          <div style="font-family:${FONT};font-size:38px;line-height:1.05;letter-spacing:-.035em;color:${INK}">${money(totals.total)}</div>
        </td>
        ${totals.hours ? `<td align="right" style="padding:22px 28px;font-family:${FONT};font-size:14px;color:rgba(17,19,18,.65);white-space:nowrap">
          ${esc(L.hours.replace('{h}', String(totals.hours)))}</td>` : ''}
      </tr>
    </table>
  </td></tr>

  <tr><td>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#ffffff;border-radius:20px;margin-bottom:12px">
      <tr><td style="padding:24px 28px;font-family:${FONT}">
        <div style="font-family:${FONT};font-size:22px;letter-spacing:-.02em;color:${INK};padding-bottom:8px">${L.estimate}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="margin-top:14px;border-top:2px solid ${INK}">
          <tr><td style="padding:10px 0 0;font-size:17px;font-weight:600;font-family:${FONT}">${L.total}</td>
              <td style="padding:10px 0 0;text-align:right;font-size:24px;letter-spacing:-.02em;font-weight:600;font-family:${FONT}">${money(totals.total)}</td></tr>
        </table>
        <div style="margin-top:16px;padding:16px 18px;background:${PAPER};border-radius:14px;
             font-family:${FONT};font-size:14px;line-height:1.55;color:${MUTED}">${L.note}</div>
      </td></tr>
    </table>
  </td></tr>

  ${(row.when_date || row.address) ? `<tr><td>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#ffffff;border-radius:20px;margin-bottom:12px">
      <tr><td style="padding:24px 28px;font-family:${FONT}">
        <div style="font-family:${FONT};font-size:22px;letter-spacing:-.02em;color:${INK};padding-bottom:8px">${L.visit}</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          ${row.when_date ? `<tr><td style="padding:7px 16px 7px 0;font-family:${FONT};color:${MUTED};font-size:14px;white-space:nowrap">${L.vDate}</td>
            <td style="padding:7px 0;font-family:${FONT};font-size:16px;font-weight:600;color:${INK}">${esc(row.when_date)}</td></tr>` : ''}
          ${row.when_time ? `<tr><td style="padding:7px 16px 7px 0;font-family:${FONT};color:${MUTED};font-size:14px;white-space:nowrap">${L.vTime}</td>
            <td style="padding:7px 0;font-family:${FONT};font-size:16px;font-weight:600;color:${INK}">${esc(row.when_time)}</td></tr>` : ''}
          ${row.address ? `<tr><td style="padding:7px 16px 7px 0;font-family:${FONT};color:${MUTED};font-size:14px;white-space:nowrap">${L.vAddr}</td>
            <td style="padding:7px 0;font-family:${FONT};font-size:16px;color:${INK}">${esc(row.address)}</td></tr>` : ''}
        </table>
      </td></tr>
    </table>
  </td></tr>` : ''}

  <tr><td align="center" style="padding:8px 0 4px">
    <a href="tel:+48532481505" style="display:inline-block;background:${MINT};color:${INK};text-decoration:none;
       padding:14px 26px;border-radius:999px;font-size:15px;font-weight:600;font-family:${FONT}">${L.call} · +48 532 481 505</a>
  </td></tr>

  <tr><td align="center" style="padding:22px 10px 0;font-family:${FONT};color:#9a9a9a;font-size:12px;line-height:1.6">
    ${L.keep}<br>${L.auto}
  </td></tr>

</table></td></tr></table></body></html>`

  const text = [
    `HAWK.FIX — ${L.kicker}: ${orderNo}`, '',
    L.lead, '',
    `${L.total}: ${money(totals.total)}`,
    ...items.map((i) => `  - ${i.name} x${i.qty} = ${money(i.sum)}`),
    row.when_date ? `\n${L.vDate}: ${row.when_date}${row.when_time ? `, ${row.when_time}` : ''}` : '',
    row.address ? `${L.vAddr}: ${row.address}` : '',
    '', L.note, '', '+48 532 481 505 · hawkfix.pl',
  ].filter(Boolean).join('\n')

  return { subject: L.subject(orderNo), html, text }
}

/** Подтверждение клиенту — только если он оставил почту. Ошибку не роняем:
 *  заявка уже в базе и владельцу уже ушла. */
async function notifyClient(row: Record<string, unknown>, orderNo: string): Promise<string | null> {
  const to = typeof row.email === 'string' ? row.email.trim() : ''
  if (!to) return null
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return 'client: RESEND_API_KEY не задан'
  const { subject, html, text } = buildClientEmail(row, orderNo)
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, html, text, reply_to: [MAIL_TO] }),
    })
    if (!res.ok) return `client resend ${res.status}: ${(await res.text()).slice(0, 200)}`
    return null
  } catch (e) {
    return `client resend fetch: ${String(e).slice(0, 200)}`
  }
}

/** Отправка письма владельцу. Ошибку не пробрасываем: заявка уже в базе,
 *  терять её из-за недоступного почтового сервиса нельзя. */
async function notify(row: Record<string, unknown>, orderNo: string): Promise<string | null> {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return 'RESEND_API_KEY не задан'
  const { html, text } = buildEmail(row, orderNo)
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [MAIL_TO],
        subject: [
          orderNo,
          (row.urgent ? 'PILNE' : ''),
          String(row.name ?? ''),
          typeof (row.totals as Record<string, number>)?.total === 'number'
            ? `${Math.round((row.totals as Record<string, number>).total)} zł` : '',
        ].filter(Boolean).join(' · '),
        html, text,
        // Ответ уйдёт клиенту, если он оставил почту
        ...(row.email ? { reply_to: [row.email as string] } : {}),
      }),
    })
    if (!res.ok) return `resend ${res.status}: ${(await res.text()).slice(0, 300)}`
    return null
  } catch (e) {
    return `resend fetch: ${String(e).slice(0, 300)}`
  }
}

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) },
  })

/** Проверка токена Cloudflare Turnstile. Включается, когда задан секрет. */
async function turnstileOk(token: string | undefined, ip: string | null): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET')
  if (!secret) return true               // защита выключена — пропускаем
  if (!token) return false
  const form = new FormData()
  form.append('secret', secret)
  form.append('response', token)
  if (ip) form.append('remoteip', ip)
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body: form,
  })
  const out = await res.json().catch(() => ({ success: false }))
  return Boolean(out.success)
}

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s.slice(0, max) : null
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_json' }, 400, origin)
  }

  // Ловушка для ботов: поле скрыто в вёрстке, человек его не заполнит
  if (str(body.company, 200)) return json({ ok: true }, 200, origin)

  const contact = (body.contact ?? {}) as Record<string, unknown>
  const place = (body.place ?? {}) as Record<string, unknown>

  const name = str(contact.name, 200)
  const phoneRaw = str(contact.phone, 40)
  const digits = phoneRaw ? phoneRaw.replace(/\D/g, '') : ''
  if (!name || digits.length < 9) return json({ error: 'name_or_phone' }, 422, origin)

  const items = Array.isArray(body.items) ? body.items.slice(0, 120) : []
  const comment = str(body.comment, 4000)
  if (items.length === 0 && !comment) return json({ error: 'empty_request' }, 422, origin)

  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')
  if (!(await turnstileOk(str(body.turnstile, 4000) ?? undefined, ip))) {
    return json({ error: 'captcha' }, 403, origin)
  }

  const locale = LOCALES.includes(String(body.locale)) ? String(body.locale) : 'pl'
  const whenRaw = str(body.when, 20)
  const when = whenRaw && /^\d{4}-\d{2}-\d{2}$/.test(whenRaw) ? whenRaw : null
  // Окно приезда приходит строкой «10:00-12:00»; без даты оно бессмысленно
  const timeRaw = str(body.whenTime, 20)
  const whenTime = when && timeRaw && /^\d{2}:\d{2}\s?[-–]\s?\d{2}:\d{2}$/.test(timeRaw) ? timeRaw : null

  const row = {
    locale,
    name,
    phone: phoneRaw,
    email: str(contact.email, 320),
    district: str(place.district, 120),
    address: str(place.address, 300),
    when_date: when,
    when_time: whenTime,
    comment,
    urgent: Boolean(body.urgent),
    items,
    totals: (body.totals ?? {}) as Record<string, unknown>,
    page: str(body.page, 300),
    user_agent: (req.headers.get('user-agent') ?? '').slice(0, 400),
  }

  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return json({ error: 'not_configured' }, 500, origin)

  const res = await fetch(`${url}/rest/v1/leads`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  })

  if (!res.ok) {
    console.error('insert failed', res.status, await res.text())
    return json({ error: 'store_failed' }, 500, origin)
  }

  const [saved] = await res.json()
  const orderNo = saved?.order_no ?? ''

  // Письмо шлём после сохранения: если почта отвалится, заявка не потеряется —
  // причина осядет в notify_error, и её будет видно в админке.
  const full = { ...row, ...saved }
  const [ownerError, clientError] = await Promise.all([
    notify(full, orderNo),
    notifyClient(full, orderNo),
  ])
  const mailError = [ownerError, clientError].filter(Boolean).join(' | ') || null
  if (saved?.id) {
    await fetch(`${url}/rest/v1/leads?id=eq.${saved.id}`, {
      method: 'PATCH',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(mailError ? { notify_error: mailError } : { notified_at: new Date().toISOString() }),
    }).catch(() => {})
  }
  if (mailError) console.error('mail failed', mailError)

  return json({ ok: true, id: saved?.id, orderNo }, 200, origin)
})
