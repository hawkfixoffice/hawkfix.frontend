-- ============================================================
-- Рабочее время и «какие заказы вёл» — для тех, кто не ездит.
--
-- У мастера есть отчёты и деньги, у менеджера — ничего: его профиль
-- показывал пустые денежные блоки. Менеджер работает в панели, значит
-- мерить надо панель: сколько времени он был в сети по дням и каких
-- заказов касался (менял статус, назначал мастера, правил карточку).
-- ============================================================

/* Отметка присутствия: одна строка на минуту на человека.
   Панель шлёт удар сердца раз в минуту, пока вкладка открыта. Минуты
   потом складываются в рабочее время — секунды здесь ни к чему. */
create table if not exists public.staff_seen (
  staff_id uuid not null references public.staff(id) on delete cascade,
  minute   timestamptz not null,
  primary key (staff_id, minute)
);

create index if not exists staff_seen_minute_idx on public.staff_seen (minute desc);

alter table public.staff_seen enable row level security;

drop policy if exists seen_read on public.staff_seen;
create policy seen_read on public.staff_seen for select
  using (staff_id = auth.uid() or public.is_office());

/** Удар сердца из панели. Минута округляется, поэтому чаще раза в минуту
 *  писать бессмысленно — повторный вызов ничего не добавит. */
create or replace function public.ping_online()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.staff_seen (staff_id, minute)
  select auth.uid(), date_trunc('minute', now())
   where exists (select 1 from public.staff where id = auth.uid() and active)
  on conflict do nothing
$$;

revoke all on function public.ping_online() from public;
grant execute on function public.ping_online() to authenticated;

/** Рабочее время и заказы сотрудника.
 *
 *  Время в сети считаем по отметкам присутствия: минута с отметкой —
 *  минута работы. Разрыв больше пяти минут считается перерывом, поэтому
 *  «с 9:00 до 18:00» и «шесть часов в сети» — разные числа, и это честно.
 *
 *  «Вёл заказ» = оставил в нём след: сменил статус, назначил мастера,
 *  закрыл отчётом. След остаётся в order_events.actor_id. */
create or replace function public.staff_activity(p_staff uuid, days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from date := (now() at time zone 'Europe/Warsaw')::date - (greatest(days, 1) - 1);
  out jsonb;
begin
  if not (p_staff = auth.uid() or public.is_office()) then
    raise exception 'чужой профиль';
  end if;

  with d as (
    select generate_series(v_from, (now() at time zone 'Europe/Warsaw')::date, interval '1 day')::date as day
  ),
  seen as (
    select (minute at time zone 'Europe/Warsaw')::date as day,
           count(*) as minutes,
           min(minute) as first_at,
           max(minute) as last_at
      from public.staff_seen
     where staff_id = p_staff
       and (minute at time zone 'Europe/Warsaw')::date >= v_from
     group by 1
  ),
  acts as (
    select (e.at at time zone 'Europe/Warsaw')::date as day, count(*) as n,
           count(distinct e.order_id) as orders
      from public.order_events e
     where e.actor_id = p_staff
       and (e.at at time zone 'Europe/Warsaw')::date >= v_from
     group by 1
  ),
  touched as (
    select e.order_id,
           count(*) as actions,
           max(e.at) as last_at,
           (array_agg(e.type order by e.at desc))[1] as last_type
      from public.order_events e
     where e.actor_id = p_staff
     group by e.order_id
     order by max(e.at) desc
     limit 50
  )
  select jsonb_build_object(
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object(
                 'd', d.day,
                 'minutes', coalesce(s.minutes, 0),
                 'first_at', s.first_at,
                 'last_at', s.last_at,
                 'actions', coalesce(a.n, 0),
                 'orders', coalesce(a.orders, 0)) order by d.day), '[]'::jsonb)
                from d left join seen s on s.day = d.day left join acts a on a.day = d.day),
    'minutes_total', (select coalesce(sum(minutes), 0) from seen),
    'days_worked',   (select count(*) from seen where minutes >= 5),
    'minutes_today', (select coalesce(minutes, 0) from seen
                       where day = (now() at time zone 'Europe/Warsaw')::date),
    'last_seen',     (select max(minute) from public.staff_seen where staff_id = p_staff),
    'orders_touched',(select count(distinct order_id) from public.order_events where actor_id = p_staff),
    'actions_total', (select count(*) from public.order_events where actor_id = p_staff),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object(
                 'id', t.order_id, 'order_no', o.order_no, 'status', o.status,
                 'client', c.name, 'address', o.address,
                 'actions', t.actions, 'last_at', t.last_at, 'last_type', t.last_type)), '[]'::jsonb)
                from touched t
                join public.orders o on o.id = t.order_id
                left join public.clients c on c.id = o.client_id)
  ) into out;

  return out;
end $$;

revoke all on function public.staff_activity(uuid, int) from public;
grant execute on function public.staff_activity(uuid, int) to authenticated;

-- Ручное назначение тоже должно оставлять след с автором
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

  insert into public.order_events (order_id, actor_id, type, payload)
  values (o_id, auth.uid(), 'assigned', jsonb_build_object('master_id', m_id, 'manual', true));

  return o;
end $$;

revoke all on function public.assign_master(uuid, uuid) from public;
grant execute on function public.assign_master(uuid, uuid) to authenticated;

-- Правка координат — тоже след в заказе
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

-- Отметки старше полугода не нужны никому: место и запросы дороже
select cron.schedule('seen_cleanup', '25 4 * * *',
  $$delete from public.staff_seen where minute < now() - interval '180 days'$$)
 where not exists (select 1 from cron.job where jobname = 'seen_cleanup');

notify pgrst, 'reload schema';
