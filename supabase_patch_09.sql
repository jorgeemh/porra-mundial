-- Parche 09: bot más seguro + soporte de eliminatorias
--
-- CAMBIO CLAVE DE SEGURIDAD: el bot ahora SOLO rellena partidos que no tienen
-- resultado todavía. Si un partido YA tiene resultado (lo metió el admin a mano
-- o el propio bot en una pasada anterior), el bot NO lo toca nunca más.
--
-- Esto garantiza que ninguna corrección manual del admin pueda ser pisada por
-- el bot, aunque ESPN reporte algo distinto.

create or replace function bot_set_resultado(
  p_bot_key text,
  p_partido_id text,
  p_goles_a int,
  p_goles_b int,
  p_ganador text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_partido partidos%rowtype;
  v_res text;
  v_stored text;
begin
  -- Validar bot key
  select valor into v_stored from config where clave = 'bot_key';
  if v_stored is null or v_stored = 'CAMBIA_ESTE_VALOR_POR_UN_HEX_ALEATORIO_DE_64_CHARS' then
    raise exception 'Bot key no configurada. El admin debe actualizar config.bot_key.';
  end if;
  if p_bot_key <> v_stored then
    raise exception 'Bot key inválida';
  end if;

  select * into v_partido from partidos where id = p_partido_id;
  if not found then raise exception 'Partido % no existe', p_partido_id; end if;

  -- 🔒 BLINDAJE: si el partido YA tiene resultado, el bot NO lo toca.
  -- Esto protege cualquier corrección manual del admin (y evita repropagaciones).
  if v_partido.resultado is not null then
    return;  -- ya está resuelto, el bot se aparta
  end if;

  if v_partido.fase = 'grupos' then
    if p_goles_a is null or p_goles_b is null then raise exception 'Faltan goles'; end if;
    if p_goles_a > p_goles_b then v_res := 'A';
    elsif p_goles_b > p_goles_a then v_res := 'B';
    else v_res := 'EMPATE'; end if;
    update partidos set goles_a = p_goles_a, goles_b = p_goles_b, resultado = v_res
      where id = p_partido_id;
  else
    -- Eliminatorias: el resultado es el equipo ganador (incluye penaltis).
    if p_ganador is null then raise exception 'Falta ganador para partido eliminatorio'; end if;
    if p_ganador not in (v_partido.equipo_a, v_partido.equipo_b) then
      raise exception 'Ganador % no juega en %', p_ganador, p_partido_id;
    end if;
    update partidos set goles_a = p_goles_a, goles_b = p_goles_b, resultado = p_ganador
      where id = p_partido_id;
    perform _propagar_ganador(p_partido_id, p_ganador);
  end if;
end; $$;

grant execute on function bot_set_resultado(text,text,int,int,text) to anon, authenticated;
