-- ============================================================
-- Серверная логика панели: подбор мастера, подтверждение заказа,
-- отчёт и деньги. Всё, что касается денег и назначений, живёт здесь,
-- а не в браузере: клиент может прислать любые числа.
-- ============================================================

create or replace function public.setting_num(k text, fallback numeric)
returns numeric language sql stable as $$
  select coalesce((select (value #>> '{}')::numeric from public.panel_settings where key = k), fallback)
$$;

-- ---------- сколько заказов у мастера прямо сейчас ----------
create or replace function public.master_load(m uuid)
returns int language sql stable as $$
  select count(*)::int from public.orders
   where master_id = m and status in ('assigned','en_route','shopping','in_progress')
$$;

-- Расстояние по большому кругу, км
create or replace function public.km_between(lat1 double precision, lon1 double precision,
                                             lat2 double precision, lon2 double precision)
returns double precision language sql immutable as $$
  select 6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)))
$$;

-- ---------- подбор мастера ----------
-- Считаем три вещи: умеет ли (иначе кандидат отпадает), насколько занят
-- и как далеко от адреса. Возвращаем список, чтобы админ видел, из чего
-- сложился выбор, а не только итог.
create or replace function public.rank_masters(o_id uuid)
returns table (master_id uuid, full_name text, score numeric, skills_ok boolean,
               load int, capacity int, distance_km numeric)
language sql stable security definer set search_path = public as $$
  with ord as (select * from public.orders where id = o_id),
  cand as (
    select s.id, s.full_name, s.capacity,
           -- все ли группы работ заказа мастер умеет
           (select count(*) from unnest((select group_keys from ord)) g
             where exists (select 1 from public.staff_skills k
                            where k.staff_id = s.id and k.group_key = g)) as covered,
           coalesce(array_length((select group_keys from ord), 1), 0) as needed,
           public.master_load(s.id) as load,
           l.lat, l.lon
      from public.staff s
      left join public.staff_locations l on l.staff_id = s.id
     where s.role = 'master' and s.active
  )
  select c.id, c.full_name,
         round((
           -- умения важнее всего, затем свободные руки, затем дорога
           (case when c.needed = 0 or c.covered = c.needed then 50
                 else 50.0 * c.covered / nullif(c.needed, 0) end)
           + greatest(0, c.capacity - c.load) * 12
           + case when c.lat is null or (select lat from ord) is null then 0
                  else greatest(0, 30 - public.km_between(c.lat, c.lon, (select lat from ord), (select lon from ord)) * 1.5)
             end)::numeric, 2) as score,
         (c.needed = 0 or c.covered = c.needed) as skills_ok,
         c.load, c.capacity,
         case when c.lat is null or (select lat from ord) is null then null
              else round(public.km_between(c.lat, c.lon, (select lat from ord), (select lon from ord))::numeric, 1) end
    from cand c
   where c.load < c.capacity
   order by skills_ok desc, score desc
$$;

-- ---------- предложить заказ следующему подходящему мастеру ----------
create or replace function public.dispatch_order(o_id uuid)
returns public.order_offers language plpgsql security definer set search_path = public as $$
declare
  pick record;
  ttl int := public.setting_num('offer_ttl_min', 20)::int;
  offer public.order_offers;
begin
  -- тем, кто уже отказался или чьё предложение протухло, второй раз не шлём
  select * into pick from public.rank_masters(o_id) r
   where r.skills_ok
     and not exists (select 1 from public.order_offers f
                      where f.order_id = o_id and f.master_id = r.master_id
                        and f.status in ('declined','expired','pending'))
   limit 1;

  if pick is null then
    update public.orders set status = 'new', master_id = null where id = o_id;
    insert into public.order_events (order_id, type, payload)
    values (o_id, 'dispatch_failed', '{"reason":"нет свободного мастера с нужными умениями"}'::jsonb);
    return null;
  end if;

  insert into public.order_offers (order_id, master_id, score, reason, expires_at)
  values (o_id, pick.master_id, pick.score,
          jsonb_build_object('load', pick.load, 'capacity', pick.capacity, 'distance_km', pick.distance_km),
          now() + make_interval(mins => ttl))
  returning * into offer;

  update public.orders set status = 'offered' where id = o_id;
  insert into public.order_events (order_id, type, payload)
  values (o_id, 'offered', jsonb_build_object('master_id', pick.master_id, 'score', pick.score));
  return offer;
end $$;

-- ---------- мастер принимает / отказывается ----------
create or replace function public.accept_offer(f_id uuid)
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
  return o;
