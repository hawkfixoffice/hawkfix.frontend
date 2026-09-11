-- ============================================================
-- Координаты заявки доходят до заказа.
--
-- Адрес человек выбирает из подсказок геокодера, то есть широта и долгота
-- известны уже в форме — но в заявку они не попадали, и заказ приходил в
-- панель без точки на карте. Маршрут «мастер → клиент» построить было не из
-- чего: карта показывала только мастера.
-- ============================================================

alter table public.leads add column if not exists lat double precision;
alter table public.leads add column if not exists lon double precision;

-- Заказ забирает координаты из заявки. Остальное — как было.
create or replace function public.order_from_lead(l_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
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

  -- клиент узнаётся по телефону: тот же человек не должен двоиться в CRM
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
    urgent, items, group_keys, totals, quoted_total, hours, comment, deadline_at)
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
    end)
  returning * into o;

  insert into public.order_events (order_id, type, payload)
  values (o.id, 'created', jsonb_build_object('from_lead', l.id, 'order_no', o.order_no));

  perform public.dispatch_order(o.id);
  return o;
end $function$;

/** Панель дописывает координаты заказу, если их не было.
 *
 *  Старые заказы и заявки, где адрес вписали руками, приходят без точки.
 *  Панель геокодирует адрес и присылает результат сюда — так координаты
 *  считаются один раз, а не на каждом открытии карточки. Права проверяем
 *  сами: свой заказ правит мастер, любой — админ и менеджер. */
create or replace function public.set_order_coords(o_id uuid, p_lat double precision, p_lon double precision)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_role text; v_staff uuid;
begin
  if p_lat is null or p_lon is null
     or abs(p_lat) > 90 or abs(p_lon) > 180 then return false; end if;

  -- id сотрудника и есть его id в auth: отдельной колонки связи нет
  select id, role into v_staff, v_role from public.staff where id = auth.uid();
  if v_staff is null then return false; end if;

  update public.orders set lat = p_lat, lon = p_lon
   where id = o_id
     and lat is null
     and (v_role in ('admin', 'manager') or master_id = v_staff);

  return found;
end $$;

revoke all on function public.set_order_coords(uuid, double precision, double precision) from public;
grant execute on function public.set_order_coords(uuid, double precision, double precision) to authenticated;

-- Заявке координаты пишет тот же путь, что и всё остальное: RPC `submit_lead`
create or replace function public.submit_lead(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
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
    when_date, when_time, comment, urgent, items, totals, page, user_agent, source
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
    'rpc'
  ) returning * into v_row;

  return jsonb_build_object('ok', true, 'id', v_row.id, 'orderNo', v_row.order_no);
end;
$$;

revoke all on function public.submit_lead(jsonb) from public;
grant execute on function public.submit_lead(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
