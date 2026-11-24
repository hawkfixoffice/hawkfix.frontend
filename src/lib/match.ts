import type { Group, Locale, PriceItem } from './types'
import { nameOf } from './price'

/** Поиск работ по тому, как человек описывает проблему своими словами.
 *
 *  Поиск калькулятора ищет подстроку целиком — «kran» найдёт, а «cieknie
 *  kran w łazience» уже нет. Здесь фраза режется на слова, и позиция
 *  набирает очки из трёх источников:
 *   1. разговорные корни (`SYN`) — люди пишут «kran», «gniazdko», «засор»,
 *      а позиции называются «Wymiana lub montaż baterii», «Udrożnienie
 *      odpływu»: без словаря таких совпадений нет вовсе;
 *   2. слова названия позиции на языке страницы (с обрезанным окончанием);
 *   3. слова группы (`group-words.json` — тексты страниц услуг), слабо.
 *  Комнаты и общие слова («kuchnia», «не работает») не считаются: иначе
 *  «течёт кран на кухне» находил «уборку кухни». Остаются позиции не хуже
 *  половины лучшей. Ничего не нашлось — работы нет в прайсе, текст уходит
 *  описанием. */

/** Корни слов, которые ничего не говорят о работе (сравнение по началу слова) */
const STOP = [
  // pl
  'się', 'jest', 'mam', 'mnie', 'trzeb', 'potrzeb', 'chcę', 'chce', 'proszę', 'dzień', 'dobry', 'albo', 'oraz', 'przy', 'pod', 'nad', 'bardzo',
  'nie', 'działa', 'dzial', 'zepsu', 'kuchn', 'łazien', 'lazien', 'pokoj', 'pokój', 'mieszk', 'domu', 'ikea', 'ikei', 'nowy', 'nowa', 'nowe', 'stary', 'stare', 'jak', 'coś', 'cos', 'dziwn',
  'wymian', 'wymien', 'wymień', 'napraw', 'montaż', 'montaz', 'zamont', 'podłącz', 'podlacz', 'zrobi',
  // ru / uk
  'нужн', 'надо', 'треба', 'потріб', 'хочу', 'есть', 'меня', 'мене', 'очень', 'дуже', 'добр', 'день', 'или', 'або', 'кухн', 'ванн', 'комнат', 'кімнат', 'кварт', 'дом', 'не', 'работ', 'працю', 'сломал', 'злам', 'новы', 'нови', 'стар', 'что', 'щось', 'что-то', 'поменя', 'замен', 'замін', 'почин', 'полаг', 'установ', 'встанов', 'монтаж', 'підключ', 'подключ',
  // en
  'need', 'want', 'have', 'there', 'please', 'with', 'from', 'that', 'this', 'help', 'kitchen', 'bathroom', 'bedroom', 'living', 'room', 'flat', 'apartment', 'house', 'not', 'work', 'broke', 'new', 'old', 'some', 'odd', 'the', 'and', 'my', 'replac', 'fix', 'repair', 'install', 'change', 'fitting',
]
const isStop = (w: string) => STOP.some((s) => w === s || (s.length >= 4 && w.startsWith(s)))

