-- Номер заказа и следы уведомления: под будущую админку.

-- Человекочитаемый номер: HF-26-1001. Отдельная последовательность,
-- чтобы номер не зависел от uuid и был удобен в разговоре с клиентом.
create sequence if not exists public.lead_no_seq start 1001;

alter table public.leads
  add column if not exists order_no text,
  add column if not exists notified_at timestamptz,   -- когда ушло письмо
  add column if not exists notify_error text;         -- почему не ушло

alter table public.leads
  alter column order_no
  set default 'HF-' || to_char(now(), 'YY') || '-' || lpad(nextval('public.lead_no_seq')::text, 4, '0');

-- Проставим номера тем строкам, что уже есть (сейчас их нет, но пусть будет)
update public.leads set order_no = 'HF-' || to_char(created_at, 'YY') || '-' ||
       lpad(nextval('public.lead_no_seq')::text, 4, '0')
 where order_no is null;

alter table public.leads alter column order_no set not null;
create unique index if not exists leads_order_no_uniq on public.leads (order_no);

comment on column public.leads.order_no is 'Номер заказа для клиента и админки, вида HF-26-1001';
