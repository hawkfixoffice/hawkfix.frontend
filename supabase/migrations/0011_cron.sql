-- Просроченные предложения должны уходить следующему мастеру сами,
-- иначе заказ будет ждать, пока кто-нибудь откроет панель.
create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'hawkfix-expire-offers',
  '* * * * *',                       -- раз в минуту: точность важнее нагрузки
  $$select public.expire_offers()$$
) where not exists (select 1 from cron.job where jobname = 'hawkfix-expire-offers');
