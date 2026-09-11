-- ============================================================
-- Учётные записи сотрудников: вход по нику, без почты.
--
-- GoTrue требует адрес, поэтому нику подставляется технический
-- <username>@staff.hawkfix.pl — он нигде не показывается и никуда
-- не отправляется. Пароль хранится тем же bcrypt, что и у обычных
-- пользователей Supabase, поэтому вход идёт штатным /auth/v1/token.
-- ============================================================
create extension if not exists pgcrypto with schema extensions;

create or replace function public.staff_email(username text)
returns text language sql immutable as $$
  select lower(regexp_replace(trim(username), '\s+', '.', 'g')) || '@staff.hawkfix.pl'
$$;

create or replace function public.create_staff(
  p_username text, p_password text, p_full_name text, p_role text,
  p_phone text default null, p_capacity int default 3, p_skills text[] default '{}')
returns public.staff language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  uid uuid := gen_random_uuid();
  mail text := public.staff_email(p_username);
  s public.staff;
  g text;
begin
  -- Первого администратора заводит миграция, дальше — только админ из панели
  if exists (select 1 from public.staff) and not public.is_admin() then
    raise exception 'создавать сотрудников может только администратор';
  end if;
  if p_role not in ('admin','manager','master') then raise exception 'неизвестная роль'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'пароль короче восьми знаков'; end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
  values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', mail,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(), now(), now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('username', p_username, 'full_name', p_full_name, 'role', p_role),
    false, false);

  -- GoTrue читает эти поля в Go-строки: NULL в них роняет вход
  -- ошибкой «Database error querying schema».
  update auth.users set
    confirmation_token = '', recovery_token = '', email_change = '',
    email_change_token_new = '', email_change_token_current = '',
    phone_change = '', phone_change_token = '', reauthentication_token = ''
   where id = uid;

  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
  values (uid::text, uid,
          jsonb_build_object('sub', uid::text, 'email', mail, 'email_verified', true, 'phone_verified', false),
          'email', now(), now(), now());

  insert into public.staff (id, username, full_name, role, phone, capacity)
  values (uid, p_username, p_full_name, p_role, p_phone, coalesce(p_capacity, 3))
  returning * into s;

  foreach g in array coalesce(p_skills, '{}') loop
    insert into public.staff_skills (staff_id, group_key) values (uid, g) on conflict do nothing;
  end loop;

  return s;
end $$;

-- Смена пароля: себе — всегда, чужой — только админом
create or replace function public.set_staff_password(p_staff uuid, p_password text)
returns void language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not (public.is_admin() or p_staff = auth.uid()) then raise exception 'нельзя менять чужой пароль'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'пароль короче восьми знаков'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
                        updated_at = now()
   where id = p_staff;
end $$;

-- Первый администратор (пароль задан владельцем; сменить — set_staff_password)
-- select public.create_staff('Admin', '…', 'Administrator', 'admin', '+48532481505', 0);
