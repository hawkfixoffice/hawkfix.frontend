-- ============================================================
-- «Кому сейчас предложен заказ» и «этот заказ никто не взял».
--
-- Автоподбор молчалив: заказ уходит мастеру, тот может отказаться или не
-- ответить, ночью рассылка вообще заморожена. Офису при этом было не видно
-- ни кому заказ ушёл, ни того, что заказ завис. Теперь и то и другое видно
-- на дашборде, и мастера можно назначить руками прямо оттуда.
-- ============================================================

-- Предложение, снятое офисом при ручном назначении — это не отказ мастера
alter table public.order_offers drop constraint if exists order_offers_status_check;
alter table public.order_offers add constraint order_offers_status_check
  check (status = any (array['pending', 'accepted', 'declined', 'expired', 'cancelled']));

/** Заказы, за которыми офису стоит следить.
 *
 *  Причина у каждого своя, и от неё зависит, надо ли вмешиваться:
 *    offered  — сейчас у мастера, идёт время на ответ. Ничего не делаем;
 *    quiet    — ночь, рассылка заморожена до утра. Ничего не делаем;
 *    refused  — мастера отказались или не ответили. Нужен человек;
 *    no_master — некому предложить: нет свободного с нужными умениями;
 *    waiting  — только что создан, уйдёт ближайшей рассылкой. */
create or replace function public.orders_attention()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare out jsonb;
begin
  if not public.is_office() then return '[]'::jsonb; end if;

  with base as (
    select o.id, o.order_no, o.status, o.address, o.district, o.urgent,
           o.scheduled_date, o.scheduled_slot, o.deadline_at, o.quoted_total,
           o.created_at, o.group_keys, c.name as client_name, c.phone as client_phone
      from public.orders o
      left join public.clients c on c.id = o.client_id
     where o.status in ('new', 'offered')
  ),
  cur as (
    select f.order_id, f.expires_at, f.offered_at,
           jsonb_build_object('id', s.id, 'name', s.full_name,
                              'avatar_path', s.avatar_path, 'expires_at', f.expires_at) as who
      from public.order_offers f
      join public.staff s on s.id = f.master_id
     where f.status = 'pending'
  ),
  tried as (
    select f.order_id,
           jsonb_agg(jsonb_build_object('name', s.full_name, 'status', f.status,
                                        'at', coalesce(f.answered_at, f.expires_at))
                     order by f.offered_at) as list,
           count(*) filter (where f.status in ('declined', 'expired')) as refused
      from public.order_offers f
      join public.staff s on s.id = f.master_id
     where f.status in ('declined', 'expired', 'cancelled')
     group by f.order_id
  ),
  failed as (
    select distinct e.order_id
      from public.order_events e
     where e.type = 'dispatch_failed'
       and e.at > now() - interval '2 days'
  )
  select jsonb_agg(row_to_json(x)::jsonb order by x.weight desc, x.urgent desc, x.deadline_at nulls last)
    into out
  from (
    select b.*,
           c.who as offered_to,
           coalesce(t.list, '[]'::jsonb) as tried,
           coalesce(t.refused, 0) as refused,
           case
             when c.order_id is not null then 'offered'
             when coalesce(t.refused, 0) > 0 then 'refused'
             when f.order_id is not null then 'no_master'
             when public.is_quiet_now() then 'quiet'
             else 'waiting'
           end as reason,
           -- чем выше вес, тем раньше нужен человек
           case
             when coalesce(t.refused, 0) > 0 then 3
             when f.order_id is not null then 3
             when c.order_id is not null then 1
             else 2
           end as weight
      from base b
      left join cur c on c.order_id = b.id
      left join tried t on t.order_id = b.id
      left join failed f on f.order_id = b.id
  ) x;

  return coalesce(out, '[]'::jsonb);
end $$;

revoke all on function public.orders_attention() from public;
grant execute on function public.orders_attention() to authenticated;

