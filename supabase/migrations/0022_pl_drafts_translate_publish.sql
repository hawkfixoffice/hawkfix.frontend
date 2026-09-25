-- ============================================================
-- 0022. Правка только по-польски → перевод → публикация.
--
-- Тексты сайта и названия прайса администратор правит только на польском.
-- Правки копятся черновиком и посетителю не видны. Кнопка «Opublikuj»
-- в браузере админа переводит все изменения на uk/ru/en (edge-функция
-- `translate` → Barabash AI) и только потом одним вызовом публикует
-- польский текст вместе с переводами. Если перевод сорвался — не
-- публикуется ничего, черновики остаются.
-- ============================================================

-- ---------- черновики текстов и фото сайта ----------
create table if not exists public.site_content_draft (
  key        text primary key,
  value      text not null default '',
  -- reset — «вернуть исходный текст»: при публикации правка удаляется на всех языках
  kind       text not null check (kind in ('text', 'html', 'image', 'reset')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.staff(id) on delete set null
);
alter table public.site_content_draft enable row level security;
drop policy if exists site_draft_admin on public.site_content_draft;
create policy site_draft_admin on public.site_content_draft for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop trigger if exists site_draft_stamp on public.site_content_draft;
create trigger site_draft_stamp before insert or update on public.site_content_draft
  for each row execute function public.site_content_stamp();

-- Публикация черновиков одним вызовом.
-- rows: [{key, kind:'text'|'html', values:{pl,uk,ru,en}} | {key, kind:'image', value} | {key, kind:'reset'}]
create or replace function public.site_publish_drafts(rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; l text; n int := 0;
begin
  if public.is_admin() is not true then raise exception 'публикует только администратор'; end if;
  for r in select * from jsonb_array_elements(coalesce(rows, '[]')) loop
    if r->>'kind' = 'reset' then
      delete from public.site_content where key = r->>'key';
    elsif r->>'kind' = 'image' then
      insert into public.site_content (key, locale, value, kind)
      values (r->>'key', '*', r->>'value', 'image')
      on conflict (key, locale) do update set value = excluded.value, kind = 'image';
    elsif r->>'kind' in ('text', 'html') then
      foreach l in array array['pl', 'uk', 'ru', 'en'] loop
        if coalesce(r->'values'->>l, '') = '' then
          raise exception 'нет перевода «%» на %', r->>'key', l;
        end if;
        insert into public.site_content (key, locale, value, kind)
        values (r->>'key', l, r->'values'->>l, r->>'kind')
        on conflict (key, locale) do update set value = excluded.value, kind = excluded.kind;
      end loop;
    else
      raise exception 'неизвестный вид правки: %', r->>'kind';
    end if;
    delete from public.site_content_draft where key = r->>'key';
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'published', n);
end $$;
revoke all on function public.site_publish_drafts(jsonb) from public, anon;
grant execute on function public.site_publish_drafts(jsonb) to authenticated;


-- ---------- прайс: черновик названия и «ещё не опубликовано» ----------
do $$
declare t text;
begin
  foreach t in array array['price_groups', 'price_subgroups', 'price_items'] loop
    execute format('alter table public.%I add column if not exists published boolean not null default true', t);
    execute format('alter table public.%I add column if not exists name_draft text', t);
  end loop;
end $$;

-- Каталог для сайта — только опубликованное
create or replace function public.catalog() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', g.key,
               'name', coalesce((select jsonb_object_agg(t.locale, t.name) from public.price_group_tr t where t.group_key = g.key), '{}'))
             order by g.sort, g.key)
        from public.price_groups g where g.published), '[]'),
    'subgroups', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', s.key, 'group', s.group_key,
               'name', coalesce((select jsonb_object_agg(t.locale, t.name) from public.price_subgroup_tr t where t.subgroup_key = s.key), '{}'))
             order by s.sort, s.key)
        from public.price_subgroups s where s.published), '[]'),
    'items', coalesce((
      select jsonb_agg(
               jsonb_strip_nulls(jsonb_build_object(
                 'key', i.key, 'group', i.group_key, 'dept', i.dept,
                 'price', i.price, 'hours', i.hours::float8, 'unit', i.unit,
                 'min', i.min_qty, 'max', i.max_qty,
                 'ptype', i.ptype,
                 'sub', (select s.key from public.price_subgroups s where s.key = i.subgroup_key and s.published)))
               || coalesce(i.extra, '{}')
               || jsonb_build_object('name', coalesce((select jsonb_object_agg(t.locale, t.name) from public.price_item_tr t where t.item_key = i.key), '{}'))
             order by g.sort, i.sort, i.key)
        from public.price_items i join public.price_groups g on g.key = i.group_key
       where i.published and g.published), '[]')
  )
$$;
grant execute on function public.catalog() to anon, authenticated;

-- Публикация прайса: названия на четырёх языках + снять черновик.
-- rows: [{kind:'group'|'subgroup'|'item', key, names:{pl,uk,ru,en}}]
create or replace function public.price_publish(rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; l text; k text; n int := 0;
begin
  if public.is_admin() is not true then raise exception 'публикует только администратор'; end if;
  for r in select * from jsonb_array_elements(coalesce(rows, '[]')) loop
    k := r->>'key';
    foreach l in array array['pl', 'uk', 'ru', 'en'] loop
      if coalesce(btrim(r->'names'->>l), '') = '' then
        raise exception 'нет названия «%» на %', k, l;
      end if;
    end loop;
    if r->>'kind' = 'group' then
      foreach l in array array['pl', 'uk', 'ru', 'en'] loop
        insert into public.price_group_tr (group_key, locale, name) values (k, l, r->'names'->>l)
        on conflict (group_key, locale) do update set name = excluded.name;
      end loop;
      update public.price_groups set published = true, name_draft = null where key = k;
    elsif r->>'kind' = 'subgroup' then
      foreach l in array array['pl', 'uk', 'ru', 'en'] loop
        insert into public.price_subgroup_tr (subgroup_key, locale, name) values (k, l, r->'names'->>l)
        on conflict (subgroup_key, locale) do update set name = excluded.name;
      end loop;
      update public.price_subgroups set published = true, name_draft = null where key = k;
    elsif r->>'kind' = 'item' then
      foreach l in array array['pl', 'uk', 'ru', 'en'] loop
        insert into public.price_item_tr (item_key, locale, name) values (k, l, r->'names'->>l)
        on conflict (item_key, locale) do update set name = excluded.name;
      end loop;
      update public.price_items set published = true, name_draft = null where key = k;
    else
      raise exception 'неизвестный вид: %', r->>'kind';
    end if;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'published', n);
end $$;
revoke all on function public.price_publish(jsonb) from public, anon;
grant execute on function public.price_publish(jsonb) to authenticated;

notify pgrst, 'reload schema';
