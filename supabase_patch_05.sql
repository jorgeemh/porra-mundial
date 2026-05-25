-- Parche 05: permitir al admin bloquear los pronósticos de la fase de grupos manualmente,
-- igual que ya se puede hacer con el bracket eliminatorio.
--
-- Hasta ahora, la fase de grupos quedaba cerrada automáticamente al pasar la
-- fecha_limite_grupos. Con esto el admin puede forzar el bloqueo en cualquier momento
-- (p.ej. si decide adelantarlo o si la fecha límite está mal configurada).

-- 1) Nueva clave en config (idempotente)
insert into config(clave, valor) values ('grupos_bloqueados', 'false')
  on conflict (clave) do nothing;

-- 2) Función para que el admin bloquee/desbloquee los pronósticos de grupos
create or replace function admin_bloquear_grupos(p_usuario_id uuid, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _es_admin(p_usuario_id, p_token) then raise exception 'Solo admin'; end if;
  update config set valor = 'true' where clave = 'grupos_bloqueados';
end; $$;

create or replace function admin_desbloquear_grupos(p_usuario_id uuid, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _es_admin(p_usuario_id, p_token) then raise exception 'Solo admin'; end if;
  update config set valor = 'false' where clave = 'grupos_bloqueados';
end; $$;

-- 3) Reemplazar guardar_pronostico_grupos para que también respete el flag manual
create or replace function guardar_pronostico_grupos(
  p_usuario_id uuid, p_token uuid, p_partido_id text, p_prediccion text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_limite timestamptz;
  v_bloqueado text;
  v_partido partidos%rowtype;
begin
  if not _verificar_token(p_usuario_id, p_token) then raise exception 'Sesión inválida'; end if;
  if p_prediccion not in ('A','B','EMPATE') then raise exception 'Predicción inválida'; end if;

  select valor into v_bloqueado from config where clave = 'grupos_bloqueados';
  if v_bloqueado = 'true' then raise exception 'La fase de grupos está bloqueada'; end if;

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

grant execute on function admin_bloquear_grupos(uuid,uuid) to anon, authenticated;
grant execute on function admin_desbloquear_grupos(uuid,uuid) to anon, authenticated;
