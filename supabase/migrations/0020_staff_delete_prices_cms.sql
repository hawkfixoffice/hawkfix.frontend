-- ============================================================
-- 0020. Четыре вещи одной миграцией, потому что они сцеплены:
--
--   1. Удаление сотрудников администратором.
--   2. Тип цены у позиции прайса (фиксированная / за м² / за объём работ)
--      и подкатегории внутри категорий; права админа на правку прайса.
--   3. Работы «за объём»: фото от клиента к заявке, цена от мастера
--      при принятии заказа или «оценю на месте».
--   4. Правки текстов и фотографий сайта из визуального редактора.
-- ============================================================


-- ============================================================
-- 1. Удаление сотрудника
-- ============================================================
--
-- `staff.id` ссылается на `auth.users` с каскадом, а `order_reports.master_id`
-- на `staff` — с RESTRICT: отчёт с деньгами держит человека. Поэтому
-- удаление бывает двух видов:
--   * истории нет (ни отчётов, ни заказов, ни следов в журнале) — учётка
--     и сотрудник удаляются целиком;
--   * история есть — вход закрывается навсегда (учётка заблокирована,
--     пароль и адрес заменены, сессии сброшены), сотрудник помечается
--     `deleted_at` и пропадает из команды, но его имя остаётся в старых
--     заказах, отчётах и финансах. Ник освобождается для нового человека.
-- В обоих случаях незакрытые заказы снимаются с него и уходят автоподбору.

alter table public.staff add column if not exists deleted_at timestamptz;

create or replace function public.delete_staff(p_staff uuid, p_reason text default null)
returns jsonb language plpgsql security definer
set search_path = public, auth, extensions as $$
declare
  s public.staff;
  me uuid := auth.uid();
  has_history boolean;
  o record;
  moved int := 0;
  avatar text;
begin
  if public.is_admin() is not true then
    raise exception 'удалять сотрудников может только администратор';
  end if;
  select * into s from public.staff where id = p_staff for update;
  if s is null or s.deleted_at is not null then raise exception 'сотрудник не найден'; end if;
  if s.id = me then raise exception 'себя удалить нельзя'; end if;
  if s.role = 'admin' and (
    select count(*) from public.staff where role = 'admin' and active and deleted_at is null and id <> s.id
  ) = 0 then
    raise exception 'это последний администратор';
  end if;

  -- Незакрытые заказы: снимаем мастера и отдаём автоподбору
  for o in select id from public.orders
            where master_id = s.id and status in ('assigned', 'en_route', 'shopping', 'in_progress')
  loop
    update public.orders set master_id = null, status = 'new', accepted_at = null where id = o.id;
    insert into public.order_events (order_id, actor_id, type, payload)
    values (o.id, me, 'master_removed', jsonb_build_object('master', s.full_name));
    moved := moved + 1;
  end loop;

  -- Висящие предложения закрываем как «отозвано офисом»
  update public.order_offers set status = 'cancelled', answered_at = now()
   where master_id = s.id and status = 'pending';

  delete from public.staff_skills where staff_id = s.id;
  delete from public.staff_locations where staff_id = s.id;
  delete from public.staff_seen where staff_id = s.id;

  has_history := exists (select 1 from public.order_reports where master_id = s.id)
              or exists (select 1 from public.orders where master_id = s.id or created_by = s.id)
              or exists (select 1 from public.order_events where actor_id = s.id)
              or exists (select 1 from public.order_offers where master_id = s.id)
              or exists (select 1 from public.order_trash where deleted_by = s.id);
  avatar := s.avatar_path;

  if not has_history then
    delete from auth.users where id = s.id;           -- каскадом уходит и staff
  else
    update public.staff set
      active = false,
      deleted_at = now(),
      username = left(s.username, 40) || '~' || left(s.id::text, 8),
      note = concat_ws(E'\n', nullif(s.note, ''), 'Usunięty ' || to_char(now() at time zone 'Europe/Warsaw', 'YYYY-MM-DD')
                       || coalesce(': ' || nullif(btrim(p_reason), ''), ''))
     where id = s.id;
    update auth.users set
      banned_until = 'infinity',
      encrypted_password = extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
      email = 'deleted.' || s.id::text || '@staff.hawkfix.pl',
      updated_at = now()
     where id = s.id;
    update auth.identities set
      identity_data = identity_data || jsonb_build_object('email', 'deleted.' || s.id::text || '@staff.hawkfix.pl')
     where user_id = s.id;
    delete from auth.refresh_tokens where user_id::text = s.id::text;
    delete from auth.sessions where user_id = s.id;
  end if;

  -- Снятые заказы раздаём заново уже после того, как человек стал неактивным
  for o in select id from public.orders
            where status = 'new' and master_id is null
              and id in (select order_id from public.order_events
                          where type = 'master_removed' and at > now() - interval '1 minute')
  loop
    perform public.dispatch_order(o.id);
  end loop;

  return jsonb_build_object(
    'mode', case when has_history then 'archived' else 'deleted' end,
    'orders_moved', moved,
    'avatar', avatar);
