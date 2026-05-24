-- Parche 04: permitir al admin editar los equipos de cualquier partido eliminatorio.
-- Útil para corregir el bracket si FIFA difiere del nuestro o si hay que ajustar a mano.

create or replace function admin_editar_partido_elim(
  p_usuario_id uuid, p_token uuid,
  p_partido_id text, p_equipo_a text, p_equipo_b text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_partido partidos%rowtype;
  v_old_result text;
  v_next_a text;
  v_next_b text;
begin
  if not _es_admin(p_usuario_id, p_token) then raise exception 'Solo admin'; end if;
  select * into v_partido from partidos where id = p_partido_id;
  if not found then raise exception 'Partido no existe'; end if;
  if v_partido.fase = 'grupos' then raise exception 'No editable desde aquí: partido de grupos'; end if;

  v_old_result := v_partido.resultado;

  update partidos set equipo_a = p_equipo_a, equipo_b = p_equipo_b, resultado = null
    where id = p_partido_id;

  -- Si había un resultado, también limpiar la propagación a la siguiente ronda
  if v_old_result is not null then
    select valor into v_next_a from config where clave = 'next_' || p_partido_id || '_a';
    if v_next_a is not null then
      update partidos set equipo_a = null, resultado = null where id = v_next_a;
    end if;
    select valor into v_next_b from config where clave = 'next_' || p_partido_id || '_b';
    if v_next_b is not null then
      update partidos set equipo_b = null, resultado = null where id = v_next_b;
    end if;
  end if;
end; $$;

grant execute on function admin_editar_partido_elim(uuid,uuid,text,text,text) to anon, authenticated;
