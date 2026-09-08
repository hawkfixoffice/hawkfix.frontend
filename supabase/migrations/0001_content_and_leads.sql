-- HAWK.FIX — схема контента и заявок.
-- Контент читается публично (сайт статический, но админка и превью читают напрямую).
-- Заявки не читает и не пишет никто, кроме edge-функции на service-ключе.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- языки
create table if not exists public.locales (
  code        text primary key,                       -- pl / uk / ru / en
  hreflang    text not null,                          -- pl-PL / uk-UA / ru / en
  og_locale   text not null,
  title       text not null,
  is_default  boolean not null default false,
  sort        smallint not null default 0
);

-- ---------------------------------------------------------------- страницы
create table if not exists public.pages (
  key        text primary key,                        -- uslugi-hydraulik, home, cennik …
  type       text not null check (type in ('home','services','prices','about','contact','legal','service')),
  image      text,                                    -- ключ фотографии в /public/img
  group_key  text,                                    -- связь с группой прайса
  sort       smallint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.page_tr (
  page_key    text not null references public.pages(key) on delete cascade,
  locale      text not null references public.locales(code) on delete cascade,
  path        text not null,                          -- /uslugi/hydraulik/
  title       text not null,                          -- <title>, ≤60 знаков
  description text not null,                          -- meta description, 70–160 знаков
  h1          text not null,
  blurb       text,
  blocks      jsonb not null default '[]'::jsonb,     -- тело страницы
  checklist   jsonb,                                  -- «что входит» у услуг
  updated_at  timestamptz not null default now(),
  primary key (page_key, locale)
);
create unique index if not exists page_tr_path_uniq on public.page_tr (path);
create index if not exists page_tr_locale_idx on public.page_tr (locale);

-- ---------------------------------------------------------------- прайс
create table if not exists public.price_groups (
  key  text primary key,
  sort smallint not null default 0
);

create table if not exists public.price_group_tr (
  group_key text not null references public.price_groups(key) on delete cascade,
  locale    text not null references public.locales(code) on delete cascade,
  name      text not null,
  primary key (group_key, locale)
);

create table if not exists public.price_items (
  key       text primary key,
  group_key text not null references public.price_groups(key) on delete cascade,
  dept      text not null default '',                 -- fix / clean / move / garden
  price     integer not null check (price >= 0),
  hours     numeric(5,2) not null default 0,
  unit      text not null default 'szt',
  min_qty   smallint not null default 1,
  max_qty   smallint not null default 99,
  extra     jsonb not null default '{}'::jsonb,       -- a/au/s/su/wet/dry
  sort      smallint not null default 0
);
create index if not exists price_items_group_idx on public.price_items (group_key);

create table if not exists public.price_item_tr (
  item_key text not null references public.price_items(key) on delete cascade,
  locale   text not null references public.locales(code) on delete cascade,
  name     text not null,
  primary key (item_key, locale)
);

-- ---------------------------------------------------------------- цепочки работ
create table if not exists public.chains (
  key       text primary key,
  trigger   jsonb not null default '[]'::jsonb,       -- какие позиции запускают подсказку
  steps     jsonb not null default '[]'::jsonb,       -- недостающие шаги цикла
  visits    smallint not null default 1,
  min_price integer not null default 0
);

create table if not exists public.chain_tr (
  chain_key   text not null references public.chains(key) on delete cascade,
  locale      text not null references public.locales(code) on delete cascade,
  name        text not null,
  unless_text text not null default '',               -- когда шаг НЕ нужен
  primary key (chain_key, locale)
);

-- ---------------------------------------------------------------- частые вопросы
create table if not exists public.faq (
  key  text primary key,
  sort smallint not null default 0
);

create table if not exists public.faq_tr (
  faq_key  text not null references public.faq(key) on delete cascade,
  locale   text not null references public.locales(code) on delete cascade,
  question text not null,
  answer   text not null,
  primary key (faq_key, locale)
);

-- ---------------------------------------------------------------- настройки
-- Минимум выезда, наценка за срочность, рабочие дни, строки калькулятора.
create table if not exists public.settings (
  key   text primary key,
  value jsonb not null,
  note  text
);

-- ---------------------------------------------------------------- заявки
create table if not exists public.leads (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  locale     text not null default 'pl',
  name       text not null,
  phone      text not null,
  email      text,
  district   text,
  address    text,
  when_date  date,
  comment    text,
  urgent     boolean not null default false,
  items      jsonb not null default '[]'::jsonb,      -- позиции сметы на момент отправки
  totals     jsonb not null default '{}'::jsonb,      -- labour / minimum / urgentFee / total / hours
  page       text,                                    -- откуда отправили
  user_agent text,
  status     text not null default 'new' check (status in ('new','seen','done','spam')),
  constraint leads_name_len  check (char_length(name)  between 1 and 200),
  constraint leads_phone_len check (char_length(phone) between 5 and 40)
);
create index if not exists leads_created_idx on public.leads (created_at desc);
create index if not exists leads_status_idx  on public.leads (status);

-- ---------------------------------------------------------------- RLS
alter table public.locales        enable row level security;
alter table public.pages          enable row level security;
alter table public.page_tr        enable row level security;
alter table public.price_groups   enable row level security;
alter table public.price_group_tr enable row level security;
alter table public.price_items    enable row level security;
alter table public.price_item_tr  enable row level security;
alter table public.chains         enable row level security;
alter table public.chain_tr       enable row level security;
alter table public.faq            enable row level security;
alter table public.faq_tr         enable row level security;
alter table public.settings       enable row level security;
alter table public.leads          enable row level security;

-- Контент — только чтение и только публичное. Запись идёт service-ключом,
-- который RLS не проверяет, поэтому политик на запись нет намеренно.
do $$
declare t text;
begin
  foreach t in array array[
    'locales','pages','page_tr','price_groups','price_group_tr',
    'price_items','price_item_tr','chains','chain_tr','faq','faq_tr','settings'
  ] loop
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      'read_' || t, t);
  end loop;
end $$;

-- Для leads политик нет вообще: ни anon, ни authenticated не могут ни читать,
-- ни писать. Единственный путь — edge-функция на service-ключе.

comment on table public.leads is 'Заявки с сайта. Пишет только edge-функция lead; публичного доступа нет.';
