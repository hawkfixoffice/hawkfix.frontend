#!/usr/bin/env python3
"""Карта ключевых запросов: content/keywords.json.

Польские синонимы курированы вручную (это язык основного рынка).
Для uk/ru/en запросы собираются из лексики самой страницы на этом языке
плюс город и коммерческие модификаторы — чтобы не выдумывать переводы.

Ключи используются в schema.org `keywords`, в alt-текстах и в мета-теге.
"""
import json, pathlib, re

HERE = pathlib.Path(__file__).resolve().parent
C = HERE.parent / "content"
LOCALES = ["pl", "uk", "ru", "en"]

CITY = {"pl": "Warszawa", "uk": "Варшава", "ru": "Варшава", "en": "Warsaw"}
# Коммерческие модификаторы: как люди дописывают запрос
INTENT = {
    "pl": ["cena", "cennik", "od ręki"],
    "uk": ["ціна", "ціни", "терміново"],
    "ru": ["цена", "цены", "срочно"],
    "en": ["price", "cost", "near me"],
}
# Общие для рынка «золотой ручки» — добавляем на главную и хаб услуг
CORE = {
    "pl": ["złota rączka Warszawa", "mąż na godzinę Warszawa", "fachowiec Warszawa",
           "naprawy domowe Warszawa", "usterki w mieszkaniu", "drobne naprawy Warszawa"],
    "uk": ["майстер на годину Варшава", "чоловік на годину Варшава", "дрібний ремонт Варшава",
           "ремонт квартири Варшава", "майстер Варшава"],
    "ru": ["мастер на час Варшава", "муж на час Варшава", "мелкий ремонт Варшава",
           "ремонт квартиры Варшава", "мастер Варшава"],
    "en": ["handyman Warsaw", "home repairs Warsaw", "odd jobs Warsaw", "handyman services Warsaw"],
}

# Польские синонимы по услугам — головные запросы ниши
PL = {
  "uslugi-hydraulik": ["hydraulik Warszawa", "naprawa kranu", "wymiana baterii", "usterka hydrauliczna", "hydraulik na dziś"],
  "uslugi-udraznianie-rur": ["udrażnianie rur Warszawa", "zapchany odpływ", "przepychanie rur", "zapchana zlewozmywak", "udrażnianie kanalizacji"],
  "uslugi-elektryk": ["elektryk Warszawa", "wymiana gniazdka", "montaż żyrandola", "drobne prace elektryczne", "usterka elektryczna"],
  "uslugi-montaz-mebli": ["montaż mebli Warszawa", "składanie mebli IKEA", "monter mebli", "montaż szafy", "skręcanie mebli"],
  "uslugi-naprawa-mebli": ["naprawa mebli Warszawa", "wymiana zawiasów", "naprawa szuflady", "naprawa szafy przesuwnej"],
  "uslugi-demontaz-i-montaz-mebli": ["demontaż mebli", "rozkręcanie mebli", "montaż mebli przy przeprowadzce"],
  "uslugi-wywoz-starych-mebli": ["wywóz mebli Warszawa", "wywóz gabarytów", "utylizacja mebli", "opróżnianie mieszkań"],
  "uslugi-wiercenie-i-wieszanie": ["wiercenie w ścianie", "powieszenie obrazu", "montaż półki", "powieszenie lustra"],
  "uslugi-montaz-telewizora": ["montaż telewizora na ścianie", "zawieszenie telewizora", "montaż uchwytu TV"],
  "uslugi-drzwi-okna-zamki": ["wymiana zamka Warszawa", "regulacja drzwi", "wymiana klamki", "regulacja okien"],
  "uslugi-montaz-agd": ["montaż AGD Warszawa", "podłączenie zmywarki", "zabudowa piekarnika", "montaż okapu"],
  "uslugi-lazienka-silikon": ["wymiana silikonu", "silikon w łazience", "uszczelnienie wanny"],
  "uslugi-wentylacja-lazienka": ["montaż wentylatora łazienkowego", "wentylacja w łazience"],
  "uslugi-drobne-naprawy": ["drobne naprawy w domu", "mąż na godzinę", "złota rączka", "usterki w mieszkaniu"],
  "uslugi-panele-podlogowe-listwy": ["układanie paneli podłogowych", "montaż listew przypodłogowych", "montaż progów"],
  "uslugi-sciany-malowanie": ["malowanie mieszkania Warszawa", "malowanie ścian cena", "szpachlowanie ścian", "naprawa ściany"],
  "uslugi-karnisze-rolety-zaluzje": ["montaż karnisza", "montaż rolet", "montaż żaluzji"],
  "uslugi-awaria-tego-samego-dnia": ["awaria dziś Warszawa", "pilna naprawa", "usterka na już", "ekipa na dziś"],
  "uslugi-sprzatanie-mieszkan": ["sprzątanie mieszkań Warszawa", "sprzątanie domów", "sprzątanie generalne"],
  "uslugi-sprzatanie-pod-zwrot-kaucji": ["sprzątanie pod zwrot kaucji", "sprzątanie przed zdaniem mieszkania"],
  "uslugi-sprzatanie-po-remoncie": ["sprzątanie po remoncie Warszawa", "usuwanie pyłu budowlanego"],
  "uslugi-mycie-okien": ["mycie okien Warszawa", "mycie okien cena"],
  "uslugi-przesadzanie-roslin": ["przesadzanie roślin", "opieka nad roślinami", "podlewanie pod nieobecność"],
  "uslugi-przeprowadzki-warszawa": ["przeprowadzki Warszawa", "transport mebli", "bus z kierowcą"],
  "uslugi-przeprowadzki-po-polsce": ["przeprowadzki po Polsce", "przeprowadzka międzymiastowa", "transport mebli na trasie"],
  "uslugi-ogrod-i-dzialka": ["prace w ogrodzie", "koszenie trawnika", "przycinanie żywopłotu", "wycinka drzewa"],
  "uslugi-remont-kosmetyczny": ["remont kosmetyczny Warszawa", "odświeżenie mieszkania", "remont mieszkania cena"],
  "home": CORE["pl"] + ["hydraulik i elektryk Warszawa", "usługi remontowe Warszawa"],
  "uslugi": ["usługi złotej rączki", "naprawy w mieszkaniu Warszawa", "montaż i naprawy Warszawa"],
  "cennik": ["cennik złotej rączki", "ile kosztuje hydraulik Warszawa", "ceny drobnych napraw"],
  "o-nas": ["złota rączka Warszawa opinie", "ekipa remontowa Warszawa", "firma od napraw Warszawa"],
  "kontakt": ["złota rączka kontakt", "hydraulik Warszawa telefon", "wezwać fachowca Warszawa"],
}

