-- ============================================================
-- Запасной путь для заявки с сайта.
--
-- У части людей (VPN, корпоративный DNS, блокировщик) запросы к
-- `functions/v1` из браузера не уходят вовсе, хотя `rest/v1` того же
-- проекта работает. Форма при этом молчала «Не удалось отправить»,
-- а заявка терялась — при том что на сервере всё было живо.
--
-- Поэтому у формы появляется второй путь: RPC `submit_lead` через
-- PostgREST. Он делает ровно то же, что edge-функция (проверка, запись,
-- номер заказа), а письмо отправляет уже сама база — вызовом функции
-- `lead` через pg_net. Такой вызов идёт сервер-серверу и от браузера
-- клиента никак не зависит.
-- ============================================================

create extension if not exists pg_net with schema extensions;

-- Откуда пришла заявка: 'fn' — обычный путь через edge-функцию (она сама
-- шлёт письма), 'rpc' — запасной, письма инициирует триггер ниже.
alter table public.leads add column if not exists source text not null default 'fn';

/** Приём заявки в обход edge-функции.
 *
 *  SECURITY DEFINER: у таблицы leads нет ни одной политики RLS, и это
 *  сознательно — читать заявки может только сервис-ключ. Функция даёт
 *  анониму ровно одно право: добавить строку, прошедшую проверку. */
create or replace function public.submit_lead(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_name    text := nullif(btrim(payload #>> '{contact,name}'), '');
  v_phone   text := nullif(btrim(payload #>> '{contact,phone}'), '');
  v_digits  text := regexp_replace(coalesce(v_phone, ''), '\D', '', 'g');
  v_comment text := nullif(btrim(payload ->> 'comment'), '');
  v_items   jsonb := coalesce(payload -> 'items', '[]'::jsonb);
  v_when    text := payload ->> 'when';
  v_time    text := payload ->> 'whenTime';
  v_locale  text := coalesce(payload ->> 'locale', 'pl');
  v_recent  int;
  v_row     public.leads%rowtype;
begin
  -- Ловушка для ботов: скрытое поле, человек его не заполняет
  if nullif(btrim(coalesce(payload ->> 'company', '')), '') is not null then
    return jsonb_build_object('ok', true);
  end if;

  if v_name is null or length(v_digits) < 9 then
    return jsonb_build_object('error', 'name_or_phone');
  end if;
  if jsonb_array_length(v_items) = 0 and v_comment is null then
    return jsonb_build_object('error', 'empty_request');
  end if;
  if v_locale not in ('pl', 'uk', 'ru', 'en') then v_locale := 'pl'; end if;

  -- Простой предел: с одного телефона не больше пяти заявок в час.
  -- Без него открытый RPC — приглашение засыпать таблицу мусором.
  select count(*) into v_recent
    from public.leads
   where regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_digits
     and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    return jsonb_build_object('error', 'too_many');
  end if;

  insert into public.leads (
    locale, name, phone, email, district, address,
    when_date, when_time, comment, urgent, items, totals, page, user_agent, source
  ) values (
    v_locale,
    left(v_name, 200),
    left(v_phone, 40),
    left(nullif(btrim(payload #>> '{contact,email}'), ''), 320),
    left(nullif(btrim(payload #>> '{place,district}'), ''), 120),
    left(nullif(btrim(payload #>> '{place,address}'), ''), 300),
    case when v_when ~ '^\d{4}-\d{2}-\d{2}$' then v_when::date end,
    case when v_when ~ '^\d{4}-\d{2}-\d{2}$' and v_time ~ '^\d{2}:\d{2}\s?[-–]\s?\d{2}:\d{2}$'
         then v_time end,
    left(v_comment, 4000),
    coalesce((payload ->> 'urgent')::boolean, false),
    case when jsonb_typeof(v_items) = 'array' then v_items else '[]'::jsonb end,
    coalesce(payload -> 'totals', '{}'::jsonb),
    left(nullif(btrim(payload ->> 'page'), ''), 300),
    left(nullif(btrim(payload ->> 'userAgent'), ''), 400),
    'rpc'
  ) returning * into v_row;

  return jsonb_build_object('ok', true, 'id', v_row.id, 'orderNo', v_row.order_no);
end;
$$;

revoke all on function public.submit_lead(jsonb) from public;
grant execute on function public.submit_lead(jsonb) to anon, authenticated;

/** Письмо по заявке, пришедшей запасным путём.
 *
 *  Вёрстка письма живёт в edge-функции `lead` — дублировать её в SQL
 *  бессмысленно, поэтому база просто просит функцию отправить письмо по
 *  готовой строке. Вызов подписан секретом из vault: снаружи такой запрос
 *  не подделать. pg_net работает асинхронно, поэтому заявка не ждёт почту. */
create or replace function public.lead_mail_hook()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_url    text;
  v_secret text;
begin
  if new.source <> 'rpc' then return new; end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'lead_mail_hook';
  if v_url is null or v_secret is null then return new; end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/lead',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hawk-mail', v_secret),
    body    := jsonb_build_object('mailFor', new.id),
    timeout_milliseconds := 15000
  );
  return new;
end;
$$;

drop trigger if exists trg_lead_mail on public.leads;
create trigger trg_lead_mail
  after insert on public.leads
  for each row execute function public.lead_mail_hook();
