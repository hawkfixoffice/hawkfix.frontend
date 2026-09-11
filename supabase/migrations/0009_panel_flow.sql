-- ============================================================
-- Заявка с сайта → клиент → заказ → предложение мастеру.
-- Всё автоматически: человек на сайте нажал «отправить», а в панели
-- уже висит заказ у подходящего мастера.
-- ============================================================

-- Группы работ заказа выводим из позиций сметы: ключ позиции совпадает
-- с ключом прайса, а группа уже есть в контентной таблице price_items.
create or replace function public.order_groups(items jsonb)
returns text[] language sql stable as $$
  select coalesce(array_agg(distinct i.group_key), '{}')
    from jsonb_array_elements(coalesce(items, '[]'::jsonb)) e
    join public.price_items i on i.key = e->>'key'
$$;

-- ---------- заявка превращается в клиента и заказ ----------
create or replace function public.order_from_lead(l_id uuid)
returns public.orders language plpgsql security definer set search_path = public as $$
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
    lead_id, client_id, address, district, scheduled_date, scheduled_slot,
    urgent, items, group_keys, totals, quoted_total, hours, comment, deadline_at)
  values (
    l.id, c.id, l.address, l.district, l.when_date, l.when_time,
    coalesce(l.urgent, false), coalesce(l.items, '[]'::jsonb),
    public.order_groups(l.items), coalesce(l.totals, '{}'::jsonb),
    coalesce((l.totals->>'total')::numeric, 0),
    coalesce((l.totals->>'hours')::numeric, 0),
    l.comment,
    -- срок: конец выбранного окна, а если даты нет — сутки на срочный,
    -- трое суток на обычный заказ
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
end $$;

-- Новая заявка сразу становится заказом
create or replace function public.leads_to_orders() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.order_from_lead(new.id);
  return new;
end $$;

drop trigger if exists leads_after_insert on public.leads;
create trigger leads_after_insert after insert on public.leads
for each row execute function public.leads_to_orders();

-- ---------- сводка для дашборда ----------
-- Одним запросом, чтобы панель не делала десяток обращений подряд.
create or replace function public.dash_office(days int default 30)
returns jsonb language sql stable security definer set search_path = public as $$
  with span as (select (now() - make_interval(days => days)) as from_ts),
  prev as (select (now() - make_interval(days => days * 2)) as from_ts,
                  (now() - make_interval(days => days)) as to_ts),
  done as (
    select o.*, r.gross, r.master_share, r.company_share, r.company_net, r.materials_cost
      from public.orders o join public.order_reports r on r.order_id = o.id
     where o.finished_at >= (select from_ts from span)),
  done_prev as (
    select r.gross from public.orders o join public.order_reports r on r.order_id = o.id
     where o.finished_at >= (select from_ts from prev) and o.finished_at < (select to_ts from prev))
  select jsonb_build_object(
    'revenue',       coalesce((select sum(gross) from done), 0),
    'revenue_prev',  coalesce((select sum(gross) from done_prev), 0),
    'company_net',   coalesce((select sum(company_net) from done), 0),
    'masters_paid',  coalesce((select sum(master_share) from done), 0),
    'materials',     coalesce((select sum(materials_cost) from done), 0),
    'done_count',    (select count(*) from done),
    'done_prev',     (select count(*) from done_prev),
    'avg_check',     coalesce((select round(avg(gross), 0) from done), 0),
    'active',        (select count(*) from public.orders where status in ('assigned','en_route','shopping','in_progress')),
    'offered',       (select count(*) from public.orders where status = 'offered'),
    'unassigned',    (select count(*) from public.orders where status = 'new'),
    'overdue',       (select count(*) from public.orders
                       where status not in ('done','cancelled') and deadline_at < now()),
    'by_day',        coalesce((select jsonb_agg(x order by x->>'d')
                       from (select jsonb_build_object('d', to_char(d.day, 'YYYY-MM-DD'),
                                    'revenue', coalesce(sum(done.gross), 0),
                                    'orders', count(done.id)) as x
                               from generate_series((select from_ts from span)::date, current_date, '1 day') d(day)
                               left join done on done.finished_at::date = d.day
                              group by d.day) s), '[]'::jsonb),
    'top_groups',    coalesce((select jsonb_agg(x) from (
                        select jsonb_build_object('group_key', g, 'n', count(*)) as x
                          from public.orders o, unnest(o.group_keys) g
                         where o.created_at >= (select from_ts from span)
                         group by g order by count(*) desc limit 6) s), '[]'::jsonb),
    'crew',          coalesce((select jsonb_agg(x order by x->>'full_name') from (
                        select jsonb_build_object(
                                 'id', s.id, 'full_name', s.full_name, 'capacity', s.capacity,
                                 'load', public.master_load(s.id),
                                 'lat', l.lat, 'lon', l.lon, 'seen_at', l.updated_at,
                                 'month_share', coalesce((select sum(r.master_share) from public.order_reports r
                                    where r.master_id = s.id and r.created_at >= date_trunc('month', now())), 0)) as x
                          from public.staff s left join public.staff_locations l on l.staff_id = s.id
                         where s.role = 'master' and s.active) q), '[]'::jsonb),
    'new_leads',     (select count(*) from public.leads where created_at >= (select from_ts from span))
  )
$$;

-- Сводка мастера: только его деньги и его заказы
create or replace function public.dash_master()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'month_share',  coalesce((select sum(master_share) from public.order_reports
                               where master_id = auth.uid() and created_at >= date_trunc('month', now())), 0),
    'month_orders', (select count(*) from public.order_reports
                      where master_id = auth.uid() and created_at >= date_trunc('month', now())),
    'prev_share',   coalesce((select sum(master_share) from public.order_reports
                               where master_id = auth.uid()
                                 and created_at >= date_trunc('month', now()) - interval '1 month'
                                 and created_at <  date_trunc('month', now())), 0),
    'active',       (select count(*) from public.orders
                      where master_id = auth.uid() and status in ('assigned','en_route','shopping','in_progress')),
    'overdue',      (select count(*) from public.orders
                      where master_id = auth.uid() and status not in ('done','cancelled') and deadline_at < now()),
    'pending',      (select count(*) from public.order_offers
                      where master_id = auth.uid() and status = 'pending' and expires_at > now()),
    'by_day',       coalesce((select jsonb_agg(x order by x->>'d') from (
                       select jsonb_build_object('d', to_char(d.day, 'YYYY-MM-DD'),
                              'revenue', coalesce(sum(r.master_share), 0)) as x
                         from generate_series(current_date - 29, current_date, '1 day') d(day)
                         left join public.order_reports r
                           on r.master_id = auth.uid() and r.created_at::date = d.day
                        group by d.day) s), '[]'::jsonb)
  )
$$;
