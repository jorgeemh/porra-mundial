-- Parche 06:
--  1) Cierre por partido: cada partido de grupos se cierra automáticamente en su hora de inicio.
--     Antes había un único deadline global (fecha_limite_grupos) que permitía editar picks
--     incluso si el partido ya había empezado.
--  2) Fix defensivo en _propagar_ganador: quitar el `return` prematuro para que en caso raro
--     de doble propagación, ambas se ejecuten.

-- ---------- 1) Cierre por partido ----------
create or replace function guardar_pronostico_grupos(
  p_usuario_id uuid, p_token uuid, p_partido_id text, p_prediccion text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_limite_global timestamptz;
  v_bloqueado text;
  v_partido partidos%rowtype;
begin
  if not _verificar_token(p_usuario_id, p_token) then raise exception 'Sesión inválida'; end if;
  if p_prediccion not in ('A','B','EMPATE') then raise exception 'Predicción inválida'; end if;

  -- Bloqueo manual del admin (parche 05)
  select valor into v_bloqueado from config where clave = 'grupos_bloqueados';
  if v_bloqueado = 'true' then raise exception 'La fase de grupos está bloqueada'; end if;

  select * into v_partido from partidos where id = p_partido_id;
  if not found then raise exception 'Partido no existe'; end if;
  if v_partido.fase <> 'grupos' then raise exception 'No es un partido de grupos'; end if;

  -- Cierre individual: cada partido se cierra en su propia hora de inicio
  if v_partido.fecha_hora is not null and now() >= v_partido.fecha_hora then
    raise exception 'Este partido ya ha empezado, no puedes cambiar el pronóstico';
  end if;

  -- Cierre global (compatibilidad con la fecha límite antigua, sigue siendo respetada)
  select valor::timestamptz into v_limite_global from config where clave = 'fecha_limite_grupos';
  if v_limite_global is not null and now() >= v_limite_global then
    raise exception 'La fase de grupos ya está cerrada (deadline global)';
  end if;

  insert into pronosticos(usuario_id, partido_id, prediccion)
    values (p_usuario_id, p_partido_id, p_prediccion)
    on conflict (usuario_id, partido_id)
    do update set prediccion = excluded.prediccion, actualizado_en = now();
end; $$;

-- ---------- 2) Fix _propagar_ganador ----------
create or replace function _propagar_ganador(p_partido_id text, p_equipo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_next text;
begin
  -- Slot A del siguiente
  select valor into v_next from config where clave = 'next_' || p_partido_id || '_a';
  if v_next is not null then
    update partidos set equipo_a = p_equipo where id = v_next;
    -- Nota: ya no salimos aquí; comprobamos también el slot B por si acaso
  end if;
  -- Slot B del siguiente
  select valor into v_next from config where clave = 'next_' || p_partido_id || '_b';
  if v_next is not null then
    update partidos set equipo_b = p_equipo where id = v_next;
  end if;
end; $$;

grant execute on function guardar_pronostico_grupos(uuid,uuid,text,text) to anon, authenticated;
