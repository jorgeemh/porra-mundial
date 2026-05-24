-- Parche 03: funciones de utilidad para probar el flujo completo
-- (rellenar resultados aleatorios + reset)

-- Rellena con goles aleatorios todos los partidos de grupos sin resultado
create or replace function admin_rellenar_grupos_random(p_usuario_id uuid, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  ga int; gb int; res text;
begin
  if not _es_admin(p_usuario_id, p_token) then raise exception 'Solo admin'; end if;
  for r in select * from partidos where fase = 'grupos' and resultado is null loop
    ga := floor(random()*4)::int;
    gb := floor(random()*4)::int;
    if ga > gb then res := 'A'; elsif gb > ga then res := 'B'; else res := 'EMPATE'; end if;
    update partidos set goles_a = ga, goles_b = gb, resultado = res where id = r.id;
  end loop;
end; $$;

-- Rellena con ganador aleatorio todos los partidos eliminatorios "abiertos"
-- (con equipo_a y equipo_b ya conocidos y sin resultado todavía).
-- Después propaga el ganador a la siguiente ronda.
create or replace function admin_rellenar_elim_random(p_usuario_id uuid, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  ganador text;
begin
  if not _es_admin(p_usuario_id, p_token) then raise exception 'Solo admin'; end if;
  -- Ronda a ronda (porque hay que propagar antes de la siguiente)
  for r in select * from partidos where fase in ('r32','r16','qf','sf','final') and resultado is null and equipo_a is not null and equipo_b is not null order by orden loop
    ganador := case when random() < 0.5 then r.equipo_a else r.equipo_b end;
    update partidos set resultado = ganador where id = r.id;
    perform _propagar_ganador(r.id, ganador);
  end loop;
end; $$;

-- RESET total: borra resultados, pronósticos y partidos eliminatorios.
-- Mantiene usuarios y partidos de grupos (sin resultado).
create or replace function admin_reset_todo(p_usuario_id uuid, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _es_admin(p_usuario_id, p_token) then raise exception 'Solo admin'; end if;
  delete from pronosticos;
  update partidos set goles_a = null, goles_b = null, resultado = null where fase = 'grupos';
  delete from partidos where fase in ('r32','r16','qf','sf','final');
  delete from config where clave like 'next_%';
  update config set valor = 'false' where clave in ('eliminatorias_abiertas','bracket_bloqueado');
end; $$;

-- Solo borrar pronósticos de un usuario (útil si solo quieres "limpiar tus picks" para volver a probar)
create or replace function admin_borrar_pronosticos_usuario(p_usuario_id uuid, p_token uuid, p_nombre_obj text)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not _es_admin(p_usuario_id, p_token) then raise exception 'Solo admin'; end if;
  select id into v_id from usuarios where lower(nombre) = lower(trim(p_nombre_obj));
  if v_id is null then raise exception 'Usuario no encontrado'; end if;
  delete from pronosticos where usuario_id = v_id;
end; $$;

grant execute on function admin_rellenar_grupos_random(uuid,uuid) to anon, authenticated;
grant execute on function admin_rellenar_elim_random(uuid,uuid) to anon, authenticated;
grant execute on function admin_reset_todo(uuid,uuid) to anon, authenticated;
grant execute on function admin_borrar_pronosticos_usuario(uuid,uuid,text) to anon, authenticated;
