-- Parche 08: bot automático para meter resultados desde GitHub Actions
--
-- Crea una nueva función `bot_set_resultado` que NO requiere ser un usuario
-- admin con session_token. En su lugar, valida una `bot_key` secreta guardada
-- en la tabla config. Esta clave se guarda como secreto en GitHub Actions y
-- el script Python la usa cada vez que mete un resultado.
--
-- Esto evita el problema de que el session_token del admin caduque o cambie
-- al hacer login/logout.

-- 1) Clave bot en config. ⚠️ El admin DEBE cambiar este valor por uno aleatorio
--    nada más ejecutar este SQL. Genera uno con: openssl rand -hex 32
insert into config(clave, valor) values
  ('bot_key', 'CAMBIA_ESTE_VALOR_POR_UN_HEX_ALEATORIO_DE_64_CHARS')
on conflict (clave) do nothing;

-- 2) Función bot_set_resultado: similar a admin_set_resultado pero usa bot_key
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

  -- Si ya hay resultado, no sobrescribir (evita pisar correcciones manuales del admin)
  if v_partido.resultado is not null then
    -- Solo permite sobrescribir si los goles que vienen son distintos
    -- (caso: ESPN actualizó la info por error inicial)
    if v_partido.goles_a = p_goles_a and v_partido.goles_b = p_goles_b then
      return;  -- no hay nada que cambiar
    end if;
  end if;

  if v_partido.fase = 'grupos' then
    if p_goles_a is null or p_goles_b is null then raise exception 'Faltan goles'; end if;
    if p_goles_a > p_goles_b then v_res := 'A';
    elsif p_goles_b > p_goles_a then v_res := 'B';
    else v_res := 'EMPATE'; end if;
    update partidos set goles_a = p_goles_a, goles_b = p_goles_b, resultado = v_res
      where id = p_partido_id;
  else
    if p_ganador is null then raise exception 'Falta ganador para partido eliminatorio'; end if;
    if p_ganador not in (v_partido.equipo_a, v_partido.equipo_b) then
      raise exception 'Ganador % no juega en %', p_ganador, p_partido_id;
    end if;
    update partidos set goles_a = p_goles_a, goles_b = p_goles_b, resultado = p_ganador
      where id = p_partido_id;
    perform _propagar_ganador(p_partido_id, p_ganador);
  end if;
end; $$;

-- 3) Función para que el admin pueda regenerar la bot_key cuando quiera
create or replace function admin_regenerar_bot_key(p_usuario_id uuid, p_token uuid, p_nueva_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _es_admin(p_usuario_id, p_token) then raise exception 'Solo admin'; end if;
  if length(p_nueva_key) < 32 then raise exception 'La bot key debe tener al menos 32 caracteres'; end if;
  update config set valor = p_nueva_key where clave = 'bot_key';
end; $$;

grant execute on function bot_set_resultado(text,text,int,int,text) to anon, authenticated;
grant execute on function admin_regenerar_bot_key(uuid,uuid,text) to anon, authenticated;
