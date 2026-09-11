-- ============================================================
-- Менеджер — диспетчер, а не финансист: ему нужны заказы, сроки
-- и занятость бригады, а выручка и доли фирмы — нет.
-- Закрываем это в базе, а не только в интерфейсе: скрытая в UI
-- цифра всё равно уходит по сети и видна в консоли браузера.
-- ============================================================

-- Сводка с деньгами — только администратору
create or replace function public.dash_office(days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'только для администратора'; end if;
  return public.dash_range(now() - make_interval(days => days), now() + interval '1 day');
end $$;

create or replace function public.dash_range_guarded(from_ts timestamptz, to_ts timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'только для администратора'; end if;
  return public.dash_range(from_ts, to_ts);
end $$;

revoke execute on function public.dash_range(timestamptz, timestamptz) from authenticated, anon;

-- Сводка диспетчера: сроки, очередь, занятость — без единой суммы
create or replace function public.dash_manager()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'unassigned',  (select count(*) from public.orders where status = 'new'),
    'offered',     (select count(*) from public.orders where status = 'offered'),
    'active',      (select count(*) from public.orders
                     where status in ('assigned','en_route','shopping','in_progress')),
    'overdue',     (select count(*) from public.orders
                     where status not in ('done','cancelled') and deadline_at < now()),
    'today',       (select count(*) from public.orders
                     where scheduled_date = current_date and status not in ('done','cancelled')),
    'tomorrow',    (select count(*) from public.orders
                     where scheduled_date = current_date + 1 and status not in ('done','cancelled')),
    'done_today',  (select count(*) from public.orders
                     where finished_at::date = current_date),
    'new_leads',   (select count(*) from public.leads where created_at >= current_date),
    -- сколько в среднем мастер думает над предложением: по этому видно,
    -- нужно ли менять срок подтверждения или добавлять людей
    'accept_min',  coalesce((select round(avg(extract(epoch from (answered_at - offered_at)) / 60))
                               from public.order_offers
                              where status = 'accepted' and answered_at >= now() - interval '30 days'), 0),
    'declined',    (select count(*) from public.order_offers
                     where status in ('declined','expired') and offered_at >= now() - interval '7 days'),
    'crew',        coalesce((select jsonb_agg(x order by x->>'full_name') from (
                     select jsonb_build_object(
                              'id', s.id, 'full_name', s.full_name, 'avatar_path', s.avatar_path,
                              'capacity', s.capacity, 'load', public.master_load(s.id),
                              'lat', l.lat, 'lon', l.lon, 'seen_at', l.updated_at,
                              'today', (select count(*) from public.orders o
                                         where o.master_id = s.id and o.scheduled_date = current_date
                                           and o.status not in ('done','cancelled')),
                              'pending', (select count(*) from public.order_offers f
                                           where f.master_id = s.id and f.status = 'pending')) as x
                       from public.staff s left join public.staff_locations l on l.staff_id = s.id
                      where s.role = 'master' and s.active) q), '[]'::jsonb),
    'by_day',      coalesce((select jsonb_agg(x order by x->>'d') from (
                     select jsonb_build_object('d', to_char(d.day, 'YYYY-MM-DD'),
                            'orders', count(o.id)) as x
                       from generate_series(current_date - 13, current_date, '1 day') d(day)
                       left join public.orders o on o.created_at::date = d.day
                      group by d.day) s), '[]'::jsonb)
  )
$$;

-- Отчёты и деньги — только администратор (менеджеру не нужны и не видны)
drop policy if exists reports_office on public.order_reports;
create policy reports_admin_read on public.order_reports for select using (public.is_admin());

-- Суммы, которые клиент потратил, тоже относятся к деньгам фирмы:
-- менеджеру оставляем контакты, историю и статус, но не итоги.
create or replace view public.clients_desk
with (security_invoker = off) as
  select c.id, c.name, c.phone, c.email, c.address, c.district, c.status,
         c.orders_count, c.note, c.first_order_at, c.last_order_at, c.created_at
    from public.clients c
   where public.is_staff();
grant select on public.clients_desk to authenticated;

notify pgrst, 'reload schema';
