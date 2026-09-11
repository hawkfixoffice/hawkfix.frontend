-- Мастеру видна только его доля. Раньше он мог прочитать в своём отчёте
-- и долю фирмы: колонки лежат в одной строке, а RLS работает на уровне
-- строк, не колонок. Поэтому таблицу от мастеров закрываем, а взамен
-- даём представление ровно с теми полями, которые его касаются.
drop policy if exists reports_master on public.order_reports;

create or replace view public.my_reports
with (security_invoker = off) as
  select r.id, r.order_id, r.created_at, r.cash_amount, r.card_amount,
         r.materials_cost, r.no_materials, r.work_note, r.receipt_path,
         r.gross, r.master_share, r.master_pct,
         o.order_no, o.scheduled_date
    from public.order_reports r
    join public.orders o on o.id = r.order_id
   where r.master_id = auth.uid();

grant select on public.my_reports to authenticated;
comment on view public.my_reports is 'Отчёты мастера без цифр фирмы: доля, материалы, чек';
