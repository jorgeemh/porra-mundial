-- ============================================================
-- PORRA MUNDIAL 2026 — Esquema de Supabase
-- Ejecuta este archivo COMPLETO en el SQL Editor de Supabase
-- (Project → SQL Editor → New query → pega todo → Run)
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- TABLAS ----------

create table if not exists usuarios (
  id uuid primary key default gen_random_uuid(),
  nombre text unique not null,
  pin_hash text not null,
  session_token uuid,
  es_admin boolean not null default false,
  creado_en timestamptz not null default now()
);

create table if not exists partidos (
  id text primary key,
  fase text not null,                 -- 'grupos','r32','r16','qf','sf','final'
  grupo text,                          -- 'A'..'L' (solo grupos)
  equipo_a text,
  equipo_b text,
  fecha_hora timestamptz,
  goles_a int,
  goles_b int,
  resultado text,                      -- 'A','B','EMPATE' o null
  orden int default 0
);

create table if not exists pronosticos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  partido_id text not null references partidos(id) on delete cascade,
  prediccion text not null,            -- grupos: 'A','B','EMPATE'. Eliminatorias: nombre del equipo
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique(usuario_id, partido_id)
);

create table if not exists config (
  clave text primary key,
  valor text
);

insert into config (clave, valor) values
  ('fecha_limite_grupos', '2026-06-11T18:00:00+02:00'),
  ('eliminatorias_abiertas', 'false'),
  ('bracket_bloqueado', 'false')
on conflict (clave) do nothing;

-- ---------- VISTA PÚBLICA (sin pin_hash ni token) ----------

create or replace view usuarios_publico as
  select id, nombre, es_admin, creado_en from usuarios;

-- ---------- RLS ----------

alter table usuarios enable row level security;
alter table partidos enable row level security;
alter table pronosticos enable row level security;
alter table config enable row level security;

-- Lectura: cualquiera puede leer partidos, pronósticos y config
drop policy if exists "lectura_partidos" on partidos;
create policy "lectura_partidos" on partidos for select using (true);

drop policy if exists "lectura_pronosticos" on pronosticos;
create policy "lectura_pronosticos" on pronosticos for select using (true);

drop policy if exists "lectura_config" on config;
create policy "lectura_config" on config for select using (true);

-- Escritura directa: PROHIBIDA. Todo va por funciones RPC SECURITY DEFINER.
-- (No creamos políticas de INSERT/UPDATE/DELETE => denegado por defecto.)

-- usuarios: ninguna lectura ni escritura directa para anon. Solo via vista o RPC.
revoke all on usuarios from anon, authenticated;
grant select on usuarios_publico to anon, authenticated;

-- ---------- FUNCIONES RPC ----------

-- Hash de PIN: bcrypt
create or replace function _hash_pin(p_pin text) returns text
language sql immutable as $$
  select crypt(p_pin, gen_salt('bf', 6));
$$;

-- REGISTRO de un amigo nuevo (primera vez que entra con su nombre)
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

  if exists (select 1 from usuarios where lower(nombre) = lower(trim(p_nombre))) then
    raise exception 'Ese nombre ya está registrado. Usa login.';
  end if;

  v_token := gen_random_uuid();
  insert into usuarios(nombre, pin_hash, session_token, es_admin)
    values (trim(p_nombre), _hash_pin(p_pin), v_token, false)
    returning id, es_admin into v_id, v_admin;

  return query select v_id, v_token, v_admin;
end; $$;

