-- Применять ПОСЛЕ того, как выкачена панель с фото «до/после» (и роздано
-- приложение). До этого старая сборка фото не шлёт, и мастер не смог бы
-- ни начать работу, ни закрыть заказ.
--
-- Правило: без фото «до» работа не начинается, без фото «после» заказ не
-- закрывается. Админ правилом не связан — ему бывает нужно закрыть старый
-- заказ, по которому фотографий уже не сделать.
-- Выключатель — panel_settings.proof_required (по умолчанию включено).

insert into public.panel_settings (key, value, note)
values ('proof_required', 'true'::jsonb, 'Фото до начала работы и после окончания обязательны')
on conflict (key) do nothing;

create or replace function public.proof_required() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::boolean from public.panel_settings where key = 'proof_required'), true)
$$;

create or replace function public.set_order_status(o_id uuid, new_status text)
returns public.orders language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = o_id for update;
  if o is null then raise exception 'заказ не найден'; end if;
  if (public.is_office() or o.master_id = auth.uid()) is not true then raise exception 'чужой заказ'; end if;
  if new_status not in ('assigned','en_route','shopping','in_progress','cancelled') then
    raise exception 'этот статус так не ставится';
  end if;
  if new_status = 'in_progress' and o.quote_state in ('pending', 'onsite') then
    raise exception 'сначала назовите цену работ за объём';
  end if;
  if new_status = 'in_progress' and public.proof_required() and public.is_admin() is not true
     and cardinality(o.proof_before) = 0 then
    raise exception 'сначала сфотографируйте место работы — фото «до»';
  end if;
  update public.orders set
    status = new_status,
    started_at = case when new_status = 'in_progress' and started_at is null then now() else started_at end,
    cancelled_at = case when new_status = 'cancelled' then now() else cancelled_at end
   where id = o_id returning * into o;
  insert into public.order_events (order_id, actor_id, type, payload)
  values (o_id, auth.uid(), 'status', jsonb_build_object('status', new_status));
  return o;
end $$;

-- Фото «после»: finish_order не переписываем — сторож стоит триггером на
-- отчёт. Отчёт без фото готовой работы не создаётся, а вместе с ним
-- откатывается и закрытие заказа.
create or replace function public.report_needs_proof() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.proof_required() and public.is_admin() is not true
     and cardinality(coalesce(new.photo_paths, '{}')) = 0
     and not exists (select 1 from public.orders o
                      where o.id = new.order_id and cardinality(o.proof_after) > 0) then
    raise exception 'добавьте фото готовой работы — фото «после»';
  end if;
  return new;
end $$;

drop trigger if exists order_reports_proof on public.order_reports;
create trigger order_reports_proof before insert on public.order_reports
  for each row execute function public.report_needs_proof();
