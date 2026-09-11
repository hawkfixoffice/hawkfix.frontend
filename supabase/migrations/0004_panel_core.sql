-- ============================================================
-- Панель управления HAWK.FIX: сотрудники, клиенты, заказы,
-- отчёты мастеров и деньги. 2026-09-10.
--
-- Роли: admin (всё), manager (заказы и мастера на карте),
-- master (свои заказы, свой заработок).
-- ============================================================

-- ---------- 1. Сотрудники ----------
-- Вход по нику, без почты: в auth.users кладём синтетический адрес
-- <username>@staff.hawkfix.pl, человек его никогда не видит и не вводит.
create table if not exists public.staff (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null unique,
  full_name    text not null,
  role         text not null check (role in ('admin', 'manager', 'master')),
  phone        text,
  active       boolean not null default true,
  -- сколько заказов мастер тянет одновременно: основа расчёта загрузки
  capacity     int not null default 3,
  hired_at     date not null default current_date,
  note         text,
  created_at   timestamptz not null default now()
);
comment on table public.staff is 'Сотрудники панели. id совпадает с auth.users.id';

-- Умения мастера = группы прайса (content/groups.json), заказ попадает
-- только тому, кто умеет делать все его группы работ.
create table if not exists public.staff_skills (
  staff_id   uuid not null references public.staff(id) on delete cascade,
  group_key  text not null,
  level      int not null default 1 check (level between 1 and 3),
  primary key (staff_id, group_key)
);

-- Где мастер сейчас. Пишет его телефон, читают менеджер и админ.
create table if not exists public.staff_locations (
  staff_id    uuid primary key references public.staff(id) on delete cascade,
  lat         double precision not null,
  lon         double precision not null,
  accuracy_m  double precision,
  updated_at  timestamptz not null default now()
);

-- ---------- 2. Клиенты (CRM) ----------
create table if not exists public.clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  phone         text not null,
  email         text,
  address       text,
  district      text,
  lat           double precision,
  lon           double precision,
  -- new: заявка есть, работ ещё не было; active: работа в процессе;
  -- regular: два и больше выполненных; vip: потратил много; lost: давно не заказывал
  status        text not null default 'new'
                check (status in ('new', 'active', 'regular', 'vip', 'lost')),
  source        text,                       -- сайт, телефон, рекомендация
  note          text,
  orders_count  int not null default 0,
  spent_total   numeric(12,2) not null default 0,
  first_order_at timestamptz,
  last_order_at  timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists clients_phone_uniq on public.clients (phone);

-- ---------- 3. Заказы ----------
create sequence if not exists public.order_no_seq start 2001;

create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  order_no       text not null unique default ('HF-' || to_char(now(), 'YY') || '-' || nextval('public.order_no_seq')),
  lead_id        uuid references public.leads(id) on delete set null,
  client_id      uuid not null references public.clients(id) on delete restrict,
  master_id      uuid references public.staff(id) on delete set null,
  -- new: не назначен; offered: предложен мастеру, ждём подтверждения;
  -- assigned: мастер принял; en_route: выехал; shopping: покупает материалы;
  -- in_progress: работает; done: отчёт сдан; cancelled: отменён
  status         text not null default 'new'
                 check (status in ('new','offered','assigned','en_route','shopping','in_progress','done','cancelled')),
  address        text,
  district       text,
  lat            double precision,
  lon            double precision,
  scheduled_date date,
  scheduled_slot text,
  -- крайний срок: по нему считается «просрочен»
  deadline_at    timestamptz,
  urgent         boolean not null default false,
  items          jsonb not null default '[]'::jsonb,
  group_keys     text[] not null default '{}',   -- какие умения нужны
  totals         jsonb not null default '{}'::jsonb,
  quoted_total   numeric(12,2) not null default 0,
  hours          numeric(6,2) not null default 0,
  comment        text,
  created_by     uuid references public.staff(id) on delete set null,
  created_at     timestamptz not null default now(),
  accepted_at    timestamptz,
  started_at     timestamptz,
  finished_at    timestamptz,
  cancelled_at   timestamptz,
  cancel_reason  text
);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_master_idx on public.orders (master_id);
create index if not exists orders_client_idx on public.orders (client_id);
create index if not exists orders_deadline_idx on public.orders (deadline_at);

-- Предложение заказа мастеру: алгоритм подбирает, мастер подтверждает.
-- Не принял до expires_at — уходит следующему по рейтингу.
create table if not exists public.order_offers (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  master_id   uuid not null references public.staff(id) on delete cascade,
  score       numeric(6,2) not null default 0,
  reason      jsonb not null default '{}'::jsonb,   -- из чего сложился выбор
  status      text not null default 'pending' check (status in ('pending','accepted','declined','expired')),
  offered_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  answered_at timestamptz
);
create index if not exists offers_master_idx on public.order_offers (master_id, status);
create index if not exists offers_order_idx on public.order_offers (order_id);

-- Отчёт мастера: без него заказ не закрывается.
create table if not exists public.order_reports (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null unique references public.orders(id) on delete cascade,
  master_id      uuid not null references public.staff(id) on delete restrict,
  cash_amount    numeric(12,2) not null default 0,
  card_amount    numeric(12,2) not null default 0,
  materials_cost numeric(12,2) not null default 0,
  -- либо чек на материалы, либо честная отметка «материалы не понадобились»
  receipt_path   text,
  no_materials   boolean not null default false,
  work_note      text,
  photo_paths    text[] not null default '{}',
  -- деньги считаются на сервере и сохраняются: ставки со временем меняются,
  -- а отчёт должен показывать те, что действовали в день заказа
  gross          numeric(12,2) not null default 0,
  base           numeric(12,2) not null default 0,
  master_share   numeric(12,2) not null default 0,
  company_share  numeric(12,2) not null default 0,
  tax_amount     numeric(12,2) not null default 0,
  company_net    numeric(12,2) not null default 0,
  master_pct     numeric(5,2) not null default 80,
  tax_pct        numeric(5,2) not null default 0,
  created_at     timestamptz not null default now(),
  constraint receipt_or_none check (no_materials or receipt_path is not null or materials_cost = 0)
);

-- Лента событий заказа: кто что сделал и когда.
create table if not exists public.order_events (
  id         bigserial primary key,
  order_id   uuid not null references public.orders(id) on delete cascade,
  actor_id   uuid references public.staff(id) on delete set null,
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  at         timestamptz not null default now()
);
create index if not exists events_order_idx on public.order_events (order_id, at desc);

-- ---------- 4. Настройки панели ----------
create table if not exists public.panel_settings (
  key   text primary key,
  value jsonb not null,
  note  text
);
insert into public.panel_settings (key, value, note) values
  ('master_pct',   '80'::jsonb,  'Доля мастера от суммы работ, %'),
  ('tax_pct',      '0'::jsonb,   'Налог, вычитается из доли фирмы, %'),
  ('offer_ttl_min','20'::jsonb,  'Сколько минут у мастера на подтверждение заказа'),
  ('work_start',   '"08:00"'::jsonb, 'Начало рабочего дня'),
  ('work_end',     '"20:00"'::jsonb, 'Конец рабочего дня')
on conflict (key) do nothing;
