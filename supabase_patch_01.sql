-- Parche 01: arregla colisión "es_admin" en registrar() y login()
-- Ejecuta este archivo entero en el SQL Editor de Supabase.

drop function if exists registrar(text, text);
drop function if exists login(text, text);

create or replace function registrar(p_nombre text, p_pin text)
returns table(usuario_id uuid, session_token uuid, es_admin boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_token uuid;
  v_admin boolean;
begin
  if length(trim(p_nombre)) < 2 then raise exception 'Nombre demasiado corto'; end if;
  if p_pin !~ '^[0-9]{4}$' then raise exception 'El PIN debe ser de 4 dígitos'; end if;

  if exists (select 1 from usuarios u where lower(u.nombre) = lower(trim(p_nombre))) then
    raise exception 'Ese nombre ya está registrado. Usa login.';
  end if;

  v_token := gen_random_uuid();
  insert into usuarios(nombre, pin_hash, session_token, es_admin)
    values (trim(p_nombre), _hash_pin(p_pin), v_token, false)
    returning usuarios.id, usuarios.es_admin into v_id, v_admin;

  usuario_id := v_id;
  session_token := v_token;
  es_admin := v_admin;
  return next;
end; $$;

create or replace function login(p_nombre text, p_pin text)
returns table(usuario_id uuid, session_token uuid, es_admin boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_user usuarios%rowtype;
  v_token uuid;
begin
  select * into v_user from usuarios u where lower(u.nombre) = lower(trim(p_nombre));
  if not found then raise exception 'Usuario no encontrado'; end if;
  if v_user.pin_hash <> crypt(p_pin, v_user.pin_hash) then
    raise exception 'PIN incorrecto';
  end if;

  v_token := gen_random_uuid();
  update usuarios set session_token = v_token where id = v_user.id;

  usuario_id := v_user.id;
  session_token := v_token;
  es_admin := v_user.es_admin;
  return next;
end; $$;

grant execute on function registrar(text,text) to anon, authenticated;
grant execute on function login(text,text) to anon, authenticated;
