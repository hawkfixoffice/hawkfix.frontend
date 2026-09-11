-- ============================================================
-- Панель, второй заход: налог с оборота, автоматические статусы
-- клиентов, аватары сотрудников, статистика мастера по месяцам.
-- ============================================================

-- ---------- 1. Налог считается со всей суммы ----------
-- Ryczałt в Польше платится с оборота, а не с прибыли: раньше налог
-- брался с доли фирмы и занижал реальную нагрузку.
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
  -- налог с оборота: платится со всей суммы, что прошла через кассу
  v_tax     := round(v_gross * t_pct / 100, 2);

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

  perform public.recalc_client(o.client_id);
  return r;
end $$;

-- ---------- 2. Статусы клиентов пересчитываются сами ----------
insert into public.panel_settings (key, value, note) values
  ('client_regular_orders', '3'::jsonb,   'Сколько закрытых заказов делают клиента постоянным'),
  ('client_vip_orders',     '5'::jsonb,   'Сколько заказов делают клиента VIP'),
  ('client_vip_spent',      '5000'::jsonb,'Или сколько потраченных злотых делают клиента VIP'),
  ('client_lost_days',      '180'::jsonb, 'Через сколько дней без заказов клиент считается уснувшим')
on conflict (key) do nothing;

-- Статус — следствие истории заказов, руками его не ставят.
create or replace function public.recalc_client(c_id uuid)
returns public.clients language plpgsql security definer set search_path = public as $$
declare
  c public.clients;
  n_done int; spent numeric; last_at timestamptz; first_at timestamptz;
  reg int := public.setting_num('client_regular_orders', 3)::int;
  vip_n int := public.setting_num('client_vip_orders', 5)::int;
  vip_s numeric := public.setting_num('client_vip_spent', 5000);
  lost_d int := public.setting_num('client_lost_days', 180)::int;
begin
  select count(*), coalesce(sum(r.gross), 0), max(o.finished_at), min(o.finished_at)
    into n_done, spent, last_at, first_at
    from public.orders o join public.order_reports r on r.order_id = o.id
   where o.client_id = c_id and o.status = 'done';

  update public.clients set
    orders_count = n_done,
    spent_total = spent,
    first_order_at = coalesce(first_at, first_order_at),
    last_order_at = coalesce(last_at, last_order_at),
    status = case
      when n_done = 0 then
        case when exists (select 1 from public.orders x where x.client_id = c_id
                            and x.status not in ('done','cancelled')) then 'active' else 'new' end
      when coalesce(last_at, now()) < now() - make_interval(days => lost_d) then 'lost'
      when n_done >= vip_n or spent >= vip_s then 'vip'
      when n_done >= reg then 'regular'
      else 'active' end
   where id = c_id
  returning * into c;
  return c;
end $$;

-- Клиент оживает, как только у него появился новый заказ
create or replace function public.orders_touch_client() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_client(new.client_id);
  return new;
end $$;

drop trigger if exists orders_after_insert on public.orders;
create trigger orders_after_insert after insert on public.orders
for each row execute function public.orders_touch_client();

-- Раз в сутки отмечаем уснувших: без этого статус менялся бы только
-- при новом заказе, а «уснул» — это как раз отсутствие заказов.
create or replace function public.recalc_all_clients() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; c record;
begin
  for c in select id from public.clients loop
    perform public.recalc_client(c.id);
    n := n + 1;
  end loop;
  return n;
end $$;

select cron.schedule('hawkfix-clients-refresh', '17 3 * * *', $$select public.recalc_all_clients()$$)
 where not exists (select 1 from cron.job where jobname = 'hawkfix-clients-refresh');

-- ---------- 3. Аватары сотрудников ----------
alter table public.staff add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit;

-- Свою фотографию ставит сам сотрудник, чужую — только администратор
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists avatars_write on storage.objects;
create policy avatars_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (public.is_admin() or name like auth.uid()::text || '/%'));

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (public.is_admin() or name like auth.uid()::text || '/%'));

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (public.is_admin() or name like auth.uid()::text || '/%'));