/** Назначить мастера руками — прямо с дашборда.
 *
 *  Снимает висящее предложение (это не отказ мастера, поэтому отдельный
 *  статус `cancelled`), ставит исполнителя и переводит заказ в «назначен».
 *  Подтверждение мастера здесь уже не спрашиваем: решение принял офис. */
create or replace function public.assign_master(o_id uuid, m_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare o public.orders; m public.staff;
begin
  if not public.is_office() then raise exception 'назначать мастера может только офис'; end if;

  select * into m from public.staff where id = m_id and role = 'master' and active;
  if m is null then raise exception 'мастер не найден или отключён'; end if;

  update public.order_offers set status = 'cancelled', answered_at = now()
   where order_id = o_id and status = 'pending';

  update public.orders set master_id = m_id, status = 'assigned'
   where id = o_id and status in ('new', 'offered')
   returning * into o;
  if o is null then raise exception 'заказ уже в работе или закрыт'; end if;

  insert into public.order_events (order_id, type, payload)
  values (o_id, 'assigned', jsonb_build_object('master_id', m_id, 'by', auth.uid(), 'manual', true));

  return o;
end $$;

revoke all on function public.assign_master(uuid, uuid) from public;
grant execute on function public.assign_master(uuid, uuid) to authenticated;

/** Предложить заказ заново — когда мастер отказался, а офис хочет
 *  дать автоподбору второй заход, а не назначать сам. */
create or replace function public.redispatch_order(o_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare st text;
begin
  if not public.is_office() then raise exception 'этим занимается офис'; end if;
  perform public.dispatch_order(o_id);
  select status into st from public.orders where id = o_id;
  return jsonb_build_object('ok', st = 'offered', 'status', st, 'quiet', public.is_quiet_now());
end $$;

revoke all on function public.redispatch_order(uuid) from public;
grant execute on function public.redispatch_order(uuid) to authenticated;

-- Подбор кандидатов нужен офису в окне назначения; мастеру он ни к чему
revoke all on function public.rank_masters(uuid) from public;
grant execute on function public.rank_masters(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Чистка журнала: «некому предложить» пишем один раз, а не каждую минуту
-- ------------------------------------------------------------
--
-- dispatch_pending крутится в cron раз в минуту и на каждый заказ без
-- подходящего мастера писал событие. За сутки это дало 1393 записи из 1420 —
-- лента заказа превращалась в мусор, а настоящие события в ней терялись.
-- Теперь повторное «dispatch_failed» пишется не чаще раза в час.

create or replace function public.dispatch_order(o_id uuid)
returns public.order_offers
language plpgsql
security definer
set search_path = public
as $function$
declare
  pick record;
  ttl int;
  offer public.order_offers;
begin
  -- Ночью не будим: заказ остаётся новым и уйдёт мастеру утром,
  -- этим занимается dispatch_pending из расписания.
  if public.is_quiet_now() then
    update public.orders set status = 'new' where id = o_id and status <> 'new';
    if not exists (
      select 1 from public.order_events
       where order_id = o_id and type = 'frozen_night' and at > now() - interval '1 hour')
    then
      insert into public.order_events (order_id, type, payload)
      values (o_id, 'frozen_night', jsonb_build_object('until', public.setting_time('quiet_to', '05:00')));
    end if;
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
    -- Повтор не чаще раза в час: причина не меняется от того, что крон
    -- проверил её шестьдесят раз подряд
    if not exists (
      select 1 from public.order_events
       where order_id = o_id and type = 'dispatch_failed' and at > now() - interval '1 hour')
    then
      insert into public.order_events (order_id, type, payload)
      values (o_id, 'dispatch_failed', '{"reason":"нет свободного мастера с нужными умениями"}'::jsonb);
    end if;
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
end $function$;

-- разовая уборка накопившегося: оставляем по одному событию в час на заказ
delete from public.order_events e
 where e.type = 'dispatch_failed'
   and exists (
     select 1 from public.order_events k
      where k.order_id = e.order_id and k.type = 'dispatch_failed'
        and date_trunc('hour', k.at) = date_trunc('hour', e.at)
        and k.at > e.at);
