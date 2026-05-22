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
      const slotEquipo = resolverSlots(tabla, terceros);

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

  function resolverSlots(tabla, terceros) {
    const m = {};
    for (const g of Object.keys(tabla)) {
      if (tabla[g][0]) m["1"+g] = tabla[g][0].equipo;
      if (tabla[g][1]) m["2"+g] = tabla[g][1].equipo;
      if (tabla[g][2]) m["3"+g] = tabla[g][2].equipo;
    }
    terceros.forEach((t, i) => { m["3W"+(i+1)] = t.equipo; });
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
            <td>${p.equipo_a || "?"} vs ${p.equipo_b || "?"}</td>
            <td>
              <select class="winner" ${!p.equipo_a||!p.equipo_b?'disabled':''}>
                <option value="">— ganador —</option>
                ${p.equipo_a ? `<option ${p.resultado===p.equipo_a?'selected':''}>${p.equipo_a}</option>` : ""}
                ${p.equipo_b ? `<option ${p.resultado===p.equipo_b?'selected':''}>${p.equipo_b}</option>` : ""}
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
  }

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

  await refrescar();
})();