-- Сотрудник может править свою карточку (фото, телефон), но не роль
create or replace function public.set_my_avatar(p_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'нужен вход'; end if;
  update public.staff set avatar_path = p_path where id = auth.uid();
end $$;

create or replace function public.set_staff_avatar(p_staff uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or p_staff = auth.uid()) then raise exception 'нельзя менять чужой профиль'; end if;
  update public.staff set avatar_path = p_path where id = p_staff;
end $$;

-- ---------- 4. Статистика мастера ----------
-- Профиль мастера: помесячные деньги, итоги и разрез по видам работ.
create or replace function public.master_stats(m_id uuid, months int default 12)
returns jsonb language sql stable security definer set search_path = public as $$
  with mine as (
    select r.*, o.finished_at, o.group_keys, o.client_id
      from public.order_reports r join public.orders o on o.id = r.order_id
     where r.master_id = m_id),
  span as (select date_trunc('month', now()) - make_interval(months => months - 1) as from_ts)
  select jsonb_build_object(
    'total_share',  coalesce((select sum(master_share) from mine), 0),
    'total_gross',  coalesce((select sum(gross) from mine), 0),
    'total_orders', (select count(*) from mine),
    'avg_check',    coalesce((select round(avg(gross), 0) from mine), 0),
    'materials',    coalesce((select sum(materials_cost) from mine), 0),
    'month_share',  coalesce((select sum(master_share) from mine
                               where created_at >= date_trunc('month', now())), 0),
    'clients',      (select count(distinct client_id) from mine),
    'by_month',     coalesce((select jsonb_agg(x order by x->>'m') from (
                       select jsonb_build_object(
                                'm', to_char(d.month, 'YYYY-MM'),
                                'share', coalesce(sum(mine.master_share), 0),
                                'gross', coalesce(sum(mine.gross), 0),
                                'orders', count(mine.id)) as x
                         from generate_series((select from_ts from span), date_trunc('month', now()), '1 month') d(month)
                         left join mine on date_trunc('month', mine.created_at) = d.month
                        group by d.month) s), '[]'::jsonb),
    'by_group',     coalesce((select jsonb_agg(x) from (
                       select jsonb_build_object('group_key', g, 'n', count(*)) as x
                         from mine, unnest(mine.group_keys) g group by g
                        order by count(*) desc limit 8) s), '[]'::jsonb),
    'active',       (select count(*) from public.orders
                      where master_id = m_id and status in ('assigned','en_route','shopping','in_progress')),
    'overdue',      (select count(*) from public.orders
                      where master_id = m_id and status not in ('done','cancelled') and deadline_at < now())
  )
$$;

-- ---------- 5. Аналитика дашборда за произвольный период ----------
create or replace function public.dash_range(from_ts timestamptz, to_ts timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  with done as (
    select o.id, o.finished_at, r.gross, r.master_share, r.company_share,
           r.company_net, r.tax_amount, r.materials_cost, r.cash_amount, r.card_amount
      from public.orders o join public.order_reports r on r.order_id = o.id
     where o.finished_at >= from_ts and o.finished_at < to_ts),
  prev as (
    select r.gross from public.orders o join public.order_reports r on r.order_id = o.id
     where o.finished_at >= from_ts - (to_ts - from_ts) and o.finished_at < from_ts)
  select jsonb_build_object(
    'revenue',      coalesce((select sum(gross) from done), 0),
    'revenue_prev', coalesce((select sum(gross) from prev), 0),
    'orders',       (select count(*) from done),
    'orders_prev',  (select count(*) from prev),
    'company_net',  coalesce((select sum(company_net) from done), 0),
    'company_share',coalesce((select sum(company_share) from done), 0),
    'tax',          coalesce((select sum(tax_amount) from done), 0),
    'masters_paid', coalesce((select sum(master_share) from done), 0),
    'materials',    coalesce((select sum(materials_cost) from done), 0),
    'cash',         coalesce((select sum(cash_amount) from done), 0),
    'card',         coalesce((select sum(card_amount) from done), 0),
    'avg_check',    coalesce((select round(avg(gross), 0) from done), 0),
    'by_day',       coalesce((select jsonb_agg(x order by x->>'d') from (
                      select jsonb_build_object('d', to_char(d.day, 'YYYY-MM-DD'),
                             'revenue', coalesce(sum(done.gross), 0),
                             'profit', coalesce(sum(done.company_net), 0),
                             'orders', count(done.id)) as x
                        from generate_series(from_ts::date, (to_ts - interval '1 day')::date, '1 day') d(day)
                        left join done on done.finished_at::date = d.day
                       group by d.day) s), '[]'::jsonb),
    'by_month',     coalesce((select jsonb_agg(x order by x->>'m') from (
                      select jsonb_build_object('m', to_char(date_trunc('month', done.finished_at), 'YYYY-MM'),
                             'revenue', sum(done.gross), 'profit', sum(done.company_net),
                             'orders', count(*)) as x
                        from done group by date_trunc('month', done.finished_at)) s), '[]'::jsonb),
    'by_master',    coalesce((select jsonb_agg(x) from (
                      select jsonb_build_object('id', s.id, 'name', s.full_name,
                             'share', coalesce(sum(r.master_share), 0), 'orders', count(r.id)) as x
                        from public.staff s
                        left join public.order_reports r on r.master_id = s.id
                             and r.created_at >= from_ts and r.created_at < to_ts
                       where s.role = 'master'
                       group by s.id, s.full_name order by 1 desc) s2), '[]'::jsonb)
  )
$$;
