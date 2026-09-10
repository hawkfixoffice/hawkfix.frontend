-- Окно приезда: клиент выбирает дату, а следом двухчасовой слот.
-- Текстом, а не time: в письме и в админке нужен именно диапазон «10:00-12:00».
alter table public.leads add column if not exists when_time text;
comment on column public.leads.when_time is 'Окно приезда, выбранное клиентом: HH:MM-HH:MM';
