// Clasificación: calcula aciertos y puntos para todos los usuarios
(async function() {
  const sesion = Sesion.requerir(); if (!sesion) return;
  $("#usuario-nombre").textContent = "👤 " + sesion.nombre;
  if (sesion.es_admin) $("#link-admin").style.display = "inline-block";
  $("#btn-salir").addEventListener("click", e => { e.preventDefault(); Sesion.cerrar(); location.href = "index.html"; });

  const PUNTOS = window.PORRA_CONFIG.PUNTOS;

  // ----- Explicación dinámica de la puntuación -----
  (function renderExplicacionPuntos() {
    const el = $("#explicacion-puntos-body");
    if (!el) return;
    el.innerHTML = `
      <p class="explicacion-intro">
        Tu puntuación final es la suma de todos los aciertos en las distintas fases del torneo
        más los premios individuales. <b>Cuanto más avanzada es la fase, más puntos vale acertar.</b>
      </p>

      <div class="puntos-tabla">
        <h4>⚽ Fase de grupos</h4>
        <ul>
          <li><b>${PUNTOS.grupos} pto</b> por cada partido en el que aciertes el resultado (gana A, empate, o gana B). No hace falta marcador exacto.</li>
        </ul>

        <h4>🏆 Cuadro eliminatorio</h4>
        <p class="explicacion-nota">Aquí lo que cuenta es predecir <b>qué selecciones avanzan</b> a cada ronda. Por cada equipo que pongas en tu bracket y que efectivamente alcance esa ronda, ganas:</p>
        <ul>
          <li><b>${PUNTOS.r32} ptos</b> · por cada equipo que llegue a octavos (dieciseisavos resueltos)</li>
          <li><b>${PUNTOS.r16} ptos</b> · por cada equipo que llegue a cuartos</li>
          <li><b>${PUNTOS.qf} ptos</b> · por cada equipo que llegue a semifinales</li>
          <li><b>${PUNTOS.sf} ptos</b> · por cada equipo que llegue a la final</li>
          <li><b>${PUNTOS.final} ptos</b> · si aciertas el campeón del Mundial</li>
        </ul>

        <h4>⭐ Premios individuales</h4>
        <ul>
          <li><b>${PUNTOS.goleador} ptos</b> · si aciertas el máximo goleador del torneo</li>
          <li><b>${PUNTOS.mvp} ptos</b> · si aciertas el MVP del torneo</li>
        </ul>
      </div>

      <div class="puntos-ejemplo">
        <b>📌 Ejemplo de máximo teórico</b><br>
        72 partidos de grupos × ${PUNTOS.grupos} + 16 picks correctos en r32 × ${PUNTOS.r32} + 8 × ${PUNTOS.r16} + 4 × ${PUNTOS.qf} + 2 × ${PUNTOS.sf} + 1 × ${PUNTOS.final} + ${PUNTOS.goleador} + ${PUNTOS.mvp}
        = <b>${72*PUNTOS.grupos + 16*PUNTOS.r32 + 8*PUNTOS.r16 + 4*PUNTOS.qf + 2*PUNTOS.sf + PUNTOS.final + PUNTOS.goleador + PUNTOS.mvp} puntos</b>
        si lo aciertas absolutamente todo.
      </div>

      <p class="explicacion-nota" style="margin-top:14px">
        <b>Desempate:</b> en caso de empate a puntos, gana quien tenga más aciertos totales. Si persiste el empate, orden alfabético.
      </p>
    `;
  })();

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

    // Premios: máximo goleador y MVP del torneo (15 puntos cada uno si aciertas)
    for (const tipo of ["GOLEADOR","MVP"]) {
      const pid = "PREMIO_" + tipo;
      const part = partPorId[pid];
      if (!part || !part.resultado) continue;
      const mi = mis.find(pr => pr.partido_id === pid);
      if (mi && mi.prediccion === part.resultado) {
        aciertos++;
        puntos += PUNTOS[tipo.toLowerCase()] || 0;
      }
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

    // ===== RESUMEN VISUAL =====
    // Por grupo: cuántos partidos has acertado / cuántos están resueltos / total
    const resumenGrupos = {};
    for (const part of partidos) {
      if (part.fase !== "grupos" || !part.grupo) continue;
      (resumenGrupos[part.grupo] ||= { total: 0, resueltos: 0, aciertos: 0 });
      resumenGrupos[part.grupo].total++;
      if (part.resultado) {
        resumenGrupos[part.grupo].resueltos++;
        const miPick = grupos.find(p => p.partido_id === part.id);
        if (miPick && miPick.prediccion === part.resultado) {
          resumenGrupos[part.grupo].aciertos++;
        }
      }
    }
    // Por ronda eliminatoria
    const titulosRonda = { r32:"Dieciseisavos", r16:"Octavos", qf:"Cuartos", sf:"Semis", final:"Final" };
    const resumenElim = {};
    for (const f of ["r32","r16","qf","sf","final"]) {
      const partidosFase = partidos.filter(p => p.fase === f);
      const resueltos = partidosFase.filter(p => p.resultado);
      if (partidosFase.length === 0) continue;
      const misPicks = new Set(mis.filter(pr => partPorId[pr.partido_id]?.fase === f).map(pr => pr.prediccion));
      const ganadoresReales = new Set(resueltos.map(p => p.resultado));
      let aciertos = 0;
      for (const eq of misPicks) if (ganadoresReales.has(eq)) aciertos++;
      resumenElim[f] = { total: partidosFase.length, resueltos: resueltos.length, aciertos };
    }

    function pct(a, b) { return b === 0 ? 0 : Math.round(a / b * 100); }
    function chipResumen(label, aciertos, resueltos, total) {
      if (resueltos === 0) {
        return `<div class="chip-resumen chip-pendiente"><b>${label}</b><span class="chip-meta">— / ${total}</span></div>`;
      }
      const p = pct(aciertos, resueltos);
      const cls = p >= 70 ? "chip-bien" : p >= 40 ? "chip-medio" : "chip-mal";
      return `<div class="chip-resumen ${cls}">
        <b>${label}</b>
        <span class="chip-meta">${aciertos}/${resueltos} <span style="opacity:.6">de ${total}</span></span>
      </div>`;
    }
    const resumenHtml = `
      <div class="resumen-bloque">
        <h3>Resumen — Fase de grupos</h3>
        <div class="chips-resumen">
          ${Object.keys(resumenGrupos).sort().map(g => {
            const r = resumenGrupos[g];
            return chipResumen("Grupo " + g, r.aciertos, r.resueltos, r.total);
          }).join("") || '<p class="sub">Aún no hay partidos de grupos.</p>'}
        </div>
      </div>
      ${Object.keys(resumenElim).length > 0 ? `
      <div class="resumen-bloque">
        <h3>Resumen — Eliminatorias</h3>
        <div class="chips-resumen">
          ${Object.keys(resumenElim).map(f => {
            const r = resumenElim[f];
            return chipResumen(titulosRonda[f], r.aciertos, r.resueltos, r.total);
          }).join("")}
        </div>
      </div>` : ""}
      ${(() => {
        // Resumen de premios
        const goleadorPart = partPorId["PREMIO_GOLEADOR"];
        const mvpPart = partPorId["PREMIO_MVP"];
        if (!goleadorPart && !mvpPart) return "";
        const miGol = mis.find(pr => pr.partido_id === "PREMIO_GOLEADOR");
        const miMvp = mis.find(pr => pr.partido_id === "PREMIO_MVP");
        const chip = (titulo, miPick, real) => {
          if (!real) {
            return `<div class="chip-resumen chip-pendiente"><b>${titulo}</b><span class="chip-meta">${miPick ? '✏️ ' + miPick.prediccion : 'sin marcar'}</span></div>`;
          }
          const acertado = miPick && miPick.prediccion === real;
          const cls = acertado ? "chip-bien" : "chip-mal";
          return `<div class="chip-resumen ${cls}"><b>${titulo}</b><span class="chip-meta">${acertado ? '✅ Acertaste' : '❌ ' + (miPick?.prediccion || 'sin marcar')}</span></div>`;
        };
        return `
          <div class="resumen-bloque">
            <h3>Resumen — Premios individuales</h3>
            <div class="chips-resumen">
              ${chip("Máx. Goleador", miGol, goleadorPart?.resultado)}
              ${chip("MVP", miMvp, mvpPart?.resultado)}
            </div>
          </div>`;
      })()}
    `;

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
      ${resumenHtml}
      <h3>Fase de grupos</h3>
      <table class="tabla-detalle"><thead><tr><th>Partido</th><th>Tu pick</th><th>Real</th></tr></thead>
        <tbody>${grupos.map(filaGrupo).join("") || "<tr><td colspan='3'>Sin pronósticos</td></tr>"}</tbody></table>
      <h3>Eliminatorias</h3>
      <table class="tabla-detalle"><thead><tr><th>Ronda</th><th>Tu pick</th><th>Real</th></tr></thead>
        <tbody>${elim.map(filaElim).join("") || "<tr><td colspan='3'>Sin pronósticos</td></tr>"}</tbody></table>
    `;
  }
})();
