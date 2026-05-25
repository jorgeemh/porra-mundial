-- Parche 07: Premios individuales (Máximo Goleador y MVP del torneo)
--
-- Almacenamos las predicciones de premios reutilizando la tabla `pronosticos`
-- con dos partidos ficticios:
--   id = 'PREMIO_GOLEADOR', fase = 'premio'
--   id = 'PREMIO_MVP',      fase = 'premio'
-- La columna `prediccion` guarda el ID del jugador (definido en data/jugadores.json).
-- La columna `resultado` del partido ficticio guarda el ID del ganador real cuando
-- termine el torneo (lo mete el admin).

-- 1) Flags de bloqueo
insert into config(clave, valor) values
  ('goleador_bloqueado', 'false'),
  ('mvp_bloqueado', 'false')
on conflict (clave) do nothing;

-- 2) Asegurar los dos partidos ficticios
insert into partidos(id, fase) values
  ('PREMIO_GOLEADOR', 'premio'),
  ('PREMIO_MVP', 'premio')
on conflict (id) do nothing;

-- 3) Guardar el pronóstico de premio del usuario
create or replace function guardar_pronostico_premio(
  p_usuario_id uuid, p_token uuid, p_tipo text, p_jugador_id text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_bloqueado text;
  v_partido_id text;
begin
  if not _verificar_token(p_usuario_id, p_token) then raise exception 'Sesión inválida'; end if;
  if p_tipo not in ('goleador', 'mvp') then raise exception 'Tipo de premio inválido'; end if;
  if p_jugador_id is null or length(trim(p_jugador_id)) = 0 then raise exception 'Jugador inválido'; end if;

  select valor into v_bloqueado from config where clave = p_tipo || '_bloqueado';
  if v_bloqueado = 'true' then raise exception 'El pronóstico de % está bloqueado', p_tipo; end if;

  v_partido_id := 'PREMIO_' || upper(p_tipo);

  insert into pronosticos(usuario_id, partido_id, prediccion)
    values (p_usuario_id, v_partido_id, p_jugador_id)
    on conflict (usuario_id, partido_id)
    do update set prediccion = excluded.prediccion, actualizado_en = now();
end; $$;

-- 4) Admin: bloquear / desbloquear pronósticos de premios
create or replace function admin_bloquear_premio(p_usuario_id uuid, p_token uuid, p_tipo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _es_admin(p_usuario_id, p_token) then raise exception 'Solo admin'; end if;
  if p_tipo not in ('goleador', 'mvp') then raise exception 'Tipo inválido'; end if;
  update config set valor = 'true' where clave = p_tipo || '_bloqueado';
end; $$;

create or replace function admin_desbloquear_premio(p_usuario_id uuid, p_token uuid, p_tipo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _es_admin(p_usuario_id, p_token) then raise exception 'Solo admin'; end if;
  if p_tipo not in ('goleador', 'mvp') then raise exception 'Tipo inválido'; end if;
  update config set valor = 'false' where clave = p_tipo || '_bloqueado';
end; $$;

-- 5) Admin: marcar el ganador real del premio cuando termine el torneo
create or replace function admin_set_ganador_premio(
  p_usuario_id uuid, p_token uuid, p_tipo text, p_jugador_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_partido_id text;
begin
  if not _es_admin(p_usuario_id, p_token) then raise exception 'Solo admin'; end if;
  if p_tipo not in ('goleador', 'mvp') then raise exception 'Tipo inválido'; end if;
  v_partido_id := 'PREMIO_' || upper(p_tipo);
  update partidos set resultado = p_jugador_id where id = v_partido_id;
end; $$;

grant execute on function guardar_pronostico_premio(uuid,uuid,text,text) to anon, authenticated;
grant execute on function admin_bloquear_premio(uuid,uuid,text) to anon, authenticated;
grant execute on function admin_desbloquear_premio(uuid,uuid,text) to anon, authenticated;
grant execute on function admin_set_ganador_premio(uuid,uuid,text,text) to anon, authenticated;
