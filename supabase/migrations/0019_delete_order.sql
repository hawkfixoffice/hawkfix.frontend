-- ============================================================
-- Удаление заказа.
--
-- Заказы приходят с сайта сами, поэтому в списке оседают дубли, пробные
-- заявки и просто ошибки — офису нужна возможность убрать их, а не
-- держать вечно в «новых». Удаление делает функция, а не прямой
-- `delete from orders`: у заказа есть лента, предложения, отчёт с деньгами
-- и приватные чеки в Storage, и всё это должно уйти вместе с ним.
--
-- Удаляем по правилу проекта «перед удалением снимаем копию»: снимок
-- заказа целиком (вместе с отчётом, предложениями, лентой и именами
-- файлов) ложится в `order_trash`. Операция необратима для интерфейса,
-- но разобраться «что это был за заказ и кто его убрал» можно всегда.
-- ============================================================

-- ---------- права трёх значений ----------
-- `staff_role()` возвращает NULL для того, кого нет в `staff`, поэтому
-- `is_admin()` отдавал NULL, а не false. В политиках RLS это безопасно
-- (NULL там = «не пускать»), но в коде функций проверка вида
-- `if not public.is_admin() then raise ...` при NULL **не срабатывает**:
-- `not null` — это null, а `if null` идёт по ветке else. То есть любой
-- посторонний с токеном authenticated проходил сторож насквозь.
-- Проверено: сторож в `delete_order` пропустил чужой uuid и упёрся уже
-- в внешний ключ `deleted_by`. Лечим в корне — функции ролей всегда
-- возвращают boolean, и все `if not is_office()` в прежних миграциях
-- (assign_master, redispatch_order, orders_attention…) закрываются заодно.
create or replace function public.is_admin() returns boolean language sql stable as $$
  select coalesce(public.staff_role() = 'admin', false)
$$;
create or replace function public.is_office() returns boolean language sql stable as $$
  select coalesce(public.staff_role() in ('admin', 'manager'), false)
$$;

-- ---------- корзина ----------
create table if not exists public.order_trash (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null,
  order_no   text not null,
  -- заказ + клиент + отчёт + предложения + лента + имена файлов чеков
  snapshot   jsonb not null,
  reason     text,
  deleted_by uuid references public.staff(id) on delete set null,
  deleted_at timestamptz not null default now()
);
create index if not exists order_trash_at_idx on public.order_trash (deleted_at desc);

alter table public.order_trash enable row level security;

-- Читает только админ: в снимке лежат деньги закрытого заказа.
-- Политики на запись нет вовсе — пишет `delete_order` на правах definer,
-- как и `leads` на сайте.
drop policy if exists trash_read on public.order_trash;
create policy trash_read on public.order_trash for select to authenticated
  using (public.is_admin());

-- ---------- удаление ----------
/** Удалить заказ вместе со всем, что к нему прицеплено.
 *
 *  Только админ: у менеджера нет доступа к деньгам закрытого заказа,
 *  а удаление заказа — это правка финансовой истории.
 *  Мастеру тем более: он не должен уметь убрать заказ, по которому
 *  не хочет отчитываться.
 *
 *  Предложения, лента и отчёт уходят каскадом по внешнему ключу.
 *  Заявка (`leads`) остаётся: это документ обращения клиента, и заказ
 *  из неё повторно не создаётся — триггер срабатывает только на вставку.
 *
 *  Чеки функция не удаляет, а возвращает их пути: Supabase запрещает
 *  `delete from storage.objects` («Direct deletion from storage tables is
 *  not allowed»), файлы убирает панель через Storage API уже после того,
 *  как заказ удалён. Имена сохранены в снимке, так что потерять их
 *  нельзя даже если удаление файлов не дойдёт. */
create or replace function public.delete_order(o_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders;
  snap jsonb;
  files jsonb;
  c_id uuid;
begin
  -- `is not true`, а не `not …`: даже если функция ролей однажды снова
  -- начнёт возвращать NULL, сторож останется закрытым
  if public.is_admin() is not true then
    raise exception 'удалять заказы может только администратор';
  end if;

  select * into o from public.orders where id = o_id;
  if o is null then raise exception 'заказ не найден'; end if;

  select coalesce(jsonb_agg(ob.name), '[]'::jsonb) into files
    from storage.objects ob
   where ob.bucket_id = 'receipts' and ob.name like o_id::text || '/%';

  snap := jsonb_build_object(
    'order',  to_jsonb(o),
    'client', (select to_jsonb(c) from public.clients c where c.id = o.client_id),
    'report', (select to_jsonb(r) from public.order_reports r where r.order_id = o_id),
    'offers', coalesce((select jsonb_agg(to_jsonb(f) order by f.offered_at)
                          from public.order_offers f where f.order_id = o_id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.at)
                          from public.order_events e where e.order_id = o_id), '[]'::jsonb),
    'receipts', files
  );

  insert into public.order_trash (order_id, order_no, snapshot, reason, deleted_by)
  values (o.id, o.order_no, snap, nullif(btrim(coalesce(p_reason, '')), ''), auth.uid());

  c_id := o.client_id;
  delete from public.orders where id = o_id;

  -- Счётчики и статус клиента считаются из его заказов, значит после
  -- удаления их надо пересчитать — иначе у клиента останется «5 заказов»
  -- при четырёх.
  perform public.recalc_client(c_id);

  -- Пути чеков отдаём панели: удалить файлы из Storage можно только
  -- через его API, а не SQL-запросом
  return jsonb_build_object('order_no', o.order_no, 'receipts', files);
end $$;

revoke all on function public.delete_order(uuid, text) from public;
grant execute on function public.delete_order(uuid, text) to authenticated;

-- Панель удаляет чеки удалённого заказа через Storage API, а на это
-- нужна политика: в 0007 были только insert/select/update.
drop policy if exists receipts_delete on storage.objects;
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.is_admin());

notify pgrst, 'reload schema';