/** Разговорные корни → позиция прайса. Корень совпадает с началом слова. */
const SYN: Record<string, string[]> = {
  tap: ['kran', 'bateri', 'кран', 'змішув', 'смесит', 'tap', 'faucet', 'mixer'],
  siphon: ['syfon', 'сифон', 'siphon', 'trap'],
  drain: ['zatka', 'zapcha', 'odpływ', 'odplyw', 'udrożn', 'засор', 'засмі', 'забил', 'забив', 'drain', 'block', 'clog'],
  cistern: ['spłuczk', 'splucz', 'rezerwuar', 'бачок', 'бачк', 'cistern', 'flush'],
  toilet: ['sedes', 'toalet', 'kibel', 'унитаз', 'унітаз', 'toilet', 'wc'],
  basin: ['umywalk', 'раковин', 'умивальн', 'basin', 'sink'],
  'washer-hookup': ['pralk', 'стиральн', 'пральн', 'washing', 'washer'],
  'dishwasher-hookup': ['zmywar', 'посудомо', 'dishwash'],
  hoses: ['wężyk', 'wezyk', 'шланг', 'hose'],
  silicone: ['silikon', 'fug', 'силикон', 'силікон', 'герметик', 'sealant', 'caulk', 'grout'],
  bulb: ['żarów', 'żarow', 'zarow', 'лампоч', 'лампочк', 'bulb', 'halogen', 'światł', 'swiatl', 'свет', 'світл', 'light'],
  'lamp-repair': ['lamp', 'ламп', 'żyrandol', 'zyrandol', 'люстр', 'світильн', 'светильн', 'światł', 'свет', 'світл', 'light'],
  socket: ['gniazd', 'розет', 'socket', 'outlet', 'plug'],
  switch: ['włącznik', 'wlacznik', 'wyłącznik', 'выключат', 'вимикач', 'switch'],
  chandelier: ['żyrandol', 'zyrandol', 'люстр', 'chandelier', 'lamp', 'ламп'],
  rcd: ['bezpiecz', 'korki', 'różnic', 'roznic', 'автомат', 'пробк', 'запобіж', 'fuse', 'breaker', 'trip'],
  diagnostics: ['prąd', 'prad', 'zwarc', 'iskrz', 'ток', 'струм', 'замык', 'замик', 'искрит', 'іскрит', 'spark', 'short', 'power', 'electric', 'elektry', 'электр', 'електр'],
  'tv-mount': ['telewiz', 'tv', 'телевиз', 'телевіз', 'телик', 'television'],
  picture: ['obraz', 'lustr', 'картин', 'зеркал', 'дзеркал', 'picture', 'mirror', 'frame', 'painting'],
  'mirror-glue': ['lustr', 'зеркал', 'дзеркал', 'mirror'],
  shelf: ['półk', 'polk', 'полк', 'полиц', 'shelf', 'shelv'],
  'curtain-rail': ['karnisz', 'firan', 'zasłon', 'zaslon', 'карниз', 'штор', 'curtain'],
  blind: ['rolet', 'żaluz', 'zaluz', 'рулонн', 'жалюз', 'blind'],
  hooks: ['wieszak', 'haczyk', 'крючк', 'гачк', 'вешалк', 'hook', 'hanger'],
  'assembly-small': ['mebl', 'komod', 'stolik', 'biurk', 'krzes', 'мебел', 'меблі', 'комод', 'стол', 'стіл', 'тумб', 'furnitur', 'desk', 'chair', 'table', 'dresser'],
  'assembly-bed': ['łóżk', 'lozk', 'кроват', 'ліжк', 'bed'],
  'assembly-wardrobe': ['szaf', 'шкаф', 'шаф', 'wardrobe', 'closet'],
  hinge: ['zawias', 'петл', 'петел', 'hinge'],
  drawer: ['szuflad', 'ящик', 'шухляд', 'drawer'],
  handle: ['klamk', 'ручк', 'handle'],
  'lock-cylinder': ['wkładk', 'wkladk', 'личинк', 'cylinder'],
  'lock-door': ['zamek', 'zamk', 'замок', 'замк', 'lock'],
  'door-adjust': ['drzwi', 'двер', 'door', 'skrzyp', 'скрип', 'squeak', 'domyk', 'закрыва', 'зачиня'],
  'window-adjust': ['okn', 'окн', 'вікн', 'вікон', 'window'],
  'window-seal': ['uszczel', 'уплотн', 'ущільн', 'seal'],
  'bathroom-fan': ['wentyl', 'вентил', 'fan'],
  oven: ['piekarn', 'духовк', 'oven'],
  'hob-install': ['płyta', 'płytę', 'plyta', 'indukc', 'плита', 'плиту', 'индукц', 'індукц', 'hob', 'cooktop'],
  hood: ['okap', 'вытяжк', 'витяжк', 'hood'],
  'water-filter': ['filtr', 'фильтр', 'фільтр', 'filter'],
  'paint-wall': ['malow', 'pomal', 'farb', 'ścian', 'scian', 'покрас', 'фарб', 'пофарб', 'стен', 'стін', 'paint'],
  'paint-ceiling': ['sufit', 'потол', 'стел', 'ceiling'],
  patch: ['dziur', 'pęknię', 'peknie', 'rysa', 'дыр', 'дір', 'трещ', 'тріщ', 'hole', 'crack'],
  'mold-biocide': ['pleśń', 'plesn', 'grzyb', 'плесен', 'плісняв', 'грибок', 'mould', 'mold'],
  'laminate-m2': ['panel', 'laminat', 'ламинат', 'ламінат', 'laminate', 'floor'],
  'skirting-m': ['listw', 'плинтус', 'плінтус', 'skirting'],
  'cleaning-light': ['sprząt', 'sprzat', 'posprz', 'убор', 'прибир', 'clean'],
  ironing: ['prasow', 'глаж', 'прасув', 'iron'],
  'move-hour': ['przeprow', 'переезд', 'переїзд', 'перевез', 'move', 'moving', 'removal'],
  'heavy-item': ['pianin', 'sejf', 'пианин', 'піаніно', 'сейф', 'piano', 'safe'],
  'disposal-run': ['wywóz', 'wywoz', 'wywiez', 'gruz', 'śmiec', 'smiec', 'вывез', 'вывоз', 'вивез', 'вивіз', 'мусор', 'сміт', 'rubbish', 'junk', 'dispos'],
  'lawn-mow': ['kosić', 'kosic', 'koszen', 'skos', 'trawn', 'trawa', 'traw', 'газон', 'трав', 'покос', 'lawn', 'grass', 'mow'],
  'hedge-trim': ['żywopł', 'zywopl', 'изгород', 'живопліт', 'hedge'],
  'tree-cut': ['drzew', 'дерев', 'tree'],
  'repot-small': ['przesad', 'doniczk', 'roślin', 'roslin', 'пересад', 'горшк', 'вазон', 'растен', 'рослин', 'repot', 'plant'],
  'reno-light': ['remont', 'ремонт', 'renovat', 'refurb'],
  'moveout-check': ['kaucj', 'zdanie', 'залог', 'застав', 'deposit'],
}

