// Pantalla "Próximo partido": navegador de partidos con flechas ◀ / ▶.
// - Por defecto arranca en el PRÓXIMO partido (sin resultado y todavía vigente).
// - Permite ir al ANTERIOR (ya jugado: muestra marcador y quién acertó) y al SIGUIENTE.
// SOLO LECTURA — no escribe nada en la base de datos.
(async function() {
  const sesion = Sesion.requerir(); if (!sesion) return;
  $("#usuario-nombre").textContent = "👤 " + sesion.nombre;
  if (sesion.es_admin) $("#link-admin").style.display = "inline-block";
  $("#btn-salir").addEventListener("click", e => { e.preventDefault(); Sesion.cerrar(); location.href = "index.html"; });

  // Cargar partidos (~105 filas) y usuarios (~17). Ambas tablas pequeñas, sin riesgo de límite.
  const [partidosRes, usuariosRes] = await Promise.all([
    sb.from("partidos").select("*").order("fecha_hora"),
    sb.from("usuarios_publico").select("id,nombre")
  ]);
  if (partidosRes.error || usuariosRes.error) {
    mostrarError("Error cargando datos."); return;
  }
  const partidos = partidosRes.data;
  const nombrePorUsuario = Object.fromEntries(usuariosRes.data.map(u => [u.id, u.nombre]));
  const totalUsuarios = usuariosRes.data.length;

  // ---- Lista navegable: todos los partidos "reales" en orden cronológico ----
  // (con ambos equipos definidos, con fecha y que no sean premios goleador/MVP).
  const partidosNav = partidos
    .filter(p => p.equipo_a && p.equipo_b && p.fecha_hora && p.fase !== "premio")
    .sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));

  if (partidosNav.length === 0) {
    $("#estado").textContent = "";
    $("#contenido").innerHTML = `
      <div class="card" style="text-align:center; padding:40px 20px">
        <div style="font-size:2.5rem; margin-bottom:10px">🏁</div>
        <p style="font-weight:600; color:var(--text)">No hay partidos disponibles</p>
        <p class="sub">O ya se han jugado todos, o el cuadro aún no se ha generado.</p>
      </div>`;
    return;
  }

  // ---- Determinar el índice por defecto = el PRÓXIMO partido ----
  // Criterio (idéntico al anterior): primer partido sin resultado QUE TODAVÍA NO HAYA TERMINADO.
  // Un partido "sigue vigente" si su inicio fue hace menos de 3h (cubre 90' + añadido +
  // descanso e incluso prórroga + penaltis). Así, uno en juego AHORA cuenta como próximo,
  // pero uno acabado hace horas que espera al bot NO se confunde con el próximo.
  const MARGEN_VIGENTE_MS = 3 * 60 * 60 * 1000;  // 3 horas
  const ahoraMs = Date.now();
  let idxDefault = partidosNav.findIndex(p =>
    !p.resultado && new Date(p.fecha_hora).getTime() + MARGEN_VIGENTE_MS > ahoraMs);
  if (idxDefault === -1) {
    // No hay próximo (todo jugado): aterrizar en el último partido jugado, o el último de la lista.
    const ultJugadoIdx = partidosNav.map(p => !!p.resultado).lastIndexOf(true);
    idxDefault = ultJugadoIdx !== -1 ? ultJugadoIdx : partidosNav.length - 1;
  }

  let idx = idxDefault;
  const pronCache = {};  // partido_id -> array de pronósticos (para no recargar al navegar)

  async function getPron(partidoId) {
    if (pronCache[partidoId]) return pronCache[partidoId];
    // Cargar SOLO los pronósticos de este partido (filtrado → ~17 filas, sin tocar el límite de 1000).
    const res = await sb.from("pronosticos").select("usuario_id,prediccion").eq("partido_id", partidoId);
    if (res.error) throw res.error;
    pronCache[partidoId] = res.data;
    return res.data;
  }

  const titulosFase = { grupos:"Fase de grupos", r32:"Dieciseisavos", r16:"Octavos", qf:"Cuartos", sf:"Semifinales", final:"Final" };

  async function render() {
    const partido = partidosNav[idx];
    const esGrupos = partido.fase === "grupos";
    const jugado = !!partido.resultado;

    let pron;
    try { pron = await getPron(partido.id); }
    catch { mostrarError("Error cargando pronósticos."); return; }

    const eqA = equipo(partido.equipo_a), eqB = equipo(partido.equipo_b);

    // ---- Agrupar pronósticos por opción ----
    // Grupos: prediccion es "A" / "EMPATE" / "B".
    // Eliminatorias: prediccion es el código del equipo que el usuario cree que pasa.
    const grupos = { A: [], EMPATE: [], B: [], OTRO: [] };
    for (const pr of pron) {
      const nombre = nombrePorUsuario[pr.usuario_id] || "?";
      if (esGrupos) {
        if (pr.prediccion === "A") grupos.A.push(nombre);
        else if (pr.prediccion === "B") grupos.B.push(nombre);
        else if (pr.prediccion === "EMPATE") grupos.EMPATE.push(nombre);
      } else {
        if (pr.prediccion === partido.equipo_a) grupos.A.push(nombre);
        else if (pr.prediccion === partido.equipo_b) grupos.B.push(nombre);
        else grupos.OTRO.push(nombre);  // predijo otro equipo (su bracket divergió)
      }
    }

    const totalPron = pron.length;
    const pct = n => totalPron === 0 ? 0 : Math.round(n / totalPron * 100);

    // ---- Opción ganadora (solo en partidos jugados) ----
    // El acierto se calcula como prediccion === resultado, igual que en la clasificación:
    //   grupos → resultado es "A"/"EMPATE"/"B".  eliminatorias → resultado es el equipo que pasa.
    let claveGanadora = null;
    if (jugado) {
      if (esGrupos) claveGanadora = partido.resultado;              // "A" / "EMPATE" / "B"
      else claveGanadora = partido.resultado === partido.equipo_a ? "A"
                         : partido.resultado === partido.equipo_b ? "B" : "OTRO";
    }

    // ---- Estado / fecha ----
    const fecha = new Date(partido.fecha_hora);
    const empezado = fecha <= new Date();
    const faseTxt = titulosFase[partido.fase] || partido.fase;
    if (jugado) {
      $("#titulo").textContent = "✅ Partido jugado";
      $("#estado").innerHTML = `Resultado final · ${faseTxt}`;
    } else if (idx === idxDefault) {
      $("#titulo").textContent = "⏭️ Próximo partido";
      $("#estado").innerHTML = empezado
        ? `🔴 <b>En juego o a punto de empezar</b> · ${faseTxt}`
        : `🕒 ${fecha.toLocaleString("es-ES",{weekday:"long", day:"2-digit", month:"long", hour:"2-digit", minute:"2-digit"})} · ${faseTxt}`;
    } else {
      $("#titulo").textContent = "🔮 Partido futuro";
      $("#estado").innerHTML = `🕒 ${fecha.toLocaleString("es-ES",{weekday:"long", day:"2-digit", month:"long", hour:"2-digit", minute:"2-digit"})} · ${faseTxt}`;
    }

    // ---- Construir las opciones a mostrar ----
    const opciones = [];
    opciones.push({ clave:"A", etiqueta:`${eqA.flag} ${eqA.nombre}`, nombres:grupos.A, color:"op-a" });
    if (esGrupos) opciones.push({ clave:"EMPATE", etiqueta:"🤝 Empate", nombres:grupos.EMPATE, color:"op-x" });
    opciones.push({ clave:"B", etiqueta:`${eqB.flag} ${eqB.nombre}`, nombres:grupos.B, color:"op-b" });
    if (!esGrupos && grupos.OTRO.length > 0) {
      opciones.push({ clave:"OTRO", etiqueta:"❓ Otro equipo", nombres:grupos.OTRO, color:"op-otro" });
    }

    const miPick = pron.find(pr => pr.usuario_id === sesion.id);
    const miAcierto = jugado && miPick && miPick.prediccion === partido.resultado;

    // ---- Barra de % ----
    const barraSegmentos = opciones.map(o => {
      const p = pct(o.nombres.length);
      return `<div class="barra-seg ${o.color}" style="width:${p}%" title="${o.etiqueta}: ${p}%"></div>`;
    }).join("");

    // ---- Leyenda ----
    const leyenda = opciones.map(o => {
      const p = pct(o.nombres.length);
      const gana = jugado && o.clave === claveGanadora;
      return `<div class="prox-leyenda-item">
        <span class="prox-dot ${o.color}"></span>
        <span class="prox-leyenda-tex">${o.etiqueta}${gana?' ✓':''}</span>
        <b>${p}%</b>
        <span class="prox-leyenda-n">(${o.nombres.length})</span>
      </div>`;
    }).join("");

    // ---- Columnas de "quién apostó qué" ----
    const listas = opciones.map(o => {
      const gana = jugado && o.clave === claveGanadora;
      return `
      <div class="prox-col">
        <div class="prox-col-cab ${o.color}${gana?' ganadora':''}">${o.etiqueta} · <b>${pct(o.nombres.length)}%</b>${gana?' ✓':''}</div>
        <div class="prox-col-lista">
          ${o.nombres.length === 0
            ? '<span class="prox-vacio">— nadie —</span>'
            : o.nombres.slice().sort((a,b)=>a.localeCompare(b)).map(n =>
                `<span class="prox-nombre ${n===sesion.nombre?'yo':''}${gana?' acerto':''}">${n}${n===sesion.nombre?' (tú)':''}</span>`
              ).join("")}
        </div>
      </div>`;
    }).join("");

    // ---- Cabecera del partido: marcador si está jugado, "vs" si no ----
    let centro;
    if (jugado) {
      const ga = partido.goles_a ?? "–", gb = partido.goles_b ?? "–";
      centro = `<span class="prox-marcador">${ga}<span class="prox-guion">-</span>${gb}</span>`;
    } else {
      centro = `<span class="prox-vs">vs</span>`;
    }
    const ganaA = jugado && claveGanadora === "A";
    const ganaB = jugado && claveGanadora === "B";

    // ---- Línea "tu pronóstico" ----
    let miLinea;
    if (miPick) {
      const miTxt = esGrupos
        ? (miPick.prediccion==="A"?eqA.nombre:miPick.prediccion==="B"?eqB.nombre:"Empate")
        : (miPick.prediccion===partido.equipo_a?eqA.nombre:miPick.prediccion===partido.equipo_b?eqB.nombre:equipo(miPick.prediccion).nombre);
      const marca = jugado ? (miAcierto ? ' <span class="prox-ok">✅ acertaste</span>' : ' <span class="prox-ko">❌ fallaste</span>') : '';
      miLinea = `<p class="sub" style="text-align:center; margin-top:10px">Tu pronóstico: <b>${miTxt}</b>${marca}</p>`;
    } else {
      miLinea = `<p class="sub" style="text-align:center; margin-top:10px">No tienes pronóstico para este partido.</p>`;
    }

    // ---- Resumen de aciertos (solo jugados) ----
    let resumenAciertos = "";
    if (jugado) {
      const nAcertaron = pron.filter(pr => pr.prediccion === partido.resultado).length;
      resumenAciertos = `<p class="sub" style="text-align:center; margin-top:6px">🎯 <b>${nAcertaron}</b> de ${totalPron} acertaron</p>`;
    }

    // ---- Barra de navegación ----
    const nav = `
      <div class="prox-nav">
        <button class="secundario" id="prox-prev" ${idx===0?'disabled':''}>◀ Anterior</button>
        <span class="prox-nav-pos">${idx+1} / ${partidosNav.length}</span>
        <button class="secundario" id="prox-next" ${idx===partidosNav.length-1?'disabled':''}>Siguiente ▶</button>
      </div>
      ${idx !== idxDefault ? `<div style="text-align:center; margin-bottom:14px"><button class="secundario" id="prox-jump" style="font-size:.85rem; padding:8px 16px">⏭️ Ir al próximo partido</button></div>` : ''}`;

    $("#contenido").innerHTML = `
      ${nav}
      <div class="card prox-cab">
        <div class="prox-equipos">
          <div class="prox-equipo ${ganaA?'gana':''}"><span class="prox-flag">${eqA.flag}</span><span>${eqA.nombre}</span></div>
          ${centro}
          <div class="prox-equipo ${ganaB?'gana':''}"><span class="prox-flag">${eqB.flag}</span><span>${eqB.nombre}</span></div>
        </div>
        ${miLinea}
        ${resumenAciertos}
      </div>

      <div class="card">
        <h3 style="font-size:.85rem; margin-bottom:14px">📊 Qué ha apostado el grupo (${totalPron}/${totalUsuarios})</h3>
        <div class="prox-barra">${barraSegmentos}</div>
        <div class="prox-leyenda">${leyenda}</div>
      </div>

      <div class="card">
        <h3 style="font-size:.85rem; margin-bottom:14px">👥 Quién ha apostado qué</h3>
        <div class="prox-cols">${listas}</div>
      </div>
    `;

    // ---- Conectar botones de navegación ----
    const prev = $("#prox-prev"), next = $("#prox-next"), jump = $("#prox-jump");
    if (prev) prev.addEventListener("click", () => { if (idx > 0) { idx--; render(); } });
    if (next) next.addEventListener("click", () => { if (idx < partidosNav.length-1) { idx++; render(); } });
    if (jump) jump.addEventListener("click", () => { idx = idxDefault; render(); });
  }

  render();
})();
