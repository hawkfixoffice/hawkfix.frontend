-- 0027 — черновики «Wyślij na WhatsApp» и счётчики воронки сайта.
--
-- Клиенты охотнее пишут в WhatsApp, чем заполняют форму. Поэтому сайт даёт
-- отправить смету прямо в WhatsApp: сервер заводит черновик заявки с номером
-- (без телефона — его офис увидит в самом чате), а WhatsApp открывается
-- с готовым текстом «Zamówienie HF-…». Офис в панели находит черновик по
-- номеру, вписывает телефон — и черновик становится обычным заказом.
--
-- Счётчики — дневные суммы по шагам пути без каких-либо данных о человеке:
-- ни идентификаторов, ни cookie, ни IP. Только «сколько раз за день».

-- ── Черновики ──────────────────────────────────────────────────────────────

alter table public.leads alter column phone drop not null;

-- Код черновика рождается в браузере (HF-7K3F9): ссылка на WhatsApp должна
-- быть готова до нажатия, иначе Safari на iPhone не откроет приложение
-- из-под асинхронного ответа сервера
alter table public.leads add column if not exists wa_code text;
create unique index if not exists leads_wa_code_key on public.leads (wa_code) where wa_code is not null;

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status = any (array['new', 'seen', 'done', 'spam', 'wa']));

-- Черновик WhatsApp заказом не становится, пока офис не впишет телефон:
-- без телефона нет клиента, и мастеру предлагать нечего
create or replace function public.leads_to_orders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'wa' then return new; end if;
  perform public.order_from_lead(new.id);
  return new;
end $$;

/** Черновики за 7 дней — для блока на дашборде. */
create or replace function public.wa_drafts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.is_office() then '[]'::jsonb
    else coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
        from (select id, wa_code, order_no, created_at, locale, items, totals, comment, urgent, page
                from public.leads
               where status = 'wa' and created_at > now() - interval '7 days') x
    ), '[]'::jsonb) end
$$;

/** Клиент написал в WhatsApp — черновик становится заказом. */
create or replace function public.wa_draft_accept(l_id uuid, p_name text, p_phone text, p_address text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare l public.leads; o public.orders;
begin
  if not public.is_office() then raise exception 'tylko biuro'; end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 9 then
    raise exception 'phone';
  end if;

  update public.leads set
    name = coalesce(nullif(trim(p_name), ''), 'WhatsApp'),
    phone = trim(p_phone),
    address = coalesce(nullif(trim(p_address), ''), address),
    status = 'new'
   where id = l_id and status = 'wa'
  returning * into l;
  if l is null then raise exception 'draft_not_found'; end if;

  o := public.order_from_lead(l_id);
  update public.orders set source = 'whatsapp' where id = o.id;
  return o.id;
end $$;

/** Черновик никто не прислал или это мусор — убрать из списка. */
create or replace function public.wa_draft_drop(l_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_office() then raise exception 'tylko biuro'; end if;
  update public.leads set status = 'spam' where id = l_id and status = 'wa';
end $$;

revoke all on function public.wa_drafts() from public;
revoke all on function public.wa_draft_accept(uuid, text, text, text) from public;
revoke all on function public.wa_draft_drop(uuid) from public;
grant execute on function public.wa_drafts() to authenticated;
grant execute on function public.wa_draft_accept(uuid, text, text, text) to authenticated;
grant execute on function public.wa_draft_drop(uuid) to authenticated;

-- ── Счётчики воронки ───────────────────────────────────────────────────────

create table if not exists public.site_funnel (
  day    date not null,
  event  text not null,
  locale text not null,
  n      integer not null default 0,
  primary key (day, event, locale)
);
alter table public.site_funnel enable row level security;
-- Политик нет: писать можно только через track_step, читать — funnel_stats

create or replace function public.track_step(p_event text, p_locale text default 'pl')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event is null or p_event not in (
    'calc_seen', 'item_add', 'form_start', 'step_where', 'step_send',
    'lead_ok', 'lead_fail', 'wa_draft', 'wa_head', 'wa_page', 'wa_form'
  ) then return; end if;
  insert into public.site_funnel (day, event, locale, n)
  values ((now() at time zone 'Europe/Warsaw')::date, p_event,
          case when p_locale in ('pl', 'uk', 'ru', 'en') then p_locale else 'pl' end, 1)
  on conflict (day, event, locale) do update set n = public.site_funnel.n + 1;
end $$;

revoke all on function public.track_step(text, text) from public;
grant execute on function public.track_step(text, text) to anon, authenticated;

/** Воронка и каналы за период — для дашборда админа. */
create or replace function public.funnel_stats(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare since date := (now() at time zone 'Europe/Warsaw')::date - greatest(p_days, 1) + 1;
begin
  if not public.is_office() then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'since', since,
    'events', coalesce((select jsonb_object_agg(event, n) from (
        select event, sum(n)::int n from public.site_funnel where day >= since group by event) e), '{}'::jsonb),
    -- Заказы по каналу: форма сайта / WhatsApp с номером с сайта / WhatsApp без номера
    'orders_form', (select count(*) from public.orders o join public.leads l on l.id = o.lead_id
                     where l.source <> 'wa' and o.created_at::date >= since),
    'orders_wa_site', (select count(*) from public.orders o join public.leads l on l.id = o.lead_id
                        where l.source = 'wa' and o.created_at::date >= since),
    'orders_wa', (select count(*) from public.orders o
                   where o.lead_id is null and o.source = 'whatsapp' and o.created_at::date >= since),
    'orders_other', (select count(*) from public.orders o
                      where o.lead_id is null and coalesce(o.source, '') <> 'whatsapp' and o.created_at::date >= since)
  );
end $$;

revoke all on function public.funnel_stats(integer) from public;
grant execute on function public.funnel_stats(integer) to authenticated;