end $$;

create or replace function public.decline_offer(f_id uuid, why text default null)
returns void language plpgsql security definer set search_path = public as $$
declare f public.order_offers;
begin
  select * into f from public.order_offers where id = f_id for update;
  if f is null or f.master_id <> auth.uid() then raise exception 'чужое предложение'; end if;
  update public.order_offers set status = 'declined', answered_at = now() where id = f_id;
  insert into public.order_events (order_id, actor_id, type, payload)
  values (f.order_id, f.master_id, 'declined', jsonb_build_object('why', why));
  perform public.dispatch_order(f.order_id);
end $$;

-- ---------- просроченные предложения уходят следующему ----------
create or replace function public.expire_offers()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; f record;
begin
  for f in select * from public.order_offers where status = 'pending' and expires_at < now() loop
    update public.order_offers set status = 'expired', answered_at = now() where id = f.id;
    insert into public.order_events (order_id, type, payload)
    values (f.order_id, 'offer_expired', jsonb_build_object('master_id', f.master_id));
    perform public.dispatch_order(f.order_id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- отчёт мастера и деньги ----------
-- Клиент присылает только факты (сколько наличными, сколько картой,
-- сколько ушло на материалы). Проценты и итоги считает сервер и
-- сохраняет в отчёт: ставки со временем меняются, а закрытый заказ
-- должен показывать те, что действовали в день работы.
create or replace function public.finish_order(
  o_id uuid, cash numeric, card numeric, materials numeric,
  receipt text default null, no_mat boolean default false, note text default null,
  photos text[] default '{}')
returns public.order_reports language plpgsql security definer set search_path = public as $$
declare
  o public.orders; r public.order_reports;
  m_pct numeric := public.setting_num('master_pct', 80);
  t_pct numeric := public.setting_num('tax_pct', 0);
  v_gross numeric; v_base numeric; v_master numeric; v_company numeric; v_tax numeric;
begin
  select * into o from public.orders where id = o_id for update;
  if o is null then raise exception 'заказ не найден'; end if;
  if not (public.is_admin() or o.master_id = auth.uid()) then raise exception 'чужой заказ'; end if;
  if o.status = 'done' then raise exception 'заказ уже закрыт'; end if;
  if coalesce(materials, 0) > 0 and not no_mat and receipt is null then
    raise exception 'нужен чек на материалы или отметка, что материалы не понадобились';
  end if;

  v_gross   := coalesce(cash, 0) + coalesce(card, 0);
  v_base    := greatest(v_gross - coalesce(materials, 0), 0);
  v_master  := round(v_base * m_pct / 100, 2);
  v_company := round(v_base - v_master, 2);
  v_tax     := round(v_company * t_pct / 100, 2);

  insert into public.order_reports (
    order_id, master_id, cash_amount, card_amount, materials_cost, receipt_path,
    no_materials, work_note, photo_paths, gross, base, master_share, company_share,
    tax_amount, company_net, master_pct, tax_pct)
  values (o_id, coalesce(o.master_id, auth.uid()), coalesce(cash, 0), coalesce(card, 0),
          coalesce(materials, 0), receipt, no_mat, note, coalesce(photos, '{}'),
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

  -- клиент: сумма и статус пересчитываются по фактическим деньгам
  update public.clients c set
    orders_count = (select count(*) from public.orders x where x.client_id = c.id and x.status = 'done'),
    spent_total  = (select coalesce(sum(rp.gross), 0) from public.orders x
                      join public.order_reports rp on rp.order_id = x.id
                     where x.client_id = c.id),
    last_order_at = now(),
    first_order_at = coalesce(c.first_order_at, now()),
    status = case
      when (select coalesce(sum(rp.gross), 0) from public.orders x
              join public.order_reports rp on rp.order_id = x.id where x.client_id = c.id) >= 3000 then 'vip'
      when (select count(*) from public.orders x where x.client_id = c.id and x.status = 'done') >= 2 then 'regular'
      else 'active' end
   where c.id = o.client_id;

  return r;
end $$;

-- ---------- смена статуса по ходу работы ----------
create or replace function public.set_order_status(o_id uuid, new_status text)
returns public.orders language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = o_id for update;
  if o is null then raise exception 'заказ не найден'; end if;
  if not (public.is_office() or o.master_id = auth.uid()) then raise exception 'чужой заказ'; end if;
  if new_status not in ('assigned','en_route','shopping','in_progress','cancelled') then
    raise exception 'этот статус так не ставится';
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
