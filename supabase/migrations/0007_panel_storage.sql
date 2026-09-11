-- Чеки на материалы и фото работ. Бакет закрытый: ссылки выдаются
-- подписанными на время, публичного доступа нет.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- Мастер кладёт файлы только в папку своего заказа, читает офис и он сам.
drop policy if exists receipts_insert on storage.objects;
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.is_staff());

drop policy if exists receipts_read on storage.objects;
create policy receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (
    public.is_office()
    or exists (select 1 from public.orders o
                where o.master_id = auth.uid()
                  and name like o.id::text || '/%')));

drop policy if exists receipts_update on storage.objects;
create policy receipts_update on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and public.is_office());