-- LOGIN con nombre + PIN
create or replace function login(p_nombre text, p_pin text)
returns table(usuario_id uuid, session_token uuid, es_admin boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_user usuarios%rowtype;
  v_token uuid;
begin
  select * into v_user from usuarios where lower(nombre) = lower(trim(p_nombre));
  if not found then raise exception 'Usuario no encontrado'; end if;
  if v_user.pin_hash <> crypt(p_pin, v_user.pin_hash) then
    raise exception 'PIN incorrecto';
  end if;

  v_token := gen_random_uuid();
  update usuarios set session_token = v_token where id = v_user.id;
  return query select v_user.id, v_token, v_user.es_admin;
end; $$;

-- Verifica token; devuelve usuario_id si es válido
create or replace function _verificar_token(p_usuario_id uuid, p_token uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists(select 1 from usuarios where id = p_usuario_id and session_token = p_token);
$$;

-- GUARDAR un pronóstico de fase de GRUPOS
create or replace function guardar_pronostico_grupos(
  p_usuario_id uuid, p_token uuid, p_partido_id text, p_prediccion text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_limite timestamptz;
  v_partido partidos%rowtype;
begin
  if not _verificar_token(p_usuario_id, p_token) then raise exception 'Sesión inválida'; end if;
  if p_prediccion not in ('A','B','EMPATE') then raise exception 'Predicción inválida'; end if;

  select valor::timestamptz into v_limite from config where clave = 'fecha_limite_grupos';
  if now() >= v_limite then raise exception 'La fase de grupos ya está cerrada'; end if;

  select * into v_partido from partidos where id = p_partido_id;
  if not found then raise exception 'Partido no existe'; end if;
  if v_partido.fase <> 'grupos' then raise exception 'No es un partido de grupos'; end if;

  insert into pronosticos(usuario_id, partido_id, prediccion)
    values (p_usuario_id, p_partido_id, p_prediccion)
    on conflict (usuario_id, partido_id)
    do update set prediccion = excluded.prediccion, actualizado_en = now();
end; $$;

-- GUARDAR el bracket completo de eliminatorias (de una vez, se bloquea cuando empiezan)
create or replace function guardar_bracket(
  p_usuario_id uuid, p_token uuid, p_picks jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_bloqueado text;
  v_abiertas text;
  v_item jsonb;
begin
  if not _verificar_token(p_usuario_id, p_token) then raise exception 'Sesión inválida'; end if;

  select valor into v_abiertas from config where clave = 'eliminatorias_abiertas';
  if v_abiertas <> 'true' then raise exception 'Las eliminatorias aún no están abiertas'; end if;

  select valor into v_bloqueado from config where clave = 'bracket_bloqueado';
  if v_bloqueado = 'true' then raise exception 'El cuadro ya está bloqueado'; end if;

  -- p_picks: [{"partido_id":"R32_1","equipo":"BRA"}, ...]
  for v_item in select * from jsonb_array_elements(p_picks) loop
    insert into pronosticos(usuario_id, partido_id, prediccion)
      values (p_usuario_id, v_item->>'partido_id', v_item->>'equipo')
      on conflict (usuario_id, partido_id)
      do update set prediccion = excluded.prediccion, actualizado_en = now();
  end loop;
end; $$;

-- ---------- ADMIN ----------

create or replace function _es_admin(p_usuario_id uuid, p_token uuid) returns boolean
language sql security definer set search_path = public as $$
  select exists(select 1 from usuarios where id = p_usuario_id and session_token = p_token and es_admin = true);
$$;

-- Admin: meter resultado de un partido (con goles si es grupos; en eliminatorias, ganador directo)
create or replace function admin_set_resultado(
  p_usuario_id uuid, p_token uuid,
  p_partido_id text, p_goles_a int, p_goles_b int, p_ganador text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_partido partidos%rowtype;
  v_res text;
begin
  if not _es_admin(p_usuario_id, p_token) then raise exception 'Solo admin'; end if;

  select * into v_partido from partidos where id = p_partido_id;
  if not found then raise exception 'Partido no existe'; end if;

  if v_partido.fase = 'grupos' then
    if p_goles_a is null or p_goles_b is null then raise exception 'Faltan goles'; end if;
    if p_goles_a > p_goles_b then v_res := 'A';
    elsif p_goles_b > p_goles_a then v_res := 'B';
    else v_res := 'EMPATE'; end if;
    update partidos set goles_a = p_goles_a, goles_b = p_goles_b, resultado = v_res
      where id = p_partido_id;
  else
    -- Eliminatorias: el resultado es el nombre del equipo ganador
    if p_ganador is null then raise exception 'Falta ganador'; end if;
    if p_ganador not in (v_partido.equipo_a, v_partido.equipo_b) then
      raise exception 'El ganador no juega ese partido';
    end if;
    update partidos set goles_a = p_goles_a, goles_b = p_goles_b, resultado = p_ganador
      where id = p_partido_id;
    -- Propagar al siguiente partido (slot_a o slot_b según el cruce)
    perform _propagar_ganador(p_partido_id, p_ganador);
  end if;
end; $$;

-- Helper: propaga el ganador de un partido eliminatorio al siguiente
create or replace function _propagar_ganador(p_partido_id text, p_equipo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_next text;
  v_slot text;  -- 'a' o 'b'
begin
  -- next_match y posición se guardan en config como JSON (más simple) o calculados desde frontend.
  -- Aquí usamos partidos.equipo_a/equipo_b ya rellenados por generar_eliminatorias para saber qué slot.
  -- Buscamos qué partido tiene este como "fuente" usando convenio: campo aux en config.
  select valor into v_next from config where clave = 'next_' || p_partido_id || '_a';
  if v_next is not null then
    update partidos set equipo_a = p_equipo where id = v_next;
    return;
  end if;
  select valor into v_next from config where clave = 'next_' || p_partido_id || '_b';
  if v_next is not null then
    update partidos set equipo_b = p_equipo where id = v_next;
  end if;
end; $$;

-- Admin: crea/sobrescribe los partidos del calendario (se llama desde el frontend con el JSON)
create or replace function admin_cargar_partidos(
  p_usuario_id uuid, p_token uuid, p_partidos jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not _es_admin(p_usuario_id, p_token) then raise exception 'Solo admin'; end if;

  for v in select * from jsonb_array_elements(p_partidos) loop
    insert into partidos(id, fase, grupo, equipo_a, equipo_b, fecha_hora, orden)
      values (v->>'id', v->>'fase', v->>'grupo', v->>'equipo_a', v->>'equipo_b',
              (v->>'fecha_hora')::timestamptz, coalesce((v->>'orden')::int, 0))
      on conflict (id) do update set
        fase = excluded.fase,
        grupo = excluded.grupo,
        equipo_a = excluded.equipo_a,
        equipo_b = excluded.equipo_b,
        fecha_hora = excluded.fecha_hora,
        orden = excluded.orden;
  end loop;
end; $$;

-- Admin: genera el bracket de eliminatorias a partir de los resultados de grupos
-- p_bracket es el JSON de bracket.json. p_asignaciones contiene la lista resuelta de slots → equipo.
create or replace function admin_generar_eliminatorias(
  p_usuario_id uuid, p_token uuid,
  p_partidos_bracket jsonb,    -- [{id, fase, equipo_a, equipo_b, fecha_hora, next_a, next_b}]
  p_propagaciones jsonb)       -- [{from, to_a_or_b, partido_destino}]
returns void language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
  k text;
begin
  if not _es_admin(p_usuario_id, p_token) then raise exception 'Solo admin'; end if;

  -- Borrar antiguos slots de propagación
  delete from config where clave like 'next_%';

  for v in select * from jsonb_array_elements(p_partidos_bracket) loop
    insert into partidos(id, fase, equipo_a, equipo_b, fecha_hora, orden)
      values (v->>'id', v->>'fase', v->>'equipo_a', v->>'equipo_b',
              (v->>'fecha_hora')::timestamptz, coalesce((v->>'orden')::int, 0))
      on conflict (id) do update set
        fase = excluded.fase,
        equipo_a = excluded.equipo_a,
        equipo_b = excluded.equipo_b,
        fecha_hora = excluded.fecha_hora,
        orden = excluded.orden;
  end loop;

  for v in select * from jsonb_array_elements(p_propagaciones) loop
    insert into config(clave, valor)
      values ('next_' || (v->>'from') || '_' || (v->>'slot'), v->>'to')
      on conflict (clave) do update set valor = excluded.valor;
  end loop;

  update config set valor = 'true' where clave = 'eliminatorias_abiertas';
end; $$;

-- Admin: bloquea el bracket (cuando empieza el primer R32)
create or replace function admin_bloquear_bracket(p_usuario_id uuid, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _es_admin(p_usuario_id, p_token) then raise exception 'Solo admin'; end if;
  update config set valor = 'true' where clave = 'bracket_bloqueado';
end; $$;

-- Admin: resetear PIN de un amigo (le pones un nuevo PIN)
create or replace function admin_reset_pin(
  p_usuario_id uuid, p_token uuid, p_nombre_obj text, p_nuevo_pin text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _es_admin(p_usuario_id, p_token) then raise exception 'Solo admin'; end if;
  if p_nuevo_pin !~ '^[0-9]{4}$' then raise exception 'PIN debe ser 4 dígitos'; end if;
  update usuarios set pin_hash = _hash_pin(p_nuevo_pin), session_token = null
    where lower(nombre) = lower(trim(p_nombre_obj));
end; $$;

-- Admin: hacer admin a alguien (por si quieres añadir otro)
create or replace function admin_set_admin(
  p_usuario_id uuid, p_token uuid, p_nombre_obj text, p_es_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _es_admin(p_usuario_id, p_token) then raise exception 'Solo admin'; end if;
  update usuarios set es_admin = p_es_admin
    where lower(nombre) = lower(trim(p_nombre_obj));
end; $$;

-- ---------- PERMISOS DE EJECUCIÓN ----------
grant execute on function registrar(text,text) to anon, authenticated;
grant execute on function login(text,text) to anon, authenticated;
grant execute on function guardar_pronostico_grupos(uuid,uuid,text,text) to anon, authenticated;
grant execute on function guardar_bracket(uuid,uuid,jsonb) to anon, authenticated;
grant execute on function admin_set_resultado(uuid,uuid,text,int,int,text) to anon, authenticated;
grant execute on function admin_cargar_partidos(uuid,uuid,jsonb) to anon, authenticated;
grant execute on function admin_generar_eliminatorias(uuid,uuid,jsonb,jsonb) to anon, authenticated;
grant execute on function admin_bloquear_bracket(uuid,uuid) to anon, authenticated;
grant execute on function admin_reset_pin(uuid,uuid,text,text) to anon, authenticated;
grant execute on function admin_set_admin(uuid,uuid,text,boolean) to anon, authenticated;
