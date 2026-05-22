// Clasificación: calcula aciertos y puntos para todos los usuarios
(async function() {
  const sesion = Sesion.requerir(); if (!sesion) return;
  $("#usuario-nombre").textContent = "👤 " + sesion.nombre;
  if (sesion.es_admin) $("#link-admin").style.display = "inline-block";
  $("#btn-salir").addEventListener("click", e => { e.preventDefault(); Sesion.cerrar(); location.href = "index.html"; });

  const PUNTOS = window.PORRA_CONFIG.PUNTOS;

  const [usuariosRes, partidosRes, pronRes] = await Promise.all([
    sb.from("usuarios_publico").select("*"),
    sb.from("partidos").select("*"),
    sb.from("pronosticos").select("*")
  ]);
  if (usuariosRes.error || partidosRes.error || pronRes.error) {
    mostrarError("Error cargando datos."); return;
  }

  const usuarios = usuariosRes.data;
  const partidos = partidosRes.data;
  const pron = pronRes.data;

  // Indexar
  const partPorId = Object.fromEntries(partidos.map(p => [p.id, p]));
  const pronPorUsuario = {};
  for (const p of pron) (pronPorUsuario[p.usuario_id] ||= []).push(p);

  // Calcular puntos por usuario
  const filas = usuarios.map(u => {
    const mis = pronPorUsuario[u.id] || [];
    let aciertos = 0, puntos = 0;
    // Grupos: 1 punto por match correcto
    for (const pr of mis) {
      const part = partPorId[pr.partido_id];
      if (!part || !part.resultado) continue;
      if (part.fase === "grupos") {
        if (pr.prediccion === part.resultado) { aciertos++; puntos += PUNTOS.grupos; }
      }
    }
    // Eliminatorias: por cada ronda, contar cuántos de los equipos que el usuario predijo
    // como "supervivientes" coinciden con los reales.
    const rondas = ["r32","r16","qf","sf","final"];
    const puntosRonda = { r32:PUNTOS.r32, r16:PUNTOS.r16, qf:PUNTOS.qf, sf:PUNTOS.sf, final:PUNTOS.final };
    for (const f of rondas) {
      const partidosFase = partidos.filter(p => p.fase === f);
      const partidosResueltos = partidosFase.filter(p => p.resultado);
      if (partidosResueltos.length === 0) continue;
      const ganadoresReales = new Set(partidosResueltos.map(p => p.resultado));
      const misPicksFase = new Set(mis
        .filter(pr => partPorId[pr.partido_id]?.fase === f)
        .map(pr => pr.prediccion));
      let n = 0;
      for (const eq of misPicksFase) if (ganadoresReales.has(eq)) n++;
      aciertos += n;
      puntos += n * puntosRonda[f];
    }
    return { id: u.id, nombre: u.nombre, aciertos, puntos };
  });

  filas.sort((a,b) => b.puntos - a.puntos || b.aciertos - a.aciertos || a.nombre.localeCompare(b.nombre));

  $("#tabla-body").innerHTML = filas.map((f,i) => `
    <tr ${f.id===sesion.id?'class="yo"':''}>
      <td>${i+1}</td><td>${f.nombre}</td><td>${f.aciertos}</td><td><b>${f.puntos}</b></td>
    </tr>
  `).join("") || "<tr><td colspan='4'>Sin participantes aún</td></tr>";

  // Selector de detalle
  const sel = $("#select-usuario");
  sel.innerHTML = filas.map(f => `<option value="${f.id}" ${f.id===sesion.id?'selected':''}>${f.nombre}</option>`).join("");
  sel.addEventListener("change", () => renderDetalle(sel.value));
  renderDetalle(sesion.id);

  function renderDetalle(uid) {
    const mis = pronPorUsuario[uid] || [];
    const grupos = mis.filter(p => partPorId[p.partido_id]?.fase === "grupos");
    const elim = mis.filter(p => partPorId[p.partido_id]?.fase !== "grupos");

    const filaGrupo = p => {
      const part = partPorId[p.partido_id]; if (!part) return "";
      const pred = p.prediccion === "A" ? part.equipo_a : p.prediccion === "B" ? part.equipo_b : "Empate";
      let resReal = "—", icono = "";
      if (part.resultado) {
        resReal = part.resultado === "A" ? part.equipo_a : part.resultado === "B" ? part.equipo_b : "Empate";
        icono = part.resultado === p.prediccion ? "✅" : "❌";
      }
      return `<tr><td>${part.equipo_a} vs ${part.equipo_b}</td><td>${pred}</td><td>${resReal} ${icono}</td></tr>`;
    };
    const filaElim = p => {
      const part = partPorId[p.partido_id]; if (!part) return "";
      const resReal = part.resultado || "—";
      const icono = part.resultado ? (part.resultado === p.prediccion ? "✅" : "❌") : "";
      return `<tr><td>${part.fase.toUpperCase()} (${part.id})</td><td>${p.prediccion}</td><td>${resReal} ${icono}</td></tr>`;
    };

    $("#detalle").innerHTML = `
      <h3>Fase de grupos</h3>
      <table class="tabla-detalle"><thead><tr><th>Partido</th><th>Tu pick</th><th>Real</th></tr></thead>
        <tbody>${grupos.map(filaGrupo).join("") || "<tr><td colspan='3'>Sin pronósticos</td></tr>"}</tbody></table>
      <h3>Eliminatorias</h3>
      <table class="tabla-detalle"><thead><tr><th>Ronda</th><th>Tu pick</th><th>Real</th></tr></thead>
        <tbody>${elim.map(filaElim).join("") || "<tr><td colspan='3'>Sin pronósticos</td></tr>"}</tbody></table>
    `;
  }
})();
