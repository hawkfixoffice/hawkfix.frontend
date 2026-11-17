-- 0026: защита от дублей заявки при повторной отправке (2026-11-17)
--
-- Форма шлёт заявку до трёх раз (две попытки в функцию + запасной RPC).
-- Если первый запрос дошёл, а ответ потерялся, вторая попытка создавала
-- вторую заявку и второй заказ. Теперь у каждой формы свой request_id
-- (uuid, тот же для всех попыток), и сервер на повтор возвращает уже
-- записанную заявку.

alter table public.leads add column if not exists request_id uuid;
create unique index if not exists leads_request_id_key
  on public.leads (request_id) where request_id is not null;

create or replace function public.submit_lead(payload jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_name    text := nullif(btrim(payload #>> '{contact,name}'), '');
  v_phone   text := nullif(btrim(payload #>> '{contact,phone}'), '');
  v_digits  text := regexp_replace(coalesce(v_phone, ''), '\D', '', 'g');
  v_comment text := nullif(btrim(payload ->> 'comment'), '');
  v_items   jsonb := coalesce(payload -> 'items', '[]'::jsonb);
  v_when    text := payload ->> 'when';
  v_time    text := payload ->> 'whenTime';
  v_locale  text := coalesce(payload ->> 'locale', 'pl');
  v_lat     double precision := nullif(payload #>> '{place,lat}', '')::double precision;
  v_lon     double precision := nullif(payload #>> '{place,lon}', '')::double precision;
  v_req     uuid := case when payload ->> 'requestId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                         then (payload ->> 'requestId')::uuid end;
  v_recent  int;
  v_row     public.leads%rowtype;
begin
  if nullif(btrim(coalesce(payload ->> 'company', '')), '') is not null then
    return jsonb_build_object('ok', true);
  end if;

  -- Повтор той же заявки: отдаём уже записанную, второй не создаём
  if v_req is not null then
    select * into v_row from public.leads where request_id = v_req;
    if found then
      return jsonb_build_object('ok', true, 'id', v_row.id, 'orderNo', v_row.order_no, 'repeat', true);
    end if;
  end if;

  if v_name is null or length(v_digits) < 9 then
    return jsonb_build_object('error', 'name_or_phone');
  end if;
  if jsonb_array_length(v_items) = 0 and v_comment is null then
    return jsonb_build_object('error', 'empty_request');
  end if;
  if v_locale not in ('pl', 'uk', 'ru', 'en') then v_locale := 'pl'; end if;
  if v_lat is not null and (abs(v_lat) > 90 or abs(coalesce(v_lon, 999)) > 180) then
    v_lat := null; v_lon := null;
  end if;

  select count(*) into v_recent
    from public.leads
   where regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_digits
     and created_at > now() - interval '1 hour';
  if v_recent >= 5 then
    return jsonb_build_object('error', 'too_many');
  end if;

  begin
    insert into public.leads (
      locale, name, phone, email, district, address, lat, lon,
      when_date, when_time, comment, urgent, items, totals, page, user_agent, source, photos, request_id
    ) values (
      v_locale,
      left(v_name, 200),
      left(v_phone, 40),
      left(nullif(btrim(payload #>> '{contact,email}'), ''), 320),
      left(nullif(btrim(payload #>> '{place,district}'), ''), 120),
      left(nullif(btrim(payload #>> '{place,address}'), ''), 300),
      v_lat, v_lon,
      case when v_when ~ '^\d{4}-\d{2}-\d{2}$' then v_when::date end,
      case when v_when ~ '^\d{4}-\d{2}-\d{2}$' and v_time ~ '^\d{2}:\d{2}\s?[-–]\s?\d{2}:\d{2}$'
           then v_time end,
      left(v_comment, 4000),
      coalesce((payload ->> 'urgent')::boolean, false),
      case when jsonb_typeof(v_items) = 'array' then v_items else '[]'::jsonb end,
      coalesce(payload -> 'totals', '{}'::jsonb),
      left(nullif(btrim(payload ->> 'page'), ''), 300),
      left(nullif(btrim(payload ->> 'userAgent'), ''), 400),
      'rpc',
      public.clean_photo_paths(payload -> 'photos'),
      v_req
    ) returning * into v_row;
  exception when unique_violation then
    -- Параллельная попытка успела раньше
    select * into v_row from public.leads where request_id = v_req;
    return jsonb_build_object('ok', true, 'id', v_row.id, 'orderNo', v_row.order_no, 'repeat', true);
  end;

  return jsonb_build_object('ok', true, 'id', v_row.id, 'orderNo', v_row.order_no);
end;
$function$;
