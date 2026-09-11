-- ============================================================
-- Ночь и вечер: сколько времени у мастера на ответ и когда
-- предложения вообще не рассылаются.
--
--   08:00–20:00  — рабочий день, ответ за offer_ttl_min (20 мин)
--   20:00–23:00, 05:00–08:00 — ответ за offer_ttl_night_min (2 часа)
--   23:00–05:00  — тишина: мастера спят, заказ ждёт утра
-- ============================================================

insert into public.panel_settings (key, value, note) values
  ('offer_ttl_night_min', '120'::jsonb, 'Сколько минут на подтверждение вечером и ранним утром'),
  ('day_from',   '"08:00"'::jsonb, 'Начало рабочего дня: с него действует обычный срок ответа'),
  ('day_to',     '"20:00"'::jsonb, 'Конец рабочего дня'),
  ('quiet_from', '"23:00"'::jsonb, 'С этого часа заказы не рассылаем — мастера спят'),
  ('quiet_to',   '"05:00"'::jsonb, 'До этого часа заказы не рассылаем')
on conflict (key) do nothing;

create or replace function public.setting_time(k text, fallback text)
returns time language sql stable as $$
  select coalesce((select (value #>> '{}') from public.panel_settings where key = k), fallback)::time
$$;

/** Сейчас тишина? Считаем по варшавскому времени, а не по UTC:
 *  сервер в другой зоне, а спят мастера по местному. */
create or replace function public.is_quiet_now()
returns boolean language sql stable as $$
  with t as (select (now() at time zone 'Europe/Warsaw')::time as now_local,
                    public.setting_time('quiet_from', '23:00') as q_from,
                    public.setting_time('quiet_to', '05:00') as q_to)
  select case when q_from < q_to then now_local >= q_from and now_local < q_to
              else now_local >= q_from or now_local < q_to end
    from t
$$;

/** Сколько минут даём на ответ прямо сейчас. */
create or replace function public.offer_ttl_now()
returns int language sql stable as $$
  with t as (select (now() at time zone 'Europe/Warsaw')::time as now_local,
                    public.setting_time('day_from', '08:00') as d_from,
                    public.setting_time('day_to', '20:00') as d_to)
  select case when now_local >= d_from and now_local < d_to
              then public.setting_num('offer_ttl_min', 20)::int
              else public.setting_num('offer_ttl_night_min', 120)::int end
    from t
$$;

-- ---------- предложение с учётом времени суток ----------
create or replace function public.dispatch_order(o_id uuid)
returns public.order_offers language plpgsql security definer set search_path = public as $$
declare
  pick record;
  ttl int;
  offer public.order_offers;
begin
  -- Ночью не будим: заказ остаётся новым и уйдёт мастеру утром,
  -- этим занимается dispatch_pending из расписания.
  if public.is_quiet_now() then
    update public.orders set status = 'new' where id = o_id and status <> 'new';
    insert into public.order_events (order_id, type, payload)
    values (o_id, 'frozen_night', jsonb_build_object('until', public.setting_time('quiet_to', '05:00')));
    return null;
  end if;

  ttl := public.offer_ttl_now();

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
          jsonb_build_object('load', pick.load, 'capacity', pick.capacity,
                             'distance_km', pick.distance_km, 'ttl_min', ttl),
          now() + make_interval(mins => ttl))
  returning * into offer;

  update public.orders set status = 'offered' where id = o_id;
  insert into public.order_events (order_id, type, payload)
  values (o_id, 'offered', jsonb_build_object('master_id', pick.master_id, 'score', pick.score, 'ttl_min', ttl));
  return offer;
end $$;

/** Заказы, которые остались без предложения (ночная тишина, все отказались,
 *  не было свободных рук), нужно пробовать раздать снова. */
create or replace function public.dispatch_pending()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; o record;
begin
  if public.is_quiet_now() then return 0; end if;
  for o in
    select id from public.orders
     where status = 'new'
       and created_at > now() - interval '7 days'
       and not exists (select 1 from public.order_offers f
                        where f.order_id = orders.id and f.status = 'pending')
     order by urgent desc, deadline_at nulls last
     limit 20
  loop
    perform public.dispatch_order(o.id);
    n := n + 1;
  end loop;
  return n;
end $$;

select cron.schedule('hawkfix-dispatch-pending', '* * * * *', $$select public.dispatch_pending()$$)
 where not exists (select 1 from cron.job where jobname = 'hawkfix-dispatch-pending');

-- Клиенту в панели полезно видеть, что сейчас тишина и почему
create or replace function public.dispatch_window()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'quiet', public.is_quiet_now(),
    'ttl_min', public.offer_ttl_now(),
    'quiet_from', public.setting_time('quiet_from', '23:00'),
    'quiet_to', public.setting_time('quiet_to', '05:00'),
    'local_time', to_char((now() at time zone 'Europe/Warsaw')::time, 'HH24:MI')
  )
$$;
