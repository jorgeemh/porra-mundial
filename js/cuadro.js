// Vista visual del cuadro eliminatorio — estilo torneo (izquierda + final + derecha)
(async function() {
  const sesion = Sesion.requerir(); if (!sesion) return;
  $("#usuario-nombre").textContent = "👤 " + sesion.nombre;
  if (sesion.es_admin) $("#link-admin").style.display = "inline-block";
  $("#btn-salir").addEventListener("click", e => { e.preventDefault(); Sesion.cerrar(); location.href = "index.html"; });

  const [pRes, bracketJson] = await Promise.all([
    sb.from("partidos").select("*"),
    fetch("data/bracket.json").then(r=>r.json()).catch(()=>null)
  ]);
  if (pRes.error || !bracketJson) { mostrarError("Error cargando datos"); return; }

  const fasesElim = ["r32","r16","qf","sf","final"];
  const partidos = pRes.data;
  const elim = partidos.filter(p => fasesElim.includes(p.fase));

  if (elim.length === 0) {
    $("#estado").textContent = "El cuadro aún no se ha generado. Aparecerá cuando termine la fase de grupos y el admin lo cree.";
    return;
  }
  $("#estado").textContent = "Se actualiza automáticamente cuando el admin va metiendo resultados.";

  // ----- Orden visual desde la final hacia atrás -----
  const tplById = {};
  for (const f of fasesElim) for (const m of bracketJson[f]) tplById[m.id] = { ...m, fase: f };

  const orden = { final: bracketJson.final.map(m => m.id), sf: [], qf: [], r16: [], r32: [] };
  function expandir(roundDestino, roundOrigen) {
    for (const id of orden[roundOrigen]) {
      const m = tplById[id];
      orden[roundDestino].push(m.from_a);
      orden[roundDestino].push(m.from_b);
    }
  }
  expandir("sf", "final");
  expandir("qf", "sf");
  expandir("r16", "qf");
  expandir("r32", "r16");

  // ----- Partir cada ronda en mitad izquierda y mitad derecha -----
  const izq = {}, der = {};
  for (const f of ["r32","r16","qf","sf"]) {
    const half = orden[f].length / 2;
    izq[f] = orden[f].slice(0, half);
    der[f] = orden[f].slice(half);
  }
  const finalId = orden.final[0];

  // ----- Indexar partidos reales por ID -----
  const partidoPorId = {};
  for (const p of elim) partidoPorId[p.id] = p;

  const titulos = {r32:"Dieciseisavos", r16:"Octavos", qf:"Cuartos", sf:"Semis", final:"Final"};

  function eqLabel(codigo) {
    if (!codigo || codigo === "?" || codigo === null) return { flag: "", nombre: "—", code: codigo || "?" };
    const e = equipo(codigo);
    return { flag: e.flag, nombre: e.nombre, code: codigo };
  }

  function renderMatch(id, ronda, esFinal = false) {
    const rondaLabel = titulos[ronda] || "";
    const m = partidoPorId[id];
    if (!m) {
      return `<div class="bmatch placeholder">
        <div class="bmatch-ronda">${rondaLabel}</div>
        <div class="bteam"><span class="bname">—</span></div>
        <div class="bteam"><span class="bname">—</span></div>
      </div>`;
    }
    const a = eqLabel(m.equipo_a);
    const b = eqLabel(m.equipo_b);
    const ganador = m.resultado;
    const ganoA = ganador && ganador === m.equipo_a;
    const ganoB = ganador && ganador === m.equipo_b;
    const perdedorA = ganador && ganoB;
    const perdedorB = ganador && ganoA;
    const campeon = esFinal && ganador;
    return `
      <div class="bmatch ${campeon?'es-final':''}">
        <div class="bmatch-ronda">${rondaLabel}</div>
        ${campeon ? '<div class="campeon-banner">🏆 Campeón</div>' : ''}
        <div class="bteam ${ganoA?'ganador':''} ${perdedorA?'perdedor':''}">
          <span class="bflag">${a.flag}</span>
          <span class="bname">${a.nombre}</span>
          ${ganoA?'<span class="btick">✓</span>':''}
        </div>
        <div class="bteam ${ganoB?'ganador':''} ${perdedorB?'perdedor':''}">
          <span class="bflag">${b.flag}</span>
          <span class="bname">${b.nombre}</span>
          ${ganoB?'<span class="btick">✓</span>':''}
        </div>
      </div>`;
  }

  function renderColumn(ronda, ids, lado) {
    return `
      <div class="round round-${ronda} round-${lado}">
        ${ids.map(id => renderMatch(id, ronda)).join("")}
      </div>`;
  }

  let html = "";
  // Mitad izquierda (de fuera hacia el centro)
  html += renderColumn("r32", izq.r32, "izq");
  html += renderColumn("r16", izq.r16, "izq");
  html += renderColumn("qf",  izq.qf,  "izq");
  html += renderColumn("sf",  izq.sf,  "izq");
  // Final en el centro
  html += `<div class="round round-final round-centro">
    <div class="trofeo-final" aria-hidden="true">
      <svg viewBox="0 0 64 64" class="trofeo-svg">
        <defs>
          <linearGradient id="g-gold" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#fde68a"/>
            <stop offset="45%" stop-color="#fbbf24"/>
            <stop offset="100%" stop-color="#b45309"/>
          </linearGradient>
        </defs>
        <!-- Asas -->
        <path d="M14 14 Q4 16 6 28 Q8 36 18 34" fill="none" stroke="url(#g-gold)" stroke-width="3" stroke-linecap="round"/>
        <path d="M50 14 Q60 16 58 28 Q56 36 46 34" fill="none" stroke="url(#g-gold)" stroke-width="3" stroke-linecap="round"/>
        <!-- Copa -->
        <path d="M16 10 L48 10 L46 30 Q44 42 32 42 Q20 42 18 30 Z" fill="url(#g-gold)" stroke="#78350f" stroke-width="1"/>
        <!-- Estrella en el cuerpo -->
        <path d="M32 18 L34 23 L39 23 L35 26 L36 31 L32 28 L28 31 L29 26 L25 23 L30 23 Z" fill="#fff8e1" opacity=".85"/>
        <!-- Pie -->
        <rect x="27" y="42" width="10" height="6" fill="url(#g-gold)" stroke="#78350f" stroke-width="1"/>
        <rect x="20" y="48" width="24" height="5" rx="1" fill="url(#g-gold)" stroke="#78350f" stroke-width="1"/>
        <rect x="17" y="53" width="30" height="4" rx="1" fill="url(#g-gold)" stroke="#78350f" stroke-width="1"/>
      </svg>
      <div class="trofeo-glow"></div>
    </div>
    ${renderMatch(finalId, "final", true)}
  </div>`;
  // Mitad derecha (del centro hacia fuera)
  html += renderColumn("sf",  der.sf,  "der");
  html += renderColumn("qf",  der.qf,  "der");
  html += renderColumn("r16", der.r16, "der");
  html += renderColumn("r32", der.r32, "der");

  $("#bracket").innerHTML = html;
})();