const rawWords = (s: string, locale: Locale) =>
  s.toLocaleLowerCase(locale).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2 && !isStop(w))

/** Основа слова: длинные теряют окончание, короткие остаются как есть */
const stem = (w: string) => (w.length <= 4 ? w : w.slice(0, Math.max(4, Math.min(6, w.length - 2))))

export function matchItems(
  query: string, items: PriceItem[], groups: Group[], groupWords: Record<string, Partial<Record<Locale, string>>>,
  locale: Locale, limit = 6,
): PriceItem[] {
  const ws = [...new Set(rawWords(query, locale))]
  if (!ws.length) return []
  const stems = [...new Set(ws.filter((w) => w.length >= 3).map(stem))]
  const groupName = new Map(groups.map((g) => [g.key, (g.name[locale] ?? '').toLocaleLowerCase(locale)]))

  const scored: { i: PriceItem; s: number }[] = []
  for (const i of items) {
    if (!i.price && i.ptype !== 'scope') continue
    let s = 0
    const syn = SYN[i.key]
    if (syn) for (const w of ws) if (syn.some((r) => w.startsWith(r))) s += 15
    const nameWords = rawWords(nameOf(i, locale), locale)
    const gText = `${groupName.get(i.group) ?? ''} ${groupWords[i.group]?.[locale] ?? ''}`
    for (const st of stems) {
      if (nameWords.some((w) => w.startsWith(st))) s += 10
      else if (st.length >= 4 && gText.includes(st)) s += 2
    }
    if (s > 0) scored.push({ i, s })
  }
  scored.sort((a, b) => b.s - a.s)
  const top = scored[0]?.s ?? 0
  return scored.filter((x) => x.s >= top / 2).slice(0, limit).map((x) => x.i)
}

/** Похоже на поиск («kran», «gniazdko»), а не на описание: короткая строка */
export const looksLikeSearch = (s: string) => s.trim().split(/\s+/).filter(Boolean).length <= 2
