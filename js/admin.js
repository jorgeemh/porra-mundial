// Panel admin
(async function() {
  const sesion = Sesion.requerir(); if (!sesion) return;
  if (!sesion.es_admin) { await Modal.alert("Acceso solo admin"); location.href = "pronosticos.html"; return; }
  $("#usuario-nombre").textContent = "👤 " + sesion.nombre + " (admin)";
  $("#btn-salir").addEventListener("click", e => { e.preventDefault(); Sesion.cerrar(); location.href = "index.html"; });

  function ok(msg) { const el = $("#ok"); el.textContent = msg; el.style.display = "block"; setTimeout(()=>el.style.display="none", 3000); }

  // ---------- 1) Cargar calendario ----------
  $("#btn-cargar-calendario").onclick = async () => {
    limpiarError();
    try {
      const j = await fetch("data/partidos.json").then(r=>r.json());
      const arr = j.partidos_grupos.map((p, i) => ({
        id: p.id, fase: "grupos", grupo: p.grupo,
        equipo_a: p.equipo_a, equipo_b: p.equipo_b,
        fecha_hora: p.fecha_hora, orden: i
      }));
      const { error } = await sb.rpc("admin_cargar_partidos", {
        p_usuario_id: sesion.id, p_token: sesion.token, p_partidos: arr
      });
      if (error) throw error;
      // Actualiza fecha límite global
      await sb.from("config").update({ valor: j.fecha_limite_grupos }).eq("clave","fecha_limite_grupos");
      ok("Calendario cargado ✅");
      await refrescar();
    } catch (e) { mostrarError(e.message); }
  };

  // ---------- Carga de datos ----------
  let partidos = [], usuarios = [];
  async function refrescar() {
    const [p, u] = await Promise.all([
      sb.from("partidos").select("*").order("orden"),
      sb.from("usuarios_publico").select("*").order("nombre")
    ]);
    partidos = p.data || []; usuarios = u.data || [];
    renderGrupos(); renderElim(); renderUsuarios();
  }

  // ---------- 2) Resultados grupos ----------
  function renderGrupos() {
    const grupos = partidos.filter(p => p.fase === "grupos");
    if (grupos.length === 0) { $("#lista-grupos").innerHTML = "<p>Carga primero el calendario.</p>"; return; }
    const porGrupo = {};
    for (const p of grupos) (porGrupo[p.grupo] ||= []).push(p);
    $("#lista-grupos").innerHTML = Object.keys(porGrupo).sort().map(g => `
      <details><summary>Grupo ${g}</summary>
      <table class="tabla-detalle">
        <thead><tr><th>Partido</th><th>Goles A</th><th>Goles B</th><th></th></tr></thead>
        <tbody>
        ${porGrupo[g].map(p => `
          <tr data-id="${p.id}">
            <td>${p.equipo_a} vs ${p.equipo_b}</td>
            <td><input type="number" min="0" class="ga" value="${p.goles_a ?? ''}" style="width:60px"></td>
            <td><input type="number" min="0" class="gb" value="${p.goles_b ?? ''}" style="width:60px"></td>
            <td><button class="save-grupo">Guardar</button> ${p.resultado ? '✅' : ''}</td>
          </tr>`).join("")}
        </tbody>
      </table></details>
    `).join("");
    $$(".save-grupo").forEach(btn => btn.onclick = async () => {
      const tr = btn.closest("tr");
      const id = tr.dataset.id;
      const ga = parseInt(tr.querySelector(".ga").value);
      const gb = parseInt(tr.querySelector(".gb").value);
      if (isNaN(ga) || isNaN(gb)) { mostrarError("Pon ambos goles"); return; }
      const { error } = await sb.rpc("admin_set_resultado", {
        p_usuario_id: sesion.id, p_token: sesion.token,
        p_partido_id: id, p_goles_a: ga, p_goles_b: gb, p_ganador: null
      });
      if (error) mostrarError(error.message); else { ok("Guardado"); await refrescar(); }
    });
  }

  // ---------- 3) Generar bracket ----------
  $("#btn-generar-bracket").onclick = async () => {
    limpiarError();
    try {
      const j = await fetch("data/bracket.json").then(r=>r.json());
      const partidosGrupos = partidos.filter(p => p.fase === "grupos");
      const pendientes = partidosGrupos.filter(p => !p.resultado);
      if (pendientes.length > 0) {
        const ok = await Modal.confirm(
          `Hay ${pendientes.length} partidos de grupos sin resultado. ¿Generar el cuadro de todas formas?`,
          "Faltan resultados", { okText: "Generar igualmente", peligro: true });
        if (!ok) return;
      }

      // 1. Calcular clasificaciones por grupo
      const tabla = calcularClasificaciones(partidosGrupos);
      // 2. Determinar 8 mejores terceros
      const terceros = elegirMejoresTerceros(tabla);
      // 3. Resolver slots → equipo
      const slotEquipo = await resolverSlots(tabla, terceros);

      // 4. Construir partidos del bracket
      const fechas = window.PORRA_CONFIG.FECHAS_ELIM || {};
      const nuevosPartidos = [];
      const propagaciones = [];
      let orden = 1000;

      for (const m of j.r32) {
        nuevosPartidos.push({
          id: m.id, fase: "r32",
          equipo_a: slotEquipo[m.slot_a] || "?",
          equipo_b: slotEquipo[m.slot_b] || "?",
          fecha_hora: fechas[m.id] || null,
          orden: orden++
        });
      }
      // Propagaciones R32 → R16: por slot a/b según from_a/from_b
      const propsR16 = {};
      for (const m of j.r16) {
        propagaciones.push({ from: m.from_a, slot: "a", to: m.id });
        propagaciones.push({ from: m.from_b, slot: "b", to: m.id });
        nuevosPartidos.push({ id: m.id, fase: "r16", equipo_a: null, equipo_b: null, fecha_hora: fechas[m.id] || null, orden: orden++ });
      }
      for (const m of j.qf) {
        propagaciones.push({ from: m.from_a, slot: "a", to: m.id });
        propagaciones.push({ from: m.from_b, slot: "b", to: m.id });
        nuevosPartidos.push({ id: m.id, fase: "qf", equipo_a: null, equipo_b: null, fecha_hora: fechas[m.id] || null, orden: orden++ });
      }
      for (const m of j.sf) {
        propagaciones.push({ from: m.from_a, slot: "a", to: m.id });
        propagaciones.push({ from: m.from_b, slot: "b", to: m.id });
        nuevosPartidos.push({ id: m.id, fase: "sf", equipo_a: null, equipo_b: null, fecha_hora: fechas[m.id] || null, orden: orden++ });
      }
      for (const m of j.final) {
        propagaciones.push({ from: m.from_a, slot: "a", to: m.id });
        propagaciones.push({ from: m.from_b, slot: "b", to: m.id });
        nuevosPartidos.push({ id: m.id, fase: "final", equipo_a: null, equipo_b: null, fecha_hora: fechas[m.id] || null, orden: orden++ });
      }

      const { error } = await sb.rpc("admin_generar_eliminatorias", {
        p_usuario_id: sesion.id, p_token: sesion.token,
        p_partidos_bracket: nuevosPartidos, p_propagaciones: propagaciones
      });
      if (error) throw error;
      ok("Bracket generado ✅");
      await refrescar();
    } catch (e) { mostrarError(e.message); }
  };

  function calcularClasificaciones(matches) {
    // Devuelve { [grupo]: [{equipo, pj, g, e, p, gf, gc, dg, pts}] ordenado }
    const equipos = {};
    for (const m of matches) {
      const g = m.grupo;
      (equipos[g] ||= {});
      for (const e of [m.equipo_a, m.equipo_b]) {
        equipos[g][e] ||= {equipo:e, pj:0, g:0, e:0, p:0, gf:0, gc:0, dg:0, pts:0};
      }
    }
    for (const m of matches) {
      if (!m.resultado) continue;
      const a = equipos[m.grupo][m.equipo_a];
      const b = equipos[m.grupo][m.equipo_b];
      a.pj++; b.pj++;
      a.gf += m.goles_a; a.gc += m.goles_b;
      b.gf += m.goles_b; b.gc += m.goles_a;
      if (m.resultado === "A") { a.g++; b.p++; a.pts += 3; }
      else if (m.resultado === "B") { b.g++; a.p++; b.pts += 3; }
      else { a.e++; b.e++; a.pts++; b.pts++; }
    }
    const out = {};
    for (const g of Object.keys(equipos)) {
      out[g] = Object.values(equipos[g])
        .map(t => ({...t, dg: t.gf - t.gc}))
        .sort((x,y) => y.pts-x.pts || y.dg-x.dg || y.gf-x.gf || x.equipo.localeCompare(y.equipo));
    }
    return out;
  }

  function elegirMejoresTerceros(tabla) {
    // Toma el 3º de cada grupo y ordena por (pts, dg, gf). Devuelve los 8 mejores.
    const terceros = Object.entries(tabla)
      .map(([g, arr]) => ({ grupo: g, ...arr[2] }))
      .filter(t => t.equipo)
      .sort((x,y) => y.pts-x.pts || y.dg-x.dg || y.gf-x.gf || x.equipo.localeCompare(y.equipo));
    return terceros.slice(0, 8);
  }

  // Asigna los 8 mejores terceros a sus slots oficiales FIFA usando el Annex C.
  // El JSON usa IDs R32_X (la columna de la tabla FIFA: 1A→R32_7, 1B→R32_13, etc.).
  // Nuestro bracket.json usa slots 3W1..3W8. Mapeo:
  const R32_A_3W = {
    "R32_2":  "3W1",  // M74 (1E)
    "R32_5":  "3W2",  // M77 (1I)
    "R32_7":  "3W3",  // M79 (1A)
    "R32_8":  "3W4",  // M80 (1L)
    "R32_9":  "3W5",  // M81 (1D)
    "R32_10": "3W6",  // M82 (1G)
    "R32_13": "3W7",  // M85 (1B)
    "R32_15": "3W8"   // M87 (1K)
  };

  async function asignarSlots3W(terceros) {
    const lookup = await fetch("data/fifa_annex_c.json").then(r=>r.json());
    const grupos = terceros.map(t => t.grupo).sort();
    const key = grupos.join("");
    const asigPorR32 = lookup[key];
    if (!asigPorR32) throw new Error(`Combinación de grupos "${key}" no encontrada en FIFA Annex C. ¿Hay menos de 8 terceros clasificados?`);
    const terceroPorGrupo = Object.fromEntries(terceros.map(t => [t.grupo, t]));
    const asignacion = {};
    for (const r32Id of Object.keys(asigPorR32)) {
      const grupoLetra = asigPorR32[r32Id];
      const slot3W = R32_A_3W[r32Id];
      const tercero = terceroPorGrupo[grupoLetra];
      if (!tercero) throw new Error(`Bug: la combinación dice que el 3º del grupo ${grupoLetra} va a ${r32Id}, pero ese grupo no está entre los 8 mejores terceros.`);
      asignacion[slot3W] = tercero.equipo;
    }
    return asignacion;
  }

  async function resolverSlots(tabla, terceros) {
    const m = {};
    for (const g of Object.keys(tabla)) {
      if (tabla[g][0]) m["1"+g] = tabla[g][0].equipo;
      if (tabla[g][1]) m["2"+g] = tabla[g][1].equipo;
      if (tabla[g][2]) m["3"+g] = tabla[g][2].equipo;
    }
    // Asignación FIFA-oficial de los 8 mejores terceros (Annex C)
    const asig3W = await asignarSlots3W(terceros);
    for (const slot of Object.keys(asig3W)) {
      m[slot] = asig3W[slot];
    }
    return m;
  }

  // ---------- 4) Resultados eliminatorias ----------
  function renderElim() {
    const elim = partidos.filter(p => p.fase !== "grupos");
    if (elim.length === 0) { $("#lista-elim").innerHTML = "<p>Aún no hay bracket.</p>"; return; }
    const fases = ["r32","r16","qf","sf","final"];
    const titulos = {r32:"Dieciseisavos", r16:"Octavos", qf:"Cuartos", sf:"Semis", final:"Final"};
    $("#lista-elim").innerHTML = fases.map(f => {
      const ms = elim.filter(p => p.fase === f);
      if (ms.length === 0) return "";
      return `<h3>${titulos[f]}</h3>
        <table class="tabla-detalle"><tbody>
        ${ms.map(p => `
          <tr data-id="${p.id}">
            <td>${p.id}</td>
            <td>${p.equipo_a ? equipoLabel(p.equipo_a) : "?"} vs ${p.equipo_b ? equipoLabel(p.equipo_b) : "?"}
              <button class="edit-teams" title="Editar equipos de este partido" style="padding:4px 8px; font-size:.8rem; margin-left:6px">✏️</button>
            </td>
            <td>
              <select class="winner" ${!p.equipo_a||!p.equipo_b?'disabled':''}>
                <option value="">— ganador —</option>
                ${p.equipo_a ? `<option value="${p.equipo_a}" ${p.resultado===p.equipo_a?'selected':''}>${equipoLabel(p.equipo_a)}</option>` : ""}
                ${p.equipo_b ? `<option value="${p.equipo_b}" ${p.resultado===p.equipo_b?'selected':''}>${equipoLabel(p.equipo_b)}</option>` : ""}
              </select>
            </td>
            <td><button class="save-elim" ${!p.equipo_a||!p.equipo_b?'disabled':''}>Guardar</button> ${p.resultado?'✅':''}</td>
          </tr>`).join("")}
        </tbody></table>`;
    }).join("");
    $$(".save-elim").forEach(btn => btn.onclick = async () => {
      const tr = btn.closest("tr");
      const ganador = tr.querySelector(".winner").value;
      if (!ganador) { mostrarError("Elige ganador"); return; }
      const { error } = await sb.rpc("admin_set_resultado", {
        p_usuario_id: sesion.id, p_token: sesion.token,
        p_partido_id: tr.dataset.id, p_goles_a: null, p_goles_b: null, p_ganador: ganador
      });
      if (error) mostrarError(error.message); else { ok("Guardado"); await refrescar(); }
    });
    $$(".edit-teams").forEach(btn => btn.onclick = async () => {
      const id = btn.closest("tr").dataset.id;
      const partido = partidos.find(p => p.id === id);
      const r = await abrirEditorEquipos(id, partido.equipo_a, partido.equipo_b);
      if (!r) return;
      if (r.equipo_a === r.equipo_b) { mostrarError("Los dos equipos no pueden ser iguales"); return; }
      const { error } = await sb.rpc("admin_editar_partido_elim", {
        p_usuario_id: sesion.id, p_token: sesion.token,
        p_partido_id: id, p_equipo_a: r.equipo_a, p_equipo_b: r.equipo_b
      });
      if (error) mostrarError(error.message); else { ok("Equipos actualizados ✅"); await refrescar(); }
    });
  }

  // Modal para editar los 2 equipos de un partido eliminatorio
  function abrirEditorEquipos(partidoId, actA, actB) {
    return new Promise(resolve => {
      const bg = document.createElement("div");
      bg.className = "modal-backdrop";
      const opciones = Object.entries(window.EQUIPOS)
        .sort((a,b) => a[1].nombre.localeCompare(b[1].nombre))
        .map(([code, info]) => `<option value="${code}">${info.flag} ${info.nombre}</option>`)
        .join("");
      bg.innerHTML = `
        <div class="modal">
          <h3>Editar equipos · ${partidoId}</h3>
          <p>Cambia qué equipos juegan este partido. Si el partido ya tenía resultado, se borrará (también en la siguiente ronda).</p>
          <label>Equipo A
            <select class="ea"><option value="">— elige —</option>${opciones}</select>
          </label>
          <label>Equipo B
            <select class="eb"><option value="">— elige —</option>${opciones}</select>
          </label>
          <div class="modal-acciones">
            <button class="secundario cancel">Cancelar</button>
            <button class="ok-btn">Guardar</button>
          </div>
        </div>`;
      document.body.appendChild(bg);
      const ea = bg.querySelector(".ea");
      const eb = bg.querySelector(".eb");
      if (actA) ea.value = actA;
      if (actB) eb.value = actB;
      const fin = v => { bg.remove(); resolve(v); };
      bg.querySelector(".ok-btn").onclick = () => {
        if (!ea.value || !eb.value) { ea.style.borderColor = !ea.value ? '#ef4444' : ''; eb.style.borderColor = !eb.value ? '#ef4444' : ''; return; }
        fin({equipo_a: ea.value, equipo_b: eb.value});
      };
      bg.querySelector(".cancel").onclick = () => fin(null);
      bg.addEventListener("click", e => { if (e.target === bg) fin(null); });
    });
  }

  // ---------- 2b) Bloquear pronósticos de grupos ----------
  async function refrescarEstadoGruposBloqueados() {
    const { data, error } = await sb.from("config").select("*").eq("clave","grupos_bloqueados").maybeSingle();
    const bloq = !error && data && data.valor === "true";
    const lbl = $("#estado-bloqueo-grupos");
    const btnB = $("#btn-bloquear-grupos");
    const btnD = $("#btn-desbloquear-grupos");
    if (!lbl || !btnB || !btnD) return;
    if (bloq) {
      lbl.innerHTML = "🔒 Pronósticos de grupos <b>bloqueados</b>.";
      lbl.style.color = "#b91c1c";
      btnB.style.display = "none";
      btnD.style.display = "inline-block";
    } else {
      lbl.innerHTML = "🟢 Pronósticos de grupos <b>abiertos</b> (se cerrarán automáticamente al pasar la fecha límite).";
      lbl.style.color = "";
      btnB.style.display = "inline-block";
      btnD.style.display = "none";
    }
  }
  $("#btn-bloquear-grupos").onclick = async () => {
    const c = await Modal.confirm("Tras esto nadie podrá modificar sus pronósticos de la fase de grupos.", "¿Bloquear pronósticos de grupos?", { okText: "Bloquear", peligro: true });
    if (!c) return;
    const { error } = await sb.rpc("admin_bloquear_grupos", { p_usuario_id: sesion.id, p_token: sesion.token });
    if (error) mostrarError(error.message);
    else { ok("Pronósticos de grupos bloqueados 🔒"); refrescarEstadoGruposBloqueados(); }
  };
  $("#btn-desbloquear-grupos").onclick = async () => {
    const c = await Modal.confirm("Los usuarios podrán volver a editar sus pronósticos de grupos (mientras no se haya pasado la fecha límite).", "¿Desbloquear?", { okText: "Desbloquear" });
    if (!c) return;
    const { error } = await sb.rpc("admin_desbloquear_grupos", { p_usuario_id: sesion.id, p_token: sesion.token });
    if (error) mostrarError(error.message);
    else { ok("Pronósticos de grupos desbloqueados 🔓"); refrescarEstadoGruposBloqueados(); }
  };
  refrescarEstadoGruposBloqueados();

  // ---------- 5) Bloquear bracket ----------
  $("#btn-bloquear").onclick = async () => {
    const c = await Modal.confirm("Tras esto nadie podrá cambiar su cuadro eliminatorio.", "¿Bloquear bracket?", { okText: "Bloquear", peligro: true });
    if (!c) return;
    const { error } = await sb.rpc("admin_bloquear_bracket", { p_usuario_id: sesion.id, p_token: sesion.token });
    if (error) mostrarError(error.message); else ok("Bracket bloqueado 🔒");
  };

  // ---------- 6) Usuarios ----------
  function renderUsuarios() {
    $("#lista-usuarios").innerHTML = `
      <table class="tabla-detalle">
        <thead><tr><th>Nombre</th><th>Admin</th><th>Acciones</th></tr></thead>
        <tbody>${usuarios.map(u => `
          <tr data-nombre="${u.nombre}">
            <td>${u.nombre}</td>
            <td>${u.es_admin ? "✅" : ""}</td>
            <td>
              <button class="reset-pin">Resetear PIN</button>
              <button class="toggle-admin">${u.es_admin ? "Quitar admin" : "Hacer admin"}</button>
            </td>
          </tr>`).join("")}</tbody>
      </table>`;
    $$(".reset-pin").forEach(btn => btn.onclick = async () => {
      const nombre = btn.closest("tr").dataset.nombre;
      const nuevo = await Modal.prompt(`Introduce un nuevo PIN de 4 dígitos para ${nombre}.`, "Resetear PIN", { type: "password", maxlength: 4, pattern: "[0-9]{4}", inputmode: "numeric", placeholder: "1234" });
      if (nuevo === null) return;
      if (!/^[0-9]{4}$/.test(nuevo)) { Modal.alert("El PIN debe ser exactamente 4 dígitos."); return; }
      const { error } = await sb.rpc("admin_reset_pin", { p_usuario_id: sesion.id, p_token: sesion.token, p_nombre_obj: nombre, p_nuevo_pin: nuevo });
      if (error) mostrarError(error.message); else ok(`PIN de ${nombre} actualizado`);
    });
    $$(".toggle-admin").forEach(btn => btn.onclick = async () => {
      const tr = btn.closest("tr");
      const nombre = tr.dataset.nombre;
      const u = usuarios.find(x => x.nombre === nombre);
      const { error } = await sb.rpc("admin_set_admin", { p_usuario_id: sesion.id, p_token: sesion.token, p_nombre_obj: nombre, p_es_admin: !u.es_admin });
      if (error) mostrarError(error.message); else { ok("Cambiado"); await refrescar(); }
    });
  }

  // ---------- 🧪 Modo prueba ----------
  $("#btn-test-grupos").onclick = async () => {
    const c = await Modal.confirm("Rellenará con goles aleatorios todos los partidos de grupos sin resultado.", "¿Rellenar grupos al azar?", { okText: "Rellenar" });
    if (!c) return;
    const { error } = await sb.rpc("admin_rellenar_grupos_random", { p_usuario_id: sesion.id, p_token: sesion.token });
    if (error) mostrarError(error.message); else { ok("Grupos rellenados 🎲"); await refrescar(); }
  };
  $("#btn-test-elim").onclick = async () => {
    const c = await Modal.confirm("Pondrá un ganador aleatorio a cada eliminatoria abierta y propagará al siguiente.", "¿Rellenar eliminatorias al azar?", { okText: "Rellenar" });
    if (!c) return;
    const { error } = await sb.rpc("admin_rellenar_elim_random", { p_usuario_id: sesion.id, p_token: sesion.token });
    if (error) mostrarError(error.message); else { ok("Eliminatorias rellenadas 🎲"); await refrescar(); }
  };
  $("#btn-test-reset").onclick = async () => {
    // Doble confirmación: primero un aviso, después tipear "BORRAR" exacto.
    const c1 = await Modal.confirm(
      "⚠️ Esta acción BORRARÁ TODOS los pronósticos y resultados de TODOS los usuarios. Esta acción no se puede deshacer.\n\nA continuación te pediremos que escribas 'BORRAR' para confirmar.",
      "¿Reset TOTAL?",
      { okText: "Continuar", peligro: true }
    );
    if (!c1) return;
    const palabra = await Modal.prompt(
      "Para confirmar, escribe exactamente la palabra BORRAR (en mayúsculas).",
      "Última confirmación",
      { placeholder: "BORRAR" }
    );
    if (palabra === null) return;
    if (palabra !== "BORRAR") {
      mostrarError("No coincide con 'BORRAR'. Operación cancelada.");
      return;
    }
    const { error } = await sb.rpc("admin_reset_todo", { p_usuario_id: sesion.id, p_token: sesion.token });
    if (error) mostrarError(error.message); else { ok("Todo reseteado ♻️"); await refrescar(); }
  };

  await refrescar();
})();
