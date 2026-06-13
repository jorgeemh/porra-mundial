// Pantalla "Próximo partido": muestra el siguiente partido sin resultado,
// el % de lo que ha apostado el grupo, y quién apostó cada opción.
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

  // ---- Determinar el PRÓXIMO partido ----
  // Criterio: el partido sin resultado, con ambos equipos definidos, de fecha más temprana.
  // (Cubre tanto "el que está por empezar" como "el que se está jugando ahora".)
  const candidatos = partidos
    .filter(p => !p.resultado && p.equipo_a && p.equipo_b && p.fecha_hora && p.fase !== "premio")
    .sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));

  if (candidatos.length === 0) {
    $("#estado").textContent = "";
    $("#contenido").innerHTML = `
      <div class="card" style="text-align:center; padding:40px 20px">
        <div style="font-size:2.5rem; margin-bottom:10px">🏁</div>
        <p style="font-weight:600; color:var(--text)">No hay próximo partido pendiente</p>
        <p class="sub">O ya se han jugado todos los partidos disponibles, o el cuadro aún no se ha generado.</p>
      </div>`;
    return;
  }

  const partido = candidatos[0];
  const esGrupos = partido.fase === "grupos";

  // ---- Cargar SOLO los pronósticos de este partido (filtrado → ~17 filas, sin tocar el límite de 1000) ----
  const pronRes = await sb.from("pronosticos").select("usuario_id,prediccion").eq("partido_id", partido.id);
  if (pronRes.error) { mostrarError("Error cargando pronósticos."); return; }
  const pron = pronRes.data;

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
      // Eliminatorias: comparar con el código del equipo
      if (pr.prediccion === partido.equipo_a) grupos.A.push(nombre);
      else if (pr.prediccion === partido.equipo_b) grupos.B.push(nombre);
      else grupos.OTRO.push(nombre);  // predijo otro equipo (su bracket divergió)
    }
  }

  const totalPron = pron.length;
  const pct = n => totalPron === 0 ? 0 : Math.round(n / totalPron * 100);

  // ---- Estado / fecha ----
  const fecha = new Date(partido.fecha_hora);
  const ahora = new Date();
  const empezado = fecha <= ahora;
  const titulosFase = { grupos:"Fase de grupos", r32:"Dieciseisavos", r16:"Octavos", qf:"Cuartos", sf:"Semifinales", final:"Final" };
  $("#estado").innerHTML = empezado
    ? `🔴 <b>En juego o a punto de empezar</b> · ${titulosFase[partido.fase] || partido.fase}`
    : `🕒 ${fecha.toLocaleString("es-ES",{weekday:"long", day:"2-digit", month:"long", hour:"2-digit", minute:"2-digit"})} · ${titulosFase[partido.fase] || partido.fase}`;

  // ---- Construir las opciones a mostrar ----
  // Para grupos: A / Empate / B. Para eliminatorias: equipo_a / equipo_b (+ "otros" si los hay).
  const opciones = [];
  opciones.push({ clave:"A", etiqueta:`${eqA.flag} ${eqA.nombre}`, gana:true, nombres:grupos.A, color:"op-a" });
  if (esGrupos) {
    opciones.push({ clave:"EMPATE", etiqueta:"🤝 Empate", nombres:grupos.EMPATE, color:"op-x" });
  }
  opciones.push({ clave:"B", etiqueta:`${eqB.flag} ${eqB.nombre}`, nombres:grupos.B, color:"op-b" });
  if (!esGrupos && grupos.OTRO.length > 0) {
    opciones.push({ clave:"OTRO", etiqueta:"❓ Otro equipo", nombres:grupos.OTRO, color:"op-otro" });
  }

  // ---- Render: cabecera del partido + barra de % + listas de usuarios ----
  const miPick = pron.find(pr => pr.usuario_id === sesion.id);

  const barraSegmentos = opciones.map(o => {
    const p = pct(o.nombres.length);
    return `<div class="barra-seg ${o.color}" style="width:${p}%" title="${o.etiqueta}: ${p}%"></div>`;
  }).join("");

  const leyenda = opciones.map(o => {
    const p = pct(o.nombres.length);
    return `<div class="prox-leyenda-item">
      <span class="prox-dot ${o.color}"></span>
      <span class="prox-leyenda-tex">${o.etiqueta}</span>
      <b>${p}%</b>
      <span class="prox-leyenda-n">(${o.nombres.length})</span>
    </div>`;
  }).join("");

  const listas = opciones.map(o => `
    <div class="prox-col">
      <div class="prox-col-cab ${o.color}">${o.etiqueta} · <b>${pct(o.nombres.length)}%</b></div>
      <div class="prox-col-lista">
        ${o.nombres.length === 0
          ? '<span class="prox-vacio">— nadie —</span>'
          : o.nombres.sort((a,b)=>a.localeCompare(b)).map(n =>
              `<span class="prox-nombre ${n===sesion.nombre?'yo':''}">${n}${n===sesion.nombre?' (tú)':''}</span>`
            ).join("")}
      </div>
    </div>`).join("");

  $("#contenido").innerHTML = `
    <div class="card prox-cab">
      <div class="prox-equipos">
        <div class="prox-equipo"><span class="prox-flag">${eqA.flag}</span><span>${eqA.nombre}</span></div>
        <span class="prox-vs">vs</span>
        <div class="prox-equipo"><span class="prox-flag">${eqB.flag}</span><span>${eqB.nombre}</span></div>
      </div>
      ${miPick ? `<p class="sub" style="text-align:center; margin-top:10px">Tu pronóstico: <b>${
        esGrupos
          ? (miPick.prediccion==="A"?eqA.nombre:miPick.prediccion==="B"?eqB.nombre:"Empate")
          : (miPick.prediccion===partido.equipo_a?eqA.nombre:miPick.prediccion===partido.equipo_b?eqB.nombre:equipo(miPick.prediccion).nombre)
      }</b></p>` : `<p class="sub" style="text-align:center; margin-top:10px">No tienes pronóstico para este partido.</p>`}
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
})();
