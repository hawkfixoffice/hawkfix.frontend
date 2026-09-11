-- ============================================================
-- Права доступа в панели. Каждая роль видит ровно своё:
--   admin   — всё;
--   manager — заказы, клиентов и мастеров на карте, но не деньги фирмы;
--   master  — свои заказы, своих клиентов по этим заказам, свой заработок.
-- ============================================================

-- Роль текущего пользователя. SECURITY DEFINER, иначе политика на staff
-- будет рекурсивно спрашивать саму себя.
create or replace function public.staff_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.staff where id = auth.uid() and active
$$;

create or replace function public.is_admin() returns boolean language sql stable as $$
  select public.staff_role() = 'admin'
$$;
create or replace function public.is_staff() returns boolean language sql stable as $$
  select public.staff_role() is not null
$$;
create or replace function public.is_office() returns boolean language sql stable as $$
  select public.staff_role() in ('admin', 'manager')
$$;

alter table public.staff            enable row level security;
alter table public.staff_skills     enable row level security;
alter table public.staff_locations  enable row level security;
alter table public.clients          enable row level security;
alter table public.orders           enable row level security;
alter table public.order_offers     enable row level security;
alter table public.order_reports    enable row level security;
alter table public.order_events     enable row level security;
alter table public.panel_settings   enable row level security;

-- ---------- staff ----------
drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff for select
  using (public.is_office() or id = auth.uid());
drop policy if exists staff_write on public.staff;
create policy staff_write on public.staff for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- умения ----------
drop policy if exists skills_read on public.staff_skills;
create policy skills_read on public.staff_skills for select
  using (public.is_office() or staff_id = auth.uid());
drop policy if exists skills_write on public.staff_skills;
create policy skills_write on public.staff_skills for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- где мастер ----------
drop policy if exists loc_read on public.staff_locations;
create policy loc_read on public.staff_locations for select
  using (public.is_office() or staff_id = auth.uid());
drop policy if exists loc_write on public.staff_locations;
create policy loc_write on public.staff_locations for all
  using (staff_id = auth.uid() or public.is_admin())
  with check (staff_id = auth.uid() or public.is_admin());

-- ---------- клиенты ----------
drop policy if exists clients_office on public.clients;
create policy clients_office on public.clients for all
  using (public.is_office()) with check (public.is_office());
-- мастер видит только тех, к кому его отправляли
drop policy if exists clients_master on public.clients;
create policy clients_master on public.clients for select
  using (exists (select 1 from public.orders o
                 where o.client_id = clients.id and o.master_id = auth.uid()));

-- ---------- заказы ----------
drop policy if exists orders_office on public.orders;
create policy orders_office on public.orders for all
  using (public.is_office()) with check (public.is_office());
drop policy if exists orders_master_read on public.orders;
create policy orders_master_read on public.orders for select
  using (master_id = auth.uid()
         or exists (select 1 from public.order_offers f
                    where f.order_id = orders.id and f.master_id = auth.uid() and f.status = 'pending'));
-- мастер двигает только свой заказ и только по ходу работы
drop policy if exists orders_master_update on public.orders;
create policy orders_master_update on public.orders for update
  using (master_id = auth.uid()) with check (master_id = auth.uid());

-- ---------- предложения ----------
drop policy if exists offers_office on public.order_offers;
create policy offers_office on public.order_offers for all
  using (public.is_office()) with check (public.is_office());
drop policy if exists offers_master on public.order_offers;
create policy offers_master on public.order_offers for select
  using (master_id = auth.uid());
drop policy if exists offers_master_answer on public.order_offers;
create policy offers_master_answer on public.order_offers for update
  using (master_id = auth.uid()) with check (master_id = auth.uid());

-- ---------- отчёты ----------
drop policy if exists reports_office on public.order_reports;
create policy reports_office on public.order_reports for select
  using (public.is_office());
drop policy if exists reports_admin_write on public.order_reports;
create policy reports_admin_write on public.order_reports for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists reports_master on public.order_reports;
create policy reports_master on public.order_reports for select
  using (master_id = auth.uid());
-- писать отчёт мастер может только через функцию: суммы считает сервер

-- ---------- события ----------
drop policy if exists events_read on public.order_events;
create policy events_read on public.order_events for select
  using (public.is_office()
         or exists (select 1 from public.orders o where o.id = order_events.order_id and o.master_id = auth.uid()));
drop policy if exists events_write on public.order_events;
create policy events_write on public.order_events for insert
  with check (public.is_staff());

-- ---------- настройки ----------
drop policy if exists settings_read on public.panel_settings;
create policy settings_read on public.panel_settings for select using (public.is_staff());
drop policy if exists settings_write on public.panel_settings;
create policy settings_write on public.panel_settings for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- заявки с сайта видны офису ----------
alter table public.leads enable row level security;
drop policy if exists leads_office on public.leads;
create policy leads_office on public.leads for all
  using (public.is_office()) with check (public.is_office());