# Синонимы для uk / ru / en. Курированы, а не собраны из текста:
# слова из врезки давали мусор вроде «течёт Варшава».
LOC = {
  "uslugi-hydraulik": {
    "uk": ["сантехнік Варшава", "заміна змішувача", "ремонт бачка", "підключення пральної машини"],
    "ru": ["сантехник Варшава", "замена смесителя", "ремонт бачка", "подключение стиральной машины"],
    "en": ["plumber Warsaw", "tap replacement", "washing machine connection"]},
  "uslugi-udraznianie-rur": {
    "uk": ["прочищення труб Варшава", "засмітився злив", "прочищення каналізації"],
    "ru": ["прочистка труб Варшава", "засорился слив", "прочистка канализации"],
    "en": ["drain unblocking Warsaw", "blocked drain", "clogged sink"]},
  "uslugi-elektryk": {
    "uk": ["електрик Варшава", "заміна розетки", "монтаж люстри"],
    "ru": ["электрик Варшава", "замена розетки", "монтаж люстры"],
    "en": ["electrician Warsaw", "socket replacement", "light fitting installation"]},
  "uslugi-montaz-mebli": {
    "uk": ["збірка меблів Варшава", "збірка меблів IKEA", "складання шафи"],
    "ru": ["сборка мебели Варшава", "сборка мебели IKEA", "сборка шкафа"],
    "en": ["furniture assembly Warsaw", "IKEA furniture assembly", "flat pack assembly"]},
  "uslugi-naprawa-mebli": {
    "uk": ["ремонт меблів Варшава", "заміна завіс", "ремонт шухляди"],
    "ru": ["ремонт мебели Варшава", "замена петель", "ремонт ящика"],
    "en": ["furniture repair Warsaw", "hinge replacement", "drawer repair"]},
  "uslugi-wywoz-starych-mebli": {
    "uk": ["вивезення меблів Варшава", "утилізація меблів"],
    "ru": ["вывоз мебели Варшава", "утилизация мебели"],
    "en": ["furniture removal Warsaw", "bulky waste disposal"]},
  "uslugi-wiercenie-i-wieszanie": {
    "uk": ["свердління стіни", "повісити картину", "монтаж полиці"],
    "ru": ["сверление стены", "повесить картину", "монтаж полки"],
    "en": ["wall drilling Warsaw", "hang a picture", "shelf mounting"]},
  "uslugi-montaz-telewizora": {
    "uk": ["монтаж телевізора на стіну", "повісити телевізор"],
    "ru": ["монтаж телевизора на стену", "повесить телевизор"],
    "en": ["TV wall mounting Warsaw", "TV bracket installation"]},
  "uslugi-drzwi-okna-zamki": {
    "uk": ["заміна замка Варшава", "регулювання дверей", "заміна ручки"],
    "ru": ["замена замка Варшава", "регулировка дверей", "замена ручки"],
    "en": ["lock replacement Warsaw", "door adjustment"]},
  "uslugi-montaz-agd": {
    "uk": ["підключення посудомийки", "встановлення духовки", "монтаж витяжки"],
    "ru": ["подключение посудомойки", "установка духовки", "монтаж вытяжки"],
    "en": ["appliance installation Warsaw", "dishwasher connection", "oven fitting"]},
  "uslugi-sciany-malowanie": {
    "uk": ["фарбування квартири Варшава", "шпаклювання стін", "ремонт стіни"],
    "ru": ["покраска квартиры Варшава", "шпаклевка стен", "ремонт стены"],
    "en": ["wall painting Warsaw", "wall repair", "plastering"]},
  "uslugi-sprzatanie-mieszkan": {
    "uk": ["прибирання квартир Варшава", "генеральне прибирання"],
    "ru": ["уборка квартир Варшава", "генеральная уборка"],
    "en": ["flat cleaning Warsaw", "deep cleaning"]},
  "uslugi-sprzatanie-po-remoncie": {
    "uk": ["прибирання після ремонту Варшава"],
    "ru": ["уборка после ремонта Варшава"],
    "en": ["after renovation cleaning Warsaw"]},
  "uslugi-przeprowadzki-warszawa": {
    "uk": ["переїзд Варшава", "перевезення меблів", "бус з водієм"],
    "ru": ["переезд Варшава", "перевозка мебели", "бус с водителем"],
    "en": ["moving Warsaw", "furniture transport", "man with a van"]},
  "uslugi-remont-kosmetyczny": {
    "uk": ["косметичний ремонт Варшава", "освіження квартири"],
    "ru": ["косметический ремонт Варшава", "освежение квартиры"],
    "en": ["flat refurbishment Warsaw", "cosmetic renovation"]},
  "uslugi-awaria-tego-samego-dnia": {
    "uk": ["аварія сьогодні Варшава", "терміновий ремонт"],
    "ru": ["авария сегодня Варшава", "срочный ремонт"],
    "en": ["same day emergency Warsaw", "urgent repair"]},
  "cennik": {
    "uk": ["ціни на дрібний ремонт Варшава", "скільки коштує сантехнік"],
    "ru": ["цены на мелкий ремонт Варшава", "сколько стоит сантехник"],
    "en": ["handyman prices Warsaw", "repair cost Warsaw"]},
  "o-nas": {
    "uk": ["майстер на годину Варшава відгуки", "бригада ремонту Варшава", "власна бригада"],
    "ru": ["мастер на час Варшава отзывы", "бригада ремонта Варшава", "своя бригада"],
    "en": ["handyman Warsaw about", "own crew not call centre"]},
  "kontakt": {
    "uk": ["майстер Варшава телефон", "викликати майстра"],
    "ru": ["мастер Варшава телефон", "вызвать мастера"],
    "en": ["handyman Warsaw contact", "book a handyman"]},
}