end $$;

revoke all on function public.delete_staff(uuid, text) from public, anon;
grant execute on function public.delete_staff(uuid, text) to authenticated;


-- ============================================================
-- 2. Прайс: тип цены, подкатегории, правка админом
-- ============================================================
--
-- ptype:
--   fixed — цена за штуку/услугу, считается сразу;
--   area  — цена за м² или погонный метр, клиент вводит площадь;
--   scope — «за объём работ»: цена ориентировочная (или её нет вовсе),
--           клиент обязан приложить фото, мастер называет цену при
--           принятии заказа или на месте.

alter table public.price_items add column if not exists ptype text not null default 'fixed';
alter table public.price_items drop constraint if exists price_items_ptype_check;
alter table public.price_items add constraint price_items_ptype_check check (ptype in ('fixed', 'area', 'scope'));

-- Начальная раскладка по тому, что уже известно о позиции
update public.price_items set ptype = case
  when unit in ('m2', 'mb') then 'area'
  when coalesce((extra->>'s')::boolean, false) then 'scope'
  else 'fixed' end
 where ptype = 'fixed';

create table if not exists public.price_subgroups (
  key       text primary key,
  group_key text not null references public.price_groups(key) on delete cascade,
  sort      smallint not null default 0
);
create table if not exists public.price_subgroup_tr (
  subgroup_key text not null references public.price_subgroups(key) on delete cascade,
  locale       text not null references public.locales(code) on delete cascade,
  name         text not null,
  primary key (subgroup_key, locale)
);
alter table public.price_items add column if not exists subgroup_key text
  references public.price_subgroups(key) on delete set null;

alter table public.price_subgroups enable row level security;
alter table public.price_subgroup_tr enable row level security;

drop policy if exists read_price_subgroups on public.price_subgroups;
create policy read_price_subgroups on public.price_subgroups for select to anon, authenticated using (true);
drop policy if exists read_price_subgroup_tr on public.price_subgroup_tr;
create policy read_price_subgroup_tr on public.price_subgroup_tr for select to anon, authenticated using (true);

-- Правка прайса — только администратор
do $$
declare t text;
begin
  foreach t in array array['price_groups', 'price_group_tr', 'price_subgroups', 'price_subgroup_tr',
                           'price_items', 'price_item_tr']
  loop
    execute format('drop policy if exists admin_write on public.%I', t);
    execute format('create policy admin_write on public.%I for all to authenticated
                    using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Каталог одним вызовом: в том же виде, в каком его ждёт сайт
-- (content/items.json, groups.json, subgroups.json). Нужен и сборке,
-- и калькулятору на живой странице — правка цены видна сразу, без пересборки.
create or replace function public.catalog() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', g.key,
               'name', coalesce((select jsonb_object_agg(t.locale, t.name) from public.price_group_tr t where t.group_key = g.key), '{}'))
             order by g.sort, g.key)
        from public.price_groups g), '[]'),
    'subgroups', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', s.key, 'group', s.group_key,
               'name', coalesce((select jsonb_object_agg(t.locale, t.name) from public.price_subgroup_tr t where t.subgroup_key = s.key), '{}'))
             order by s.sort, s.key)
        from public.price_subgroups s), '[]'),
    'items', coalesce((
      select jsonb_agg(
               jsonb_strip_nulls(jsonb_build_object(
                 'key', i.key, 'group', i.group_key, 'dept', i.dept,
                 'price', i.price, 'hours', i.hours::float8, 'unit', i.unit,
                 'min', i.min_qty, 'max', i.max_qty,
                 'ptype', i.ptype, 'sub', i.subgroup_key))
               || coalesce(i.extra, '{}')
               || jsonb_build_object('name', coalesce((select jsonb_object_agg(t.locale, t.name) from public.price_item_tr t where t.item_key = i.key), '{}'))
             order by g.sort, i.sort, i.key)
        from public.price_items i join public.price_groups g on g.key = i.group_key), '[]')
  )
