-- 0023 — заказ руками, правка заказа, фото «до» и «после», устройства для пушей.
--
-- 1. Клиент написал в WhatsApp или позвонил — заказ заводит сотрудник
--    (create_order). Офис отдаёт его автоподбору или назначает мастера сам,
--    мастер заводит заказ сразу на себя.
-- 2. Заказ можно править (update_order): дата и окно, адрес, работы,
--    срочность, комментарий. Правка пишется в ленту с «было → стало».
-- 3. Фото до начала работы и после окончания (add_proof / remove_proof,
--    бакет order-photos). Обязательность включается отдельно — 0024,
--    применять после выкатки панели: старая сборка фото не шлёт.
-- 4. device_tokens — куда слать пуши приложению.
--
-- Суммы считает сервер по прайсу, как и на сайте (src/lib/quote.ts):
-- браузеру и телефону в деньгах не верим.

-- ------------------------------------------------------------------
-- Колонки
-- ------------------------------------------------------------------
alter table public.orders
  add column if not exists source text,
  add column if not exists proof_before text[] not null default '{}',
  add column if not exists proof_after  text[] not null default '{}';

comment on column public.orders.source is 'Откуда заказ: null — заявка с сайта, whatsapp / phone / other — заведён сотрудником';

-- ------------------------------------------------------------------
-- Срок заказа: конец выбранного окна по варшавскому времени.
-- Раньше время окна читалось как UTC, и «просрочен» наступало на час-два
-- позже настоящего конца окна.
-- ------------------------------------------------------------------
create or replace function public.order_deadline(p_date date, p_slot text, p_urgent boolean)
returns timestamptz language sql stable as $$
  select case
    when p_date is not null and coalesce(p_slot, '') ~ '\d{2}:\d{2}\s*$'
      then (p_date::timestamp + substring(p_slot from '(\d{2}:\d{2})\s*$')::time) at time zone 'Europe/Warsaw'
    when p_date is not null
      then ((p_date + 1)::timestamp) at time zone 'Europe/Warsaw'
    when coalesce(p_urgent, false) then now() + interval '1 day'
    else now() + interval '3 days'
  end
$$;

-- ------------------------------------------------------------------
-- Строки сметы из того, что прислал клиент функции.
--   {key, qty}            — позиция прайса: цена и название берутся из базы;
--   {name, price, qty}    — своя строка (работы, которой нет в прайсе).
-- p_old — прежние строки заказа: у позиции, которая уже была в заказе,
-- остаются её цена и название — прайс мог измениться, а с клиентом
-- договаривались по старой.
-- ------------------------------------------------------------------
create or replace function public.order_price_lines(p_items jsonb, p_old jsonb default '[]'::jsonb, p_locale text default 'pl')
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(s.line order by s.ord), '[]'::jsonb)
    from (
      select e.ord,
             case when i.key is not null then
               jsonb_build_object(
                 'key', i.key,
                 'qty', q.qty,
                 'name', coalesce(
                   old.o ->> 'name',
                   (select t.name from public.price_item_tr t where t.item_key = i.key and t.locale = p_locale),
                   (select t.name from public.price_item_tr t where t.item_key = i.key and t.locale = 'pl'),
                   i.key),
                 'sum', round(coalesce(old.unit, i.price) * q.qty, 2),
                 'hours', round(i.hours * q.qty, 2),
                 'ptype', i.ptype)
             else
               jsonb_build_object(
                 'name', left(btrim(e.v ->> 'name'), 200),
                 'qty', q.qty,
                 'price', round(greatest(coalesce(nullif(e.v ->> 'price', '')::numeric, 0), 0), 2),
                 'sum', round(greatest(coalesce(nullif(e.v ->> 'price', '')::numeric, 0), 0) * q.qty, 2),
                 'ptype', 'custom')
             end as line
        from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end)
               with ordinality e(v, ord)
        left join public.price_items i on i.key = e.v ->> 'key'
        cross join lateral (
          select least(greatest(coalesce(nullif(e.v ->> 'qty', '')::numeric, 1), 0.01), 9999) as qty
        ) q
        left join lateral (
          select o,
                 case when coalesce(nullif(o ->> 'qty', '')::numeric, 0) > 0
                      then nullif(o ->> 'sum', '')::numeric / (o ->> 'qty')::numeric end as unit
            from jsonb_array_elements(case when jsonb_typeof(p_old) = 'array' then p_old else '[]'::jsonb end) o
           where o ->> 'key' = i.key
           limit 1
        ) old on i.key is not null
       where i.key is not null or nullif(btrim(e.v ->> 'name'), '') is not null
       limit 60
    ) s
