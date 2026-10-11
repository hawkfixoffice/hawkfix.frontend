-- 0025 — пуши приложению. НЕ ПРИМЕНЕНА: включается, когда готов Firebase.
--
-- Порядок включения (подробно — APP/PUSH.md):
--   1. выкатить функцию:   SUPABASE_PAT=… node tools/deploy-function.mjs push
--   2. секреты функций:    FCM_SERVICE_ACCOUNT (JSON сервисного аккаунта),
--                          PUSH_HOOK_SECRET (любая длинная случайная строка);
--   3. та же строка в vault:
--        select vault.create_secret('<строка>', 'push_hook');
--   4. применить эту миграцию.
--
-- Кому что приходит:
--   мастеру — новый заказ на подтверждение; заказ, назначенный вручную;
--             перенос даты его заказа;
--   офису   — заказ, который некому предложить;
--   админам — заказ закрыт отчётом.
-- Тот, кто сам сделал действие, пуш о нём не получает.
--
-- Отправка идёт через pg_net после фиксации транзакции и заказ не держит:
-- не ушёл пуш — заказ всё равно создан, назначен и виден в приложении.

create or replace function public.push_send(p_type text, p_staff uuid[], p_order uuid)
returns void language plpgsql security definer set search_path = public, extensions, vault as $$
declare
  v_url text; v_secret text; o public.orders;
begin
  if p_staff is null or cardinality(p_staff) = 0 then return; end if;
  if not exists (select 1 from public.device_tokens where staff_id = any(p_staff)) then return; end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_hook';
  if v_url is null or v_secret is null then return; end if;

  select * into o from public.orders where id = p_order;
  if o is null then return; end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hawk-push', v_secret),
    body    := jsonb_build_object(
      'type', p_type, 'staff_ids', to_jsonb(p_staff),
      'order_id', o.id, 'order_no', o.order_no, 'address', o.address,
      'when', nullif(concat_ws(' ', to_char(o.scheduled_date, 'DD.MM'), o.scheduled_slot), ''),
      'total', o.quoted_total),
    timeout_milliseconds := 10000);
exception when others then
  -- пуш — удобство, а не часть заказа: его сбой не должен откатывать работу
  raise warning 'push_send: %', sqlerrm;
end $$;

revoke all on function public.push_send(text, uuid[], uuid) from public, anon, authenticated;

-- Новое предложение мастеру
create or replace function public.push_on_offer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' then
    perform public.push_send('offer', array[new.master_id], new.order_id);
  end if;
  return new;
end $$;

drop trigger if exists order_offers_push on public.order_offers;
create trigger order_offers_push after insert on public.order_offers
  for each row execute function public.push_on_offer();

-- События заказа
create or replace function public.push_on_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_master uuid; v_who uuid[];
begin
  if new.type = 'assigned' then
    v_master := nullif(new.payload ->> 'master_id', '')::uuid;
    if v_master is not null and v_master is distinct from new.actor_id then
      perform public.push_send('assigned', array[v_master], new.order_id);
    end if;

  elsif new.type = 'edited' and new.payload ? 'date' then
    select master_id into v_master from public.orders where id = new.order_id;
    if v_master is not null and v_master is distinct from new.actor_id then
      perform public.push_send('edited', array[v_master], new.order_id);
    end if;

  elsif new.type = 'dispatch_failed' then
    select array_agg(id) into v_who from public.staff
     where role in ('admin', 'manager') and active and deleted_at is null;
    perform public.push_send('no_master', v_who, new.order_id);

  elsif new.type = 'finished' then
    select array_agg(id) into v_who from public.staff
     where role = 'admin' and active and deleted_at is null and id is distinct from new.actor_id;
    perform public.push_send('finished', v_who, new.order_id);
  end if;
  return new;
end $$;

drop trigger if exists order_events_push on public.order_events;
create trigger order_events_push after insert on public.order_events
  for each row execute function public.push_on_event();