$$;
grant execute on function public.catalog() to anon, authenticated;

-- Удаление из прайса: позицию убираем и из цепочек, категорию — ещё
-- из умений мастеров и из привязки страницы услуги.
create or replace function public.price_delete(p_kind text, p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int := 0; keys text[];
begin
  if public.is_admin() is not true then raise exception 'прайс правит только администратор'; end if;

  if p_kind = 'item' then
    keys := array[p_key];
  elsif p_kind = 'subgroup' then
    -- подкатегорию удаляем, позиции остаются в категории
    update public.price_items set subgroup_key = null where subgroup_key = p_key;
    get diagnostics n = row_count;
    delete from public.price_subgroups where key = p_key;
    return jsonb_build_object('ok', true, 'items_kept', n);
  elsif p_kind = 'group' then
    select coalesce(array_agg(key), '{}') into keys from public.price_items where group_key = p_key;
  else
    raise exception 'неизвестный вид: %', p_kind;
  end if;

  -- цепочки ссылаются на позиции ключами в jsonb — чистим руками
  update public.chains c set
    steps = coalesce((select jsonb_agg(x) from jsonb_array_elements(c.steps) x where not (x #>> '{}') = any(keys)), '[]'),
    trigger = coalesce((select jsonb_agg(x) from jsonb_array_elements(c.trigger) x where not (x #>> '{}') = any(keys)), '[]')
   where exists (select 1 from jsonb_array_elements(c.steps || c.trigger) x where (x #>> '{}') = any(keys));
  delete from public.chains where jsonb_array_length(trigger) = 0 or jsonb_array_length(steps) = 0;

  delete from public.price_items where key = any(keys);
  get diagnostics n = row_count;

  if p_kind = 'group' then
    delete from public.staff_skills where group_key = p_key;
    update public.pages set group_key = null where group_key = p_key;
    delete from public.price_groups where key = p_key;
  end if;
  return jsonb_build_object('ok', true, 'items_deleted', n);
end $$;
revoke all on function public.price_delete(text, text) from public, anon;
grant execute on function public.price_delete(text, text) to authenticated;


-- ============================================================
-- 3. Работы «за объём»: фото клиента и цена мастера
-- ============================================================

alter table public.leads  add column if not exists photos text[] not null default '{}';
alter table public.orders add column if not exists photos text[] not null default '{}';
-- NULL — в заказе нет работ «за объём»;
-- pending — цену назовёт мастер при принятии;
-- onsite  — мастер оценит на месте;
-- quoted  — цена названа.
alter table public.orders add column if not exists quote_state text;
alter table public.orders drop constraint if exists orders_quote_state_check;
alter table public.orders add constraint orders_quote_state_check
  check (quote_state is null or quote_state in ('pending', 'onsite', 'quoted'));
alter table public.orders add column if not exists scope_est   numeric;   -- ориентир с сайта
alter table public.orders add column if not exists scope_price numeric;   -- цена мастера
alter table public.orders add column if not exists quoted_by   uuid references public.staff(id) on delete set null;
alter table public.orders add column if not exists quoted_at   timestamptz;

-- Фото клиента: приватный бакет, только WebP, до 3 МБ. Браузер клиента
-- может только положить файл в `in/…` (без чтения и перезаписи), видят
-- фото офис и мастер, которому заказ назначен или предложен.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lead-photos', 'lead-photos', false, 3145728, array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = 3145728, allowed_mime_types = array['image/webp'];

drop policy if exists lead_photos_insert on storage.objects;
create policy lead_photos_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'lead-photos' and name ~ '^in/[0-9a-f-]{36}/[0-9a-z-]{1,40}\.webp$');

drop policy if exists lead_photos_read on storage.objects;
create policy lead_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'lead-photos' and (
    public.is_office() or exists (
      select 1 from public.orders o
       where name = any(o.photos)
         and (o.master_id = auth.uid() or exists (
               select 1 from public.order_offers f where f.order_id = o.id and f.master_id = auth.uid()))
    )));

drop policy if exists lead_photos_delete on storage.objects;
create policy lead_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'lead-photos' and public.is_admin());

-- Пути фото из заявки: только то, что похоже на наш формат, не больше шести
create or replace function public.clean_photo_paths(p jsonb) returns text[]
language sql immutable as $$
  select coalesce(array_agg(v order by n), '{}')
    from (
      select x #>> '{}' v, n
        from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) with ordinality e(x, n)
       where jsonb_typeof(x) = 'string'
         and (x #>> '{}') ~ '^in/[0-9a-f-]{36}/[0-9a-z-]{1,40}\.webp$'
       limit 6
    ) s
$$;

-- Ориентир по работам «за объём» в смете клиента
create or replace function public.scope_estimate(items jsonb) returns numeric
language sql stable as $$
  select coalesce(sum(coalesce((e->>'sum')::numeric, 0)), 0)
    from jsonb_array_elements(coalesce(items, '[]'::jsonb)) e
    join public.price_items i on i.key = e->>'key'
   where i.ptype = 'scope'
$$;
create or replace function public.has_scope(items jsonb) returns boolean
language sql stable as $$
  select exists (
    select 1 from jsonb_array_elements(coalesce(items, '[]'::jsonb)) e
      join public.price_items i on i.key = e->>'key'
     where i.ptype = 'scope')
$$;

-- Резервный путь заявки (RPC) принимает фото
create or replace function public.submit_lead(payload jsonb)
 returns jsonb language plpgsql security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_name    text := nullif(btrim(payload #>> '{contact,name}'), '');
  v_phone   text := nullif(btrim(payload #>> '{contact,phone}'), '');
  v_digits  text := regexp_replace(coalesce(v_phone, ''), '\D', '', 'g');
  v_comment text := nullif(btrim(payload ->> 'comment'), '');
  v_items   jsonb := coalesce(payload -> 'items', '[]'::jsonb);
  v_when    text := payload ->> 'when';
  v_time    text := payload ->> 'whenTime';
  v_locale  text := coalesce(payload ->> 'locale', 'pl');
  v_lat     double precision := nullif(payload #>> '{place,lat}', '')::double precision;
  v_lon     double precision := nullif(payload #>> '{place,lon}', '')::double precision;
  v_recent  int;
  v_row     public.leads%rowtype;
begin
  if nullif(btrim(coalesce(payload ->> 'company', '')), '') is not null then
    return jsonb_build_object('ok', true);
  end if;

  if v_name is null or length(v_digits) < 9 then
    return jsonb_build_object('error', 'name_or_phone');
  end if;
  if jsonb_array_length(v_items) = 0 and v_comment is null then
    return jsonb_build_object('error', 'empty_request');
  end if;
  if v_locale not in ('pl', 'uk', 'ru', 'en') then v_locale := 'pl'; end if;
  if v_lat is not null and (abs(v_lat) > 90 or abs(coalesce(v_lon, 999)) > 180) then
    v_lat := null; v_lon := null;
  end if;

  select count(*) into v_recent
    from public.leads
   where regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_digits
     and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    return jsonb_build_object('error', 'too_many');
  end if;

  insert into public.leads (
    locale, name, phone, email, district, address, lat, lon,
    when_date, when_time, comment, urgent, items, totals, page, user_agent, source, photos
  ) values (
    v_locale,
    left(v_name, 200),
    left(v_phone, 40),
    left(nullif(btrim(payload #>> '{contact,email}'), ''), 320),
    left(nullif(btrim(payload #>> '{place,district}'), ''), 120),
    left(nullif(btrim(payload #>> '{place,address}'), ''), 300),
    v_lat, v_lon,
    case when v_when ~ '^\d{4}-\d{2}-\d{2}$' then v_when::date end,
    case when v_when ~ '^\d{4}-\d{2}-\d{2}$' and v_time ~ '^\d{2}:\d{2}\s?[-–]\s?\d{2}:\d{2}$'
         then v_time end,
    left(v_comment, 4000),
    coalesce((payload ->> 'urgent')::boolean, false),
    case when jsonb_typeof(v_items) = 'array' then v_items else '[]'::jsonb end,
    coalesce(payload -> 'totals', '{}'::jsonb),
    left(nullif(btrim(payload ->> 'page'), ''), 300),
    left(nullif(btrim(payload ->> 'userAgent'), ''), 400),
    'rpc',
    public.clean_photo_paths(payload -> 'photos')
  ) returning * into v_row;

  return jsonb_build_object('ok', true, 'id', v_row.id, 'orderNo', v_row.order_no);
end;
$function$;

-- Заявка → заказ: переносим фото и отмечаем, что нужна цена мастера
create or replace function public.order_from_lead(l_id uuid)
 returns orders language plpgsql security definer
 set search_path to 'public'
as $function$
declare
  l public.leads; c public.clients; o public.orders;
  slot_start text;
begin
  select * into l from public.leads where id = l_id;
  if l is null then raise exception 'заявка не найдена'; end if;
  if exists (select 1 from public.orders where lead_id = l_id) then
    select * into o from public.orders where lead_id = l_id; return o;
  end if;

  select * into c from public.clients where phone = l.phone;
  if c is null then
    insert into public.clients (name, phone, email, address, district, source, status)
    values (l.name, l.phone, l.email, l.address, l.district, 'strona', 'new')
    returning * into c;
  else
    update public.clients set
      name = coalesce(nullif(l.name, ''), name),
      email = coalesce(nullif(l.email, ''), email),
      address = coalesce(nullif(l.address, ''), address),
      district = coalesce(nullif(l.district, ''), district)
     where id = c.id returning * into c;
  end if;

  slot_start := split_part(coalesce(l.when_time, ''), '-', 1);

  insert into public.orders (
    lead_id, client_id, address, district, lat, lon, scheduled_date, scheduled_slot,
    urgent, items, group_keys, totals, quoted_total, hours, comment, deadline_at,
    photos, quote_state, scope_est)
  values (
    l.id, c.id, l.address, l.district, l.lat, l.lon, l.when_date, l.when_time,
    coalesce(l.urgent, false), coalesce(l.items, '[]'::jsonb),
    public.order_groups(l.items), coalesce(l.totals, '{}'::jsonb),
    coalesce((l.totals->>'total')::numeric, 0),
    coalesce((l.totals->>'hours')::numeric, 0),
    l.comment,
    case
      when l.when_date is not null and slot_start <> ''
        then (l.when_date::timestamp + (split_part(l.when_time, '-', 2) || ':00')::time)::timestamptz
      when l.when_date is not null then (l.when_date + 1)::timestamptz
      when coalesce(l.urgent, false) then now() + interval '1 day'
      else now() + interval '3 days'
    end,
    coalesce(l.photos, '{}'),
    case when public.has_scope(l.items) then 'pending' end,
    case when public.has_scope(l.items) then public.scope_estimate(l.items) end)
  returning * into o;

  insert into public.order_events (order_id, type, payload)
  values (o.id, 'created', jsonb_build_object('from_lead', l.id, 'order_no', o.order_no));

  perform public.dispatch_order(o.id);
  return o;
end $function$;

-- Цена за работы «за объём». Сумма заказа = смета клиента без ориентира
-- по этим работам + цена мастера. Повторный вызов просто переписывает цену.
create or replace function public.set_scope_quote(o_id uuid, p_price numeric default null, p_onsite boolean default false)
returns public.orders language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = o_id for update;
  if o is null then raise exception 'заказ не найден'; end if;
  if not (public.is_office() or o.master_id = auth.uid()) then raise exception 'чужой заказ'; end if;
  if o.quote_state is null then raise exception 'в заказе нет работ с ценой за объём'; end if;
  if o.status in ('done', 'cancelled') then raise exception 'заказ уже закрыт'; end if;

  if p_price is not null then
    if p_price < 0 or p_price > 1000000 then raise exception 'странная цена'; end if;
    update public.orders set
      quote_state = 'quoted', scope_price = round(p_price, 2),
      quoted_total = greatest(coalesce((totals->>'total')::numeric, 0) - coalesce(scope_est, 0), 0) + round(p_price, 2),
      quoted_by = auth.uid(), quoted_at = now()
     where id = o_id returning * into o;
    insert into public.order_events (order_id, actor_id, type, payload)
    values (o_id, auth.uid(), 'quoted', jsonb_build_object('price', round(p_price, 2)));
  elsif p_onsite then
    update public.orders set quote_state = 'onsite', quoted_by = auth.uid(), quoted_at = now()
     where id = o_id returning * into o;
    insert into public.order_events (order_id, actor_id, type)
    values (o_id, auth.uid(), 'quote_onsite');
  else
    raise exception 'укажите цену или отметьте оценку на месте';
  end if;
  return o;
end $$;
revoke all on function public.set_scope_quote(uuid, numeric, boolean) from public, anon;
grant execute on function public.set_scope_quote(uuid, numeric, boolean) to authenticated;

-- Принятие предложения с ценой. Без цены и без отметки заказ с работами
-- «за объём» считается «оценю на месте» — так старая сборка панели,
-- которая ещё не знает про цену, не ломается.
drop function if exists public.accept_offer(uuid);
create or replace function public.accept_offer(f_id uuid, p_price numeric default null, p_onsite boolean default false)
returns public.orders language plpgsql security definer set search_path = public as $$
declare f public.order_offers; o public.orders;
begin
  select * into f from public.order_offers where id = f_id for update;
  if f is null or f.master_id <> auth.uid() then raise exception 'чужое предложение'; end if;
  if f.status <> 'pending' then raise exception 'предложение уже закрыто'; end if;
  if f.expires_at < now() then
    update public.order_offers set status = 'expired', answered_at = now() where id = f_id;
    raise exception 'время на подтверждение вышло';
  end if;

  update public.order_offers set status = 'accepted', answered_at = now() where id = f_id;
  update public.orders set master_id = f.master_id, status = 'assigned', accepted_at = now()
   where id = f.order_id returning * into o;
  insert into public.order_events (order_id, actor_id, type)
  values (f.order_id, f.master_id, 'accepted');

  if o.quote_state = 'pending' then
    o := public.set_scope_quote(o.id, p_price, coalesce(p_onsite, false) or p_price is null);
  end if;
  return o;
end $$;
revoke all on function public.accept_offer(uuid, numeric, boolean) from public, anon;
grant execute on function public.accept_offer(uuid, numeric, boolean) to authenticated;

-- Начать работу без цены по объёму нельзя: клиент должен знать сумму до начала
create or replace function public.set_order_status(o_id uuid, new_status text)
 returns orders language plpgsql security definer
 set search_path to 'public'
as $function$
declare o public.orders;
begin
  select * into o from public.orders where id = o_id for update;
  if o is null then raise exception 'заказ не найден'; end if;
  if not (public.is_office() or o.master_id = auth.uid()) then raise exception 'чужой заказ'; end if;
  if new_status not in ('assigned','en_route','shopping','in_progress','cancelled') then
    raise exception 'этот статус так не ставится';
  end if;
  if new_status = 'in_progress' and o.quote_state in ('pending', 'onsite') then
    raise exception 'сначала назовите цену работ за объём';
  end if;
  update public.orders set
    status = new_status,
    started_at = case when new_status = 'in_progress' and started_at is null then now() else started_at end,
    cancelled_at = case when new_status = 'cancelled' then now() else cancelled_at end
   where id = o_id returning * into o;
  insert into public.order_events (order_id, actor_id, type, payload)
  values (o_id, auth.uid(), 'status', jsonb_build_object('status', new_status));
  return o;
end $function$;


-- ============================================================
-- 4. Правки сайта из визуального редактора
-- ============================================================
--
-- Ключ — место на сайте: `ui:hero.tagline` (строка интерфейса),
-- `page:<ключ страницы>:h1|blurb|b.<n>|c.<n>` (текст страницы),
-- `img:<имя фото>` (фотография, locale = '*').
-- Сайт при сборке запекает правки в HTML (content/overrides.json), а на
-- живой странице дочитывает свежие — правка видна сразу, без пересборки.

create table if not exists public.site_content (
  key        text not null,
  locale     text not null check (locale in ('pl', 'uk', 'ru', 'en', '*')),
  value      text not null,
  kind       text not null default 'text' check (kind in ('text', 'html', 'image')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.staff(id) on delete set null,
  primary key (key, locale)
);
alter table public.site_content enable row level security;
drop policy if exists site_content_read on public.site_content;
create policy site_content_read on public.site_content for select to anon, authenticated using (true);
drop policy if exists site_content_admin on public.site_content;
create policy site_content_admin on public.site_content for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.site_content_stamp() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists site_content_stamp on public.site_content;
create trigger site_content_stamp before insert or update on public.site_content
  for each row execute function public.site_content_stamp();

-- Фотографии сайта: публичный бакет, только WebP, пишет администратор
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 8388608, array['image/webp'])
on conflict (id) do update set public = true, file_size_limit = 8388608, allowed_mime_types = array['image/webp'];

drop policy if exists site_media_read on storage.objects;
create policy site_media_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'site-media');
drop policy if exists site_media_write on storage.objects;
create policy site_media_write on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media' and public.is_admin());
drop policy if exists site_media_update on storage.objects;
create policy site_media_update on storage.objects for update to authenticated
  using (bucket_id = 'site-media' and public.is_admin());
drop policy if exists site_media_delete on storage.objects;
create policy site_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'site-media' and public.is_admin());

-- Аватары и чеки панель теперь сама переводит в WebP перед загрузкой.
-- Запрет других форматов на уровне бакета НЕ ставим в этой миграции:
-- выкаченная сборка панели ещё грузит jpg, и чек мастера не ушёл бы.
-- После пуша новой панели — миграция 0021_webp_only.sql.

notify pgrst, 'reload schema';