$$;

-- ------------------------------------------------------------------
-- Итоги по готовым строкам. Те же правила, что у калькулятора сайта:
-- минимум выезда — самый большой среди выбранных направлений, срочность —
-- процент с потолком. Своя строка направления не имеет и минимум не
-- включает; p_apply_min = false — сотрудник договорился без минимума.
-- ------------------------------------------------------------------
create or replace function public.order_totals(p_lines jsonb, p_urgent boolean default false, p_apply_min boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_labour numeric; v_hours numeric; v_min numeric := 0; v_base numeric; v_fee numeric := 0;
  v_n int; v_scope boolean;
  v_min_def numeric := coalesce((select (value #>> '{}')::numeric from public.settings where key = 'minVisit'), 0);
  v_min_by  jsonb   := coalesce((select value from public.settings where key = 'minVisitBy'), '{}'::jsonb);
  v_pct numeric := coalesce((select (value #>> '{}')::numeric from public.settings where key = 'urgentPct'), 50);
  v_max numeric := coalesce((select (value #>> '{}')::numeric from public.settings where key = 'urgentMax'), 300);
begin
  select count(*),
         coalesce(sum(coalesce(nullif(l ->> 'sum', '')::numeric, 0)), 0),
         coalesce(sum(coalesce(nullif(l ->> 'hours', '')::numeric,
                               i.hours * coalesce(nullif(l ->> 'qty', '')::numeric, 1), 0)), 0),
         coalesce(max(coalesce(nullif(v_min_by ->> i.dept, '')::numeric, v_min_def))
                    filter (where i.key is not null), 0),
         coalesce(bool_or(i.ptype = 'scope'), false)
    into v_n, v_labour, v_hours, v_min, v_scope
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
    left join public.price_items i on i.key = l ->> 'key';

  if not coalesce(p_apply_min, true) then v_min := 0; end if;
  v_base := case when v_n > 0 then greatest(v_labour, v_min) else 0 end;
  if coalesce(p_urgent, false) and v_base > 0 then
    v_fee := least(round(v_base * v_pct / 100), v_max);
  end if;

  return jsonb_build_object(
    'labour', v_labour, 'minimum', v_min, 'urgentFee', v_fee,
    'total', v_base + v_fee, 'hours', round(v_hours, 2))
    || case when v_scope then '{"approx": true}'::jsonb else '{}'::jsonb end
    || case when not coalesce(p_apply_min, true) then '{"noMin": true}'::jsonb else '{}'::jsonb end;
end $$;

-- ------------------------------------------------------------------
-- Клиент по телефону: форма нового заказа подставляет имя и адрес, если
-- человек уже обращался. Мастеру таблица клиентов закрыта, поэтому RPC,
-- а не select — и только то, что нужно для заказа.
-- ------------------------------------------------------------------
create or replace function public.client_lookup(p_phone text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.staff_role() is null
                or length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 9 then null
  else (
    select jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'address', c.address,
                              'district', c.district, 'lat', c.lat, 'lon', c.lon,
                              'orders_count', c.orders_count)
      from public.clients c
     where right(regexp_replace(c.phone, '\D', '', 'g'), 9)
         = right(regexp_replace(p_phone, '\D', '', 'g'), 9)
     order by c.created_at
     limit 1)
  end
$$;

-- ------------------------------------------------------------------
-- Заказ руками
-- ------------------------------------------------------------------
create or replace function public.create_order(payload jsonb)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  v_role   text := public.staff_role();
  v_name   text := nullif(btrim(payload #>> '{client,name}'), '');
  v_phone  text := nullif(btrim(payload #>> '{client,phone}'), '');
  v_digits text := regexp_replace(coalesce(v_phone, ''), '\D', '', 'g');
  v_email  text := left(nullif(btrim(payload #>> '{client,email}'), ''), 320);
  v_addr   text := left(nullif(btrim(payload ->> 'address'), ''), 300);
  v_dist   text := left(nullif(btrim(payload ->> 'district'), ''), 120);
  v_lat    double precision := nullif(payload ->> 'lat', '')::double precision;
  v_lon    double precision := nullif(payload ->> 'lon', '')::double precision;
  v_date   date := case when payload ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$' then (payload ->> 'date')::date end;
  v_slot   text := case when payload ->> 'slot' ~ '^\d{2}:\d{2}\s?[-–]\s?\d{2}:\d{2}$' then payload ->> 'slot' end;
  v_urgent boolean := coalesce((payload ->> 'urgent')::boolean, false);
  v_min    boolean := coalesce((payload ->> 'apply_min')::boolean, true);
  v_note   text := left(nullif(btrim(payload ->> 'comment'), ''), 4000);
  v_source text := case when payload ->> 'source' in ('whatsapp', 'phone', 'other') then payload ->> 'source' else 'other' end;
  v_master text := coalesce(nullif(payload ->> 'master', ''), 'auto');
  v_mid    uuid;
  v_lines  jsonb;
  v_totals jsonb;
  c public.clients; o public.orders;
begin
  if v_role is null then raise exception 'только для сотрудников'; end if;
  if v_name is null or length(v_digits) < 9 then raise exception 'нужны имя и телефон клиента'; end if;
  if v_date is null then v_slot := null; end if;
  if v_lat is not null and (abs(v_lat) > 90 or abs(coalesce(v_lon, 999)) > 180) then
    v_lat := null; v_lon := null;
  end if;

  v_lines := public.order_price_lines(payload -> 'items', '[]'::jsonb, 'pl');
  if jsonb_array_length(v_lines) = 0 and v_note is null then
    raise exception 'добавьте работы или опишите задачу в комментарии';
  end if;
  v_totals := public.order_totals(v_lines, v_urgent, v_min);

  -- Кому заказ: мастер заводит только на себя, офис — автоподбору или
  -- конкретному мастеру
  if v_role = 'master' then
    v_mid := auth.uid();
  elsif v_master <> 'auto' then
    select id into v_mid from public.staff where id = v_master::uuid and role = 'master' and active;
    if v_mid is null then raise exception 'мастер не найден или отключён'; end if;
  end if;

  -- Клиента ищем по последним девяти цифрам: «+48 735…» и «735…» — один человек
  select * into c from public.clients
   where right(regexp_replace(phone, '\D', '', 'g'), 9) = right(v_digits, 9)
   order by created_at limit 1;
  if c is null then
    insert into public.clients (name, phone, email, address, district, lat, lon, source, status)
    values (left(v_name, 200), left(v_phone, 40), v_email, v_addr, v_dist, v_lat, v_lon, v_source, 'new')
    returning * into c;
  else
    update public.clients set
      name = coalesce(left(v_name, 200), name),
      email = coalesce(v_email, email),
      address = coalesce(v_addr, address),
      district = coalesce(v_dist, district)
     where id = c.id returning * into c;
  end if;

  insert into public.orders (
    client_id, master_id, status, accepted_at, address, district, lat, lon,
    scheduled_date, scheduled_slot, deadline_at, urgent, items, group_keys, totals,
    quoted_total, hours, comment, created_by, source, quote_state, scope_est)
  values (
    c.id, v_mid, case when v_mid is null then 'new' else 'assigned' end,
    case when v_mid is null then null else now() end,
    v_addr, v_dist, v_lat, v_lon,
    v_date, v_slot, public.order_deadline(v_date, v_slot, v_urgent), v_urgent,
    v_lines, public.order_groups(v_lines), v_totals,
    coalesce((v_totals ->> 'total')::numeric, 0), coalesce((v_totals ->> 'hours')::numeric, 0),
    v_note, auth.uid(), v_source,
    case when public.has_scope(v_lines) then 'pending' end,
    case when public.has_scope(v_lines) then public.scope_estimate(v_lines) end)
  returning * into o;

  insert into public.order_events (order_id, actor_id, type, payload)
  values (o.id, auth.uid(), 'created_manual',
          jsonb_build_object('order_no', o.order_no, 'source', v_source, 'by', v_role));

  if v_mid is not null then
    insert into public.order_events (order_id, actor_id, type, payload)
    values (o.id, auth.uid(), 'assigned',
            jsonb_build_object('master_id', v_mid, 'manual', true, 'self', v_mid = auth.uid()));
  else
    perform public.dispatch_order(o.id);
  end if;

  select * into o from public.orders where id = o.id;
  return o;
end $$;

revoke all on function public.create_order(jsonb) from public, anon;
grant execute on function public.create_order(jsonb) to authenticated;
revoke all on function public.client_lookup(text) from public, anon;
grant execute on function public.client_lookup(text) to authenticated;

-- ------------------------------------------------------------------
-- Правка заказа. В patch только то, что меняется:
--   date, slot, address (+ district, lat, lon), comment, urgent,
--   apply_min, items (полный новый список строк).
-- Правит офис и мастер этого заказа; закрытый заказ не правится —
-- его суммы уже в отчётах.
-- ------------------------------------------------------------------
create or replace function public.update_order(o_id uuid, patch jsonb)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  changed text[] := '{}';
  ev jsonb := '{}'::jsonb;
  v_date date; v_slot text; v_txt text;
  v_urgent boolean; v_nomin boolean;
  v_lines jsonb; v_totals jsonb; v_total numeric;
begin
  select * into o from public.orders where id = o_id for update;
  if o is null then raise exception 'заказ не найден'; end if;
  if (public.is_office() or o.master_id = auth.uid()) is not true then raise exception 'чужой заказ'; end if;
  if o.status in ('done', 'cancelled') then raise exception 'закрытый заказ не редактируется'; end if;

  -- дата и окно
  if patch ? 'date' or patch ? 'slot' then
    v_date := case when patch ? 'date'
                   then case when patch ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$' then (patch ->> 'date')::date end
                   else o.scheduled_date end;
    v_slot := case when patch ? 'slot'
                   then case when patch ->> 'slot' ~ '^\d{2}:\d{2}\s?[-–]\s?\d{2}:\d{2}$' then patch ->> 'slot' end
                   else o.scheduled_slot end;
    if v_date is null then v_slot := null; end if;
    if v_date is distinct from o.scheduled_date or v_slot is distinct from o.scheduled_slot then
      ev := ev || jsonb_build_object('date', jsonb_build_object(
        'from', o.scheduled_date, 'to', v_date, 'slot_from', o.scheduled_slot, 'slot_to', v_slot));
      changed := array_append(changed, 'date');
      o.scheduled_date := v_date;
      o.scheduled_slot := v_slot;
      o.deadline_at := public.order_deadline(v_date, v_slot, o.urgent);
    end if;
  end if;

  -- адрес: вместе с ним меняется и точка на карте
  if patch ? 'address' then
    v_txt := left(nullif(btrim(patch ->> 'address'), ''), 300);
    if v_txt is distinct from o.address then
      ev := ev || jsonb_build_object('address', jsonb_build_object('from', o.address, 'to', v_txt));
      changed := array_append(changed, 'address');
      o.address := v_txt;
      o.district := left(nullif(btrim(patch ->> 'district'), ''), 120);
      o.lat := nullif(patch ->> 'lat', '')::double precision;
      o.lon := nullif(patch ->> 'lon', '')::double precision;
      if o.lat is not null and (abs(o.lat) > 90 or abs(coalesce(o.lon, 999)) > 180) then
        o.lat := null; o.lon := null;
      end if;
    end if;
  end if;

  if patch ? 'comment' then
    v_txt := left(nullif(btrim(patch ->> 'comment'), ''), 4000);
    if v_txt is distinct from o.comment then
      changed := array_append(changed, 'comment');
      o.comment := v_txt;
    end if;
  end if;

  -- работы и деньги
  v_urgent := coalesce((patch ->> 'urgent')::boolean, o.urgent);
  v_nomin  := case when patch ? 'apply_min' then not coalesce((patch ->> 'apply_min')::boolean, true)
                   else coalesce((o.totals ->> 'noMin')::boolean, false) end;
  if patch ? 'items' or v_urgent is distinct from o.urgent
     or v_nomin is distinct from coalesce((o.totals ->> 'noMin')::boolean, false) then
    v_lines := case when patch ? 'items'
                    then public.order_price_lines(patch -> 'items', o.items, 'pl')
                    else o.items end;
    v_totals := public.order_totals(v_lines, v_urgent, not v_nomin);
    v_total := coalesce((v_totals ->> 'total')::numeric, 0);

    if v_lines is distinct from o.items then changed := array_append(changed, 'items'); end if;
    if v_urgent is distinct from o.urgent then changed := array_append(changed, 'urgent'); end if;

    o.items := v_lines;
    o.totals := v_totals;
    o.urgent := v_urgent;
    o.group_keys := public.order_groups(v_lines);
    o.hours := coalesce((v_totals ->> 'hours')::numeric, 0);

    if public.has_scope(v_lines) then
      o.scope_est := public.scope_estimate(v_lines);
      if o.quote_state is null then o.quote_state := 'pending'; end if;
      o.quoted_total := case when o.quote_state = 'quoted'
        then greatest(v_total - coalesce(o.scope_est, 0), 0) + coalesce(o.scope_price, 0)
        else v_total end;
    else
      o.quote_state := null; o.scope_est := null; o.scope_price := null;
      o.quoted_total := v_total;
    end if;
    if o.scheduled_date is null and 'urgent' = any(changed) then
      o.deadline_at := public.order_deadline(null, null, v_urgent);
    end if;
    ev := ev || jsonb_build_object('total', o.quoted_total);
  end if;

  if cardinality(changed) = 0 then return o; end if;

  update public.orders set
    scheduled_date = o.scheduled_date, scheduled_slot = o.scheduled_slot, deadline_at = o.deadline_at,
    address = o.address, district = o.district, lat = o.lat, lon = o.lon, comment = o.comment,
    urgent = o.urgent, items = o.items, totals = o.totals, group_keys = o.group_keys, hours = o.hours,
    quote_state = o.quote_state, scope_est = o.scope_est, scope_price = o.scope_price,
    quoted_total = o.quoted_total
   where id = o_id returning * into o;

  insert into public.order_events (order_id, actor_id, type, payload)
  values (o_id, auth.uid(), 'edited', ev || jsonb_build_object('fields', to_jsonb(changed)));

  return o;
end $$;

revoke all on function public.update_order(uuid, jsonb) from public, anon;
grant execute on function public.update_order(uuid, jsonb) to authenticated;

-- ------------------------------------------------------------------
-- Заявка с сайта → заказ: срок считается той же функцией, что и у
-- ручного заказа (остальное без изменений).
-- ------------------------------------------------------------------
create or replace function public.order_from_lead(l_id uuid)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  l public.leads; c public.clients; o public.orders;
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
    public.order_deadline(l.when_date, l.when_time, coalesce(l.urgent, false)),
    coalesce(l.photos, '{}'),
    case when public.has_scope(l.items) then 'pending' end,
    case when public.has_scope(l.items) then public.scope_estimate(l.items) end)
  returning * into o;

  insert into public.order_events (order_id, type, payload)
  values (o.id, 'created', jsonb_build_object('from_lead', l.id, 'order_no', o.order_no));

  perform public.dispatch_order(o.id);
  return o;
end $$;

-- ------------------------------------------------------------------
-- Фото «до» и «после». Файлы — в приватном бакете, в папке заказа;
-- в заказе лежат только пути.
-- ------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-photos', 'order-photos', false, 6291456, array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = 6291456, allowed_mime_types = array['image/webp'];

drop policy if exists order_photos_insert on storage.objects;
create policy order_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'order-photos'
    and name ~ '^[0-9a-f-]{36}/(before|after)-[0-9a-z-]{1,60}\.webp$'
    and (public.is_office() or exists (
      select 1 from public.orders o
       where o.master_id = auth.uid() and name like o.id::text || '/%')));

drop policy if exists order_photos_read on storage.objects;
create policy order_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'order-photos' and (
    public.is_office() or exists (
      select 1 from public.orders o
       where o.master_id = auth.uid() and name like o.id::text || '/%')));

drop policy if exists order_photos_delete on storage.objects;
create policy order_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'order-photos' and (
    public.is_office() or exists (
      select 1 from public.orders o
       where o.master_id = auth.uid() and o.status <> 'done' and name like o.id::text || '/%')));

create or replace function public.add_proof(o_id uuid, p_kind text, p_paths text[])
returns public.orders language plpgsql security definer set search_path = public as $$
declare o public.orders; v_new text[];
begin
  select * into o from public.orders where id = o_id for update;
  if o is null then raise exception 'заказ не найден'; end if;
  if (public.is_office() or o.master_id = auth.uid()) is not true then raise exception 'чужой заказ'; end if;
  if p_kind not in ('before', 'after') then raise exception 'фото бывает «до» или «после»'; end if;

  -- только пути из папки этого заказа и нужного вида, без повторов
  select coalesce(array_agg(distinct p), '{}') into v_new
    from unnest(coalesce(p_paths, '{}')) p
   where p ~ ('^' || o_id::text || '/' || p_kind || '-[0-9a-z-]{1,60}\.webp$')
     and p <> all (case when p_kind = 'before' then o.proof_before else o.proof_after end);
  if cardinality(v_new) = 0 then return o; end if;
  if cardinality(case when p_kind = 'before' then o.proof_before else o.proof_after end)
     + cardinality(v_new) > 12 then
    raise exception 'не больше 12 фото';
  end if;

  if p_kind = 'before' then
    update public.orders set proof_before = proof_before || v_new where id = o_id returning * into o;
  else
    update public.orders set proof_after = proof_after || v_new where id = o_id returning * into o;
  end if;

  insert into public.order_events (order_id, actor_id, type, payload)
  values (o_id, auth.uid(), 'proof_' || p_kind, jsonb_build_object('n', cardinality(v_new)));
  return o;
end $$;

create or replace function public.remove_proof(o_id uuid, p_path text)
returns public.orders language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = o_id for update;
  if o is null then raise exception 'заказ не найден'; end if;
  if (public.is_office() or (o.master_id = auth.uid() and o.status <> 'done')) is not true then
    raise exception 'это фото убрать нельзя';
  end if;
  update public.orders set
    proof_before = array_remove(proof_before, p_path),
    proof_after  = array_remove(proof_after, p_path)
   where id = o_id returning * into o;
  return o;
end $$;

revoke all on function public.add_proof(uuid, text, text[]) from public, anon;
grant execute on function public.add_proof(uuid, text, text[]) to authenticated;
revoke all on function public.remove_proof(uuid, text) from public, anon;
grant execute on function public.remove_proof(uuid, text) to authenticated;

-- Закрытие заказа: фото «после» попадают и в отчёт (photo_paths), чтобы
-- отчёт оставался самодостаточным документом.
create or replace function public.finish_order(o_id uuid, cash numeric, card numeric, materials numeric, receipt text DEFAULT NULL::text, no_mat boolean DEFAULT false, note text DEFAULT NULL::text, photos text[] DEFAULT '{}'::text[])
returns public.order_reports language plpgsql security definer set search_path = public as $$
declare
  o public.orders; r public.order_reports;
  m_pct numeric := public.setting_num('master_pct', 80);
  t_pct numeric := public.setting_num('tax_pct', 0);
  v_gross numeric; v_base numeric; v_master numeric; v_company numeric; v_tax numeric;
begin
  select * into o from public.orders where id = o_id for update;
  if o is null then raise exception 'заказ не найден'; end if;
  if (public.is_admin() or o.master_id = auth.uid()) is not true then raise exception 'чужой заказ'; end if;
  if o.status = 'done' then raise exception 'заказ уже закрыт'; end if;
  if coalesce(materials, 0) > 0 and not no_mat and receipt is null then
    raise exception 'нужен чек на материалы или отметка, что материалы не понадобились';
  end if;

  v_gross   := coalesce(cash, 0) + coalesce(card, 0);
  v_base    := greatest(v_gross - coalesce(materials, 0), 0);
  v_master  := round(v_base * m_pct / 100, 2);
  v_company := round(v_base - v_master, 2);
  -- налог с оборота: платится со всей суммы, что прошла через кассу
  v_tax     := round(v_gross * t_pct / 100, 2);

  insert into public.order_reports (
    order_id, master_id, cash_amount, card_amount, materials_cost, receipt_path,
    no_materials, work_note, photo_paths, gross, base, master_share, company_share,
    tax_amount, company_net, master_pct, tax_pct)
  values (o_id, coalesce(o.master_id, auth.uid()), coalesce(cash, 0), coalesce(card, 0),
          coalesce(materials, 0), receipt, no_mat, note,
          case when cardinality(coalesce(photos, '{}')) > 0 then photos else o.proof_after end,
          v_gross, v_base, v_master, v_company, v_tax, v_company - v_tax, m_pct, t_pct)
  on conflict (order_id) do update set
    cash_amount = excluded.cash_amount, card_amount = excluded.card_amount,
    materials_cost = excluded.materials_cost, receipt_path = excluded.receipt_path,
    no_materials = excluded.no_materials, work_note = excluded.work_note,
    photo_paths = excluded.photo_paths, gross = excluded.gross, base = excluded.base,
    master_share = excluded.master_share, company_share = excluded.company_share,
    tax_amount = excluded.tax_amount, company_net = excluded.company_net
  returning * into r;

  update public.orders set status = 'done', finished_at = now() where id = o_id;
  insert into public.order_events (order_id, actor_id, type, payload)
  values (o_id, auth.uid(), 'finished', jsonb_build_object('gross', v_gross, 'master', v_master));

  perform public.recalc_client(o.client_id);
  return r;
end $$;

-- Удаление заказа: фото «до/после» уходят в снимок и отдаются панели
-- на удаление из Storage — так же, как чеки.
create or replace function public.delete_order(o_id uuid, p_reason text DEFAULT NULL::text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  snap jsonb;
  files jsonb;
  pics jsonb;
  c_id uuid;
begin
  if public.is_admin() is not true then
    raise exception 'удалять заказы может только администратор';
  end if;

  select * into o from public.orders where id = o_id;
  if o is null then raise exception 'заказ не найден'; end if;

  select coalesce(jsonb_agg(ob.name), '[]'::jsonb) into files
    from storage.objects ob
   where ob.bucket_id = 'receipts' and ob.name like o_id::text || '/%';
  select coalesce(jsonb_agg(ob.name), '[]'::jsonb) into pics
    from storage.objects ob
   where ob.bucket_id = 'order-photos' and ob.name like o_id::text || '/%';

  snap := jsonb_build_object(
    'order',  to_jsonb(o),
    'client', (select to_jsonb(c) from public.clients c where c.id = o.client_id),
    'report', (select to_jsonb(r) from public.order_reports r where r.order_id = o_id),
    'offers', coalesce((select jsonb_agg(to_jsonb(f) order by f.offered_at)
                          from public.order_offers f where f.order_id = o_id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.at)
                          from public.order_events e where e.order_id = o_id), '[]'::jsonb),
    'receipts', files,
    'photos', pics
  );

  insert into public.order_trash (order_id, order_no, snapshot, reason, deleted_by)
  values (o.id, o.order_no, snap, nullif(btrim(coalesce(p_reason, '')), ''), auth.uid());

  c_id := o.client_id;
  delete from public.orders where id = o_id;
  perform public.recalc_client(c_id);

  return jsonb_build_object('order_no', o.order_no, 'receipts', files, 'photos', pics);
end $$;

-- ------------------------------------------------------------------
-- Устройства для пушей: приложение сообщает свой токен после входа
-- и забирает его при выходе.
-- ------------------------------------------------------------------
create table if not exists public.device_tokens (
  token      text primary key,
  staff_id   uuid not null references public.staff(id) on delete cascade,
  platform   text not null check (platform in ('ios', 'android')),
  lang       text not null default 'pl',
  updated_at timestamptz not null default now()
);
create index if not exists device_tokens_staff_idx on public.device_tokens (staff_id);
alter table public.device_tokens enable row level security;

drop policy if exists device_tokens_own on public.device_tokens;
create policy device_tokens_own on public.device_tokens for select to authenticated
  using (staff_id = auth.uid());

create or replace function public.register_device(p_token text, p_platform text, p_lang text default 'pl')
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if public.staff_role() is null then return false; end if;
  if coalesce(length(p_token), 0) < 20 or p_platform not in ('ios', 'android') then return false; end if;
  insert into public.device_tokens (token, staff_id, platform, lang)
  values (p_token, auth.uid(), p_platform, case when p_lang in ('pl', 'ru', 'en') then p_lang else 'pl' end)
  on conflict (token) do update
    set staff_id = excluded.staff_id, platform = excluded.platform, lang = excluded.lang, updated_at = now();
  return true;
end $$;

create or replace function public.unregister_device(p_token text)
returns boolean language sql security definer set search_path = public as $$
  delete from public.device_tokens where token = p_token and staff_id = auth.uid() returning true
$$;

revoke all on function public.register_device(text, text, text) from public, anon;
grant execute on function public.register_device(text, text, text) to authenticated;
revoke all on function public.unregister_device(text) from public, anon;
grant execute on function public.unregister_device(text) to authenticated;

-- ------------------------------------------------------------------
-- Сторожа прав: `not (is_office() or master_id = auth.uid())` у заказа без
-- мастера даёт NULL, а `if NULL` не срабатывает — мастер мог сменить
-- статус или назвать цену в чужом, ещё не назначенном заказе.
-- Те же функции, сторож переписан на `is not true`.
-- ------------------------------------------------------------------
create or replace function public.set_order_status(o_id uuid, new_status text)
returns public.orders language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = o_id for update;
  if o is null then raise exception 'заказ не найден'; end if;
  if (public.is_office() or o.master_id = auth.uid()) is not true then raise exception 'чужой заказ'; end if;
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
end $$;

create or replace function public.set_scope_quote(o_id uuid, p_price numeric DEFAULT NULL::numeric, p_onsite boolean DEFAULT false)
returns public.orders language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = o_id for update;
  if o is null then raise exception 'заказ не найден'; end if;
  if (public.is_office() or o.master_id = auth.uid()) is not true then raise exception 'чужой заказ'; end if;
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

notify pgrst, 'reload schema';
