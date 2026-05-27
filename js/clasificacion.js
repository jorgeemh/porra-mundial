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

  const [usuariosRes, partidosRes, pronRes, jugadoresJson] = await Promise.all([
    sb.from("usuarios_publico").select("*"),
    sb.from("partidos").select("*"),
    sb.from("pronosticos").select("*"),
    fetch("data/jugadores.json").then(r=>r.json()).catch(()=>null)
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

  // Lookup de jugadores (para premios). Si jugadores.json no carga, queda vacío y fallback al ID.
  const jugadorPorId = {};
  if (jugadoresJson && Array.isArray(jugadoresJson.jugadores)) {
    for (const j of jugadoresJson.jugadores) jugadorPorId[j.id] = j;
  }
  function jugadorLabel(id) {
    if (!id) return "—";
    const j = jugadorPorId[id];
    if (!j) return id;  // fallback al id si no se encuentra
    const flag = (typeof equipo === "function" && j.equipo) ? equipo(j.equipo).flag : "";
    return `${flag} ${j.nombre}`;
  }

  // Total de partidos de grupos posibles (debería ser 72)
  const totalGrupos = partidos.filter(p => p.fase === "grupos").length;

  // Calcular puntos por usuario
  const filas = usuarios.map(u => {
    const mis = pronPorUsuario[u.id] || [];
    let aciertos = 0, puntos = 0;
    // Contar picks de grupos
    const picksGrupos = mis.filter(pr => partPorId[pr.partido_id]?.fase === "grupos").length;
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

    return { id: u.id, nombre: u.nombre, aciertos, puntos, picksGrupos };
  });

  filas.sort((a,b) => b.puntos - a.puntos || b.aciertos - a.aciertos || a.nombre.localeCompare(b.nombre));

  $("#tabla-body").innerHTML = filas.map((f,i) => {
    const completo = f.picksGrupos === totalGrupos && totalGrupos > 0;
    const picksCell = `<span class="picks-cell ${completo ? 'completo' : ''}">${f.picksGrupos}<span class="picks-sep">/</span>${totalGrupos}</span>`;
    return `
      <tr ${f.id===sesion.id?'class="yo"':''}>
        <td>${i+1}</td><td>${f.nombre}</td><td>${picksCell}</td><td>${f.aciertos}</td><td><b>${f.puntos}</b></td>
      </tr>`;
  }).join("") || "<tr><td colspan='5'>Sin participantes aún</td></tr>";

  // Selector de detalle
  const sel = $("#select-usuario");
  sel.innerHTML = filas.map(f => `<option value="${f.id}" ${f.id===sesion.id?'selected':''}>${f.nombre}</option>`).join("");
  sel.addEventListener("change", () => renderDetalle(sel.value));
  renderDetalle(sesion.id);

  function renderDetalle(uid) {
    const mis = pronPorUsuario[uid] || [];
    // Orden de fases para eliminatorias
    const ordenFase = { r32: 1, r16: 2, qf: 3, sf: 4, final: 5 };

    // Grupos: ordenados por partido_id alfabéticamente (= mismo orden que la página de
    // pronósticos: G_A_1, G_A_2, ..., G_A_6, G_B_1, ..., G_L_6).
    const grupos = mis
      .filter(p => partPorId[p.partido_id]?.fase === "grupos")
      .sort((a, b) => a.partido_id.localeCompare(b.partido_id, undefined, { numeric: true }));

    // Eliminatorias: solo fases reales (r32, r16, qf, sf, final), excluyendo premios.
    // Ordenado por fase y luego por id del partido.
    const elim = mis
      .filter(p => {
        const f = partPorId[p.partido_id]?.fase;
        return f && f !== "grupos" && f !== "premio";
      })
      .sort((a, b) => {
        const fa = ordenFase[partPorId[a.partido_id].fase] || 99;
        const fb = ordenFase[partPorId[b.partido_id].fase] || 99;
        if (fa !== fb) return fa - fb;
        return a.partido_id.localeCompare(b.partido_id, undefined, { numeric: true });
      });

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
            return `<div class="chip-resumen chip-pendiente"><b>${titulo}</b><span class="chip-meta">${miPick ? '✏️ ' + jugadorLabel(miPick.prediccion) : 'sin marcar'}</span></div>`;
          }
          const acertado = miPick && miPick.prediccion === real;
          const cls = acertado ? "chip-bien" : "chip-mal";
          const realLabel = jugadorLabel(real);
          return `<div class="chip-resumen ${cls}"><b>${titulo}</b><span class="chip-meta">${acertado ? '✅ ' + realLabel : '❌ ' + (miPick ? jugadorLabel(miPick.prediccion) : 'sin marcar')}</span></div>`;
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

    // Helper: render bandera + nombre de un equipo (usa equipo() de teams.js)
    const eqLabel = (codigo) => {
      if (!codigo) return "—";
      const e = (typeof equipo === "function") ? equipo(codigo) : null;
      if (!e) return codigo;
      return `<span class="g-flag">${e.flag}</span>${e.nombre}`;
    };

    const filaGrupo = p => {
      const part = partPorId[p.partido_id]; if (!part) return "";
      const partidoCell = `${eqLabel(part.equipo_a)} <span style="color:var(--text-faint)">vs</span> ${eqLabel(part.equipo_b)}`;
      let pred;
      if (p.prediccion === "A") pred = eqLabel(part.equipo_a);
      else if (p.prediccion === "B") pred = eqLabel(part.equipo_b);
      else pred = `<span class="g-flag">🤝</span>Empate`;
      let resReal = "—", icono = "";
      if (part.resultado) {
        if (part.resultado === "A") resReal = eqLabel(part.equipo_a);
        else if (part.resultado === "B") resReal = eqLabel(part.equipo_b);
        else resReal = `<span class="g-flag">🤝</span>Empate`;
        icono = part.resultado === p.prediccion ? " ✅" : " ❌";
      }
      return `<tr><td>${partidoCell}</td><td>${pred}</td><td>${resReal}${icono}</td></tr>`;
    };

    const filaElim = p => {
      const part = partPorId[p.partido_id]; if (!part) return "";
      const rondaLabel = titulosRonda[part.fase] || part.fase.toUpperCase();
      // Si conocemos los dos equipos del partido, mostramos el matchup debajo
      const matchupSub = (part.equipo_a && part.equipo_b)
        ? `<div style="font-size:.78em; color:var(--text-faint); margin-top:2px">${eqLabel(part.equipo_a)} vs ${eqLabel(part.equipo_b)}</div>`
        : "";
      const predCell = eqLabel(p.prediccion);
      let resReal = "—", icono = "";
      if (part.resultado) {
        resReal = eqLabel(part.resultado);
        icono = part.resultado === p.prediccion ? " ✅" : " ❌";
      }
      return `<tr><td><b>${rondaLabel}</b>${matchupSub}</td><td>${predCell}</td><td>${resReal}${icono}</td></tr>`;
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