index = json.loads((C / "index.json").read_text(encoding="utf-8"))
result: dict[str, dict[str, list[str]]] = {}

for page in index:
    key = page["key"]
    result[key] = {}
    for loc in LOCALES:
        tr = page["tr"].get(loc)
        if not tr:
            continue
        kws: list[str] = []
        h1 = tr["h1"].split(" — ")[0].strip()
        city = CITY[loc]

        if loc == "pl":
            kws += PL.get(key, [])
        else:
            kws += LOC.get(key, {}).get(loc, [])
            if page["type"] in ("home", "services"):
                kws += CORE[loc]
            # Заголовок как запрос берём только у услуг: у главной он вопрос
            # («Co się zepsuło?»), запросом такое не бывает.
            if page["type"] == "service":
                kws.append(f"{h1} {city}")
                kws.append(h1)

        if page["type"] == "service":
            kws.append(f"{h1} {INTENT[loc][0]}")

        seen, clean = set(), []
        for k in kws:
            k = re.sub(r"\s+", " ", k).strip()
            low = k.lower()
            if k and low not in seen:
                seen.add(low)
                clean.append(k)
        result[key][loc] = clean[:12]

(C / "keywords.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
total = sum(len(v) for p in result.values() for v in p.values())
print(f"keywords.json: {len(result)} страниц, {total} запросов")
print("\nпример — главная (PL):"); [print("  ·", k) for k in result["home"]["pl"]]
print("\nпример — сантехника (RU):"); [print("  ·", k) for k in result["uslugi-hydraulik"]["ru"]]
