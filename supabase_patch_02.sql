-- Parche 02: pgcrypto está en el schema "extensions" en Supabase.
-- Cualificamos gen_salt y crypt, y ampliamos search_path.

drop function if exists _hash_pin(text);
create or replace function _hash_pin(p_pin text) returns text
language sql immutable set search_path = public, extensions as $$
  select extensions.crypt(p_pin, extensions.gen_salt('bf', 6));
$$;

drop function if exists registrar(text, text);
create or replace function registrar(p_nombre text, p_pin text)
returns table(usuario_id uuid, session_token uuid, es_admin boolean)
language plpgsql security definer set search_path = public, extensions as $$
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

drop function if exists login(text, text);
create or replace function login(p_nombre text, p_pin text)
returns table(usuario_id uuid, session_token uuid, es_admin boolean)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user usuarios%rowtype;
  v_token uuid;
begin
  select * into v_user from usuarios u where lower(u.nombre) = lower(trim(p_nombre));
  if not found then raise exception 'Usuario no encontrado'; end if;
  if v_user.pin_hash <> extensions.crypt(p_pin, v_user.pin_hash) then
    raise exception 'PIN incorrecto';
  end if;

  v_token := gen_random_uuid();
  update usuarios set session_token = v_token where id = v_user.id;

  usuario_id := v_user.id;
  session_token := v_token;
  es_admin := v_user.es_admin;
  return next;
end; $$;

drop function if exists admin_reset_pin(uuid, uuid, text, text);
create or replace function admin_reset_pin(
  p_usuario_id uuid, p_token uuid, p_nombre_obj text, p_nuevo_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not _es_admin(p_usuario_id, p_token) then raise exception 'Solo admin'; end if;
  if p_nuevo_pin !~ '^[0-9]{4}$' then raise exception 'PIN debe ser 4 dígitos'; end if;
  update usuarios set pin_hash = _hash_pin(p_nuevo_pin), session_token = null
    where lower(nombre) = lower(trim(p_nombre_obj));
end; $$;

grant execute on function registrar(text,text) to anon, authenticated;
grant execute on function login(text,text) to anon, authenticated;
grant execute on function admin_reset_pin(uuid,uuid,text,text) to anon, authenticated;
