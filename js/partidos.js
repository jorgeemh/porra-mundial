// Pantalla de pronósticos: fase de grupos (con guardar/editar) + bracket eliminatorio
(async function() {
  const sesion = Sesion.requerir(); if (!sesion) return;
  $("#usuario-nombre").textContent = "👤 " + sesion.nombre;
  if (sesion.es_admin) $("#link-admin").style.display = "inline-block";
  $("#btn-salir").addEventListener("click", e => { e.preventDefault(); Sesion.cerrar(); location.href = "index.html"; });

  const [cfgRes, partidosRes, pronRes, bracketJson] = await Promise.all([
    sb.from("config").select("*"),
    sb.from("partidos").select("*").order("fecha_hora"),
    sb.from("pronosticos").select("*").eq("usuario_id", sesion.id),
    fetch("data/bracket.json").then(r=>r.json()).catch(()=>null)
  ]);
  if (cfgRes.error || partidosRes.error || pronRes.error) {
    mostrarError("Error cargando datos. ¿Has ejecutado el SQL en Supabase?"); return;
  }
  if (bracketJson) {
    const fuentes = {};
    for (const m of [...(bracketJson.r16||[]), ...(bracketJson.qf||[]), ...(bracketJson.sf||[]), ...(bracketJson.final||[])]) {
      fuentes[m.id] = { a: m.from_a, b: m.from_b };
    }
    window.__BRACKET_FUENTES__ = fuentes;
  }
  const config = Object.fromEntries(cfgRes.data.map(r => [r.clave, r.valor]));
  const partidos = partidosRes.data;
  const savedPicks = Object.fromEntries(pronRes.data.map(p => [p.partido_id, p.prediccion]));

  const limiteGrupos = new Date(config.fecha_limite_grupos);
  const gruposBloqueadosManual = config.grupos_bloqueados === "true";
  const grupoCerrado = new Date() >= limiteGrupos || gruposBloqueadosManual;
  const eliminatoriasAbiertas = config.eliminatorias_abiertas === "true";
  const bracketBloqueado = config.bracket_bloqueado === "true";

  // ============ TABS ============
  const fasesElimGlobal = ["r32","r16","qf","sf","final"];
  const partidosElim = partidos.filter(p => fasesElimGlobal.includes(p.fase));
  const totalElim = partidosElim.length;

  const tabBtns = $$(".pron-tab");
  const panels = { grupos: $("#panel-grupos"), elim: $("#panel-elim") };
  const tabElim = tabBtns.find(b => b.dataset.tab === "elim");

  function actualizarContadores() {
    const nG = Object.keys(localPicks).filter(k => k.startsWith("G_")).length;
    $("#counter-grupos").textContent = grupoCerrado
      ? `🔒 Cerrada · ${nG}/${totalGrupos}`
      : `${nG}/${totalGrupos} marcados`;
    const elimCounterEl = $("#counter-elim");
    if (!eliminatoriasAbiertas) {
      elimCounterEl.innerHTML = "🔒 Aún no disponible";
    } else if (totalElim === 0) {
      elimCounterEl.textContent = "Sin partidos aún";
    } else {
      const fuente = (typeof localBPicksGlobal !== "undefined") ? localBPicksGlobal
                    : Object.fromEntries(Object.entries(localPicks).filter(([k]) => !k.startsWith("G_")));
      const nE = Object.keys(fuente).length;
      const guardado = JSON.stringify(fuente) === JSON.stringify(savedBPicksRef || {});
      elimCounterEl.innerHTML = bracketBloqueado
        ? `🔒 Bloqueado · ${nE}/${totalElim}`
        : `${nE}/${totalElim} marcados${!guardado ? " · <span style='opacity:.85'>sin guardar</span>" : ""}`;
    }
  }

  function activarTab(tab) {
    // No permitir activar elim si está bloqueada (sin abrir todavía)
    if (tab === "elim" && !eliminatoriasAbiertas) return;
    tabBtns.forEach(b => b.classList.toggle("activo", b.dataset.tab === tab));
    Object.entries(panels).forEach(([k, el]) => {
      if (!el) return;
      el.style.display = (k === tab) ? "" : "none";
    });
    // Re-animar el panel activo
    if (panels[tab]) {
      panels[tab].style.animation = "none";
      void panels[tab].offsetWidth;
      panels[tab].style.animation = "";
    }
    localStorage.setItem("porra_last_tab", tab);
    // Mostrar/ocultar barras flotantes según tab activa
    const flotG = $("#botones-grupos");
    const flotE = $("#botones-elim");
    const mostrarG = (tab === "grupos" && !grupoCerrado);
    const mostrarE = (tab === "elim" && eliminatoriasAbiertas && !bracketBloqueado && totalElim > 0);
    if (flotG) flotG.style.display = mostrarG ? "flex" : "none";
    if (flotE) flotE.style.display = mostrarE ? "flex" : "none";
    document.body.classList.toggle("tiene-flotantes", mostrarG || mostrarE);
  }

  // Estado inicial de la tab eliminatorias
  if (!eliminatoriasAbiertas) {
    tabElim.classList.add("bloqueado");
    tabElim.setAttribute("title", "Las eliminatorias se abrirán cuando termine la fase de grupos");
  }

  // Handlers
  tabBtns.forEach(b => b.addEventListener("click", () => activarTab(b.dataset.tab)));

  // Tab por defecto: última visitada > si grupos cerrados y elim abiertas → elim > si no, grupos
  const ultimaTab = localStorage.getItem("porra_last_tab");
  let tabInicial = "grupos";
  if (ultimaTab === "elim" && eliminatoriasAbiertas) tabInicial = "elim";
  else if (grupoCerrado && eliminatoriasAbiertas) tabInicial = "elim";

  // ============ FASE DE GRUPOS ============
  const partidosGrupos = partidos.filter(p => p.fase === "grupos");

  // estado local
  let localPicks = { ...savedPicks };
  let savedPicksRef = { ...savedPicks };
  const totalGrupos = partidosGrupos.length;
  const haySaved = Object.keys(savedPicksRef).filter(k => k.startsWith("G_")).length > 0;
  let editMode = !grupoCerrado && !haySaved;  // si no hay nada guardado y aún no se ha cerrado, editable

  function renderGrupos() {
    if (partidosGrupos.length === 0) {
      $("#grupos").innerHTML = "<p>Aún no se ha cargado el calendario. Habla con el admin.</p>";
      $("#estado-grupos").textContent = "";
      return;
    }
    $("#estado-grupos").innerHTML = (() => {
      if (grupoCerrado) return gruposBloqueadosManual
        ? "🔒 Fase de grupos bloqueada por el admin. Ya no puedes modificar pronósticos."
        : "⏰ Fase de grupos cerrada. Ya no puedes modificar pronósticos.";
      const n = Object.keys(localPicks).filter(k => k.startsWith("G_")).length;
      const cambios = JSON.stringify(localPicks) !== JSON.stringify(savedPicksRef);
      return `🕒 Cierra el ${limiteGrupos.toLocaleString("es-ES")} · <b>${n}/${totalGrupos}</b> marcados${cambios ? " · <span style='color:#b45309'>cambios sin guardar</span>" : ""}`;
    })();

    const porGrupo = {};
    for (const p of partidosGrupos) (porGrupo[p.grupo] ||= []).push(p);

    const disabled = !editMode || grupoCerrado;

    const html = Object.keys(porGrupo).sort().map(g => {
      const equiposGrupo = Array.from(new Set(porGrupo[g].flatMap(p => [p.equipo_a, p.equipo_b])));
      const nombresGrupo = equiposGrupo.map(e => equipo(e).flag).join(" ");
      return `
      <details open class="grupo">
        <summary>Grupo ${g} ${nombresGrupo}</summary>
        <div class="partidos">
          ${porGrupo[g].sort((a,b)=>new Date(a.fecha_hora)-new Date(b.fecha_hora)).map(p => {
            const mi = localPicks[p.id] || "";
            const real = p.resultado;
            const eqA = equipo(p.equipo_a), eqB = equipo(p.equipo_b);
            const fallado = !!(real && mi && mi !== real);
            const acertado = !!(real && mi && mi === real);
            const estadoCls = fallado ? 'fallada' : (acertado ? 'acertada' : '');
            const resultCls = fallado ? 'fallado' : '';
            return `
              <div class="partido ${disabled ? 'cerrado':''}">
                <div class="fecha">${new Date(p.fecha_hora).toLocaleString("es-ES",{weekday:"short", day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"})}</div>
                ${real ? `<div class="resultado-real ${resultCls}">Resultado: <b>${p.goles_a}-${p.goles_b}</b> (${real==='A'?eqA.nombre:real==='B'?eqB.nombre:'Empate'})</div>` : ""}
                <div class="opciones" data-partido="${p.id}">
                  <button class="op ${mi==='A'?'activa':''} ${mi==='A'?estadoCls:''}" data-pick="A" ${disabled?'disabled':''}>${eqA.flag} ${eqA.nombre}</button>
                  <button class="op ${mi==='EMPATE'?'activa':''} ${mi==='EMPATE'?estadoCls:''}" data-pick="EMPATE" ${disabled?'disabled':''}>Empate</button>
                  <button class="op ${mi==='B'?'activa':''} ${mi==='B'?estadoCls:''}" data-pick="B" ${disabled?'disabled':''}>${eqB.flag} ${eqB.nombre}</button>
                </div>
              </div>`;
          }).join("")}
        </div>
      </details>
    `}).join("");
    $("#grupos").innerHTML = html;

    // Listeners para marcar pick (solo si editMode) — actualización LOCAL sin re-render
    if (!disabled) {
      $$("#grupos .opciones .op").forEach(btn => {
        btn.addEventListener("click", () => {
          const opciones = btn.parentElement;
          const partidoId = opciones.dataset.partido;
          const pick = btn.dataset.pick;
          localPicks[partidoId] = pick;
          opciones.querySelectorAll(".op").forEach(b => b.classList.toggle("activa", b.dataset.pick === pick));
          actualizarEstadoYBotones();
        });
      });
    }

    // Botones inferiores
    renderBotonesGrupos();
  }

  function actualizarEstadoYBotones() {
    if (grupoCerrado) return;
    const n = Object.keys(localPicks).filter(k => k.startsWith("G_")).length;
    const cambios = JSON.stringify(localPicks) !== JSON.stringify(savedPicksRef);
    $("#estado-grupos").innerHTML = `🕒 Cierra el ${limiteGrupos.toLocaleString("es-ES")} · <b>${n}/${totalGrupos}</b> marcados${cambios ? " · <span style='color:#b45309'>cambios sin guardar</span>" : ""}`;
    const guardar = $("#btn-guardar-grupos");
    if (guardar) guardar.disabled = !cambios;
    actualizarContadores();
  }

  function renderBotonesGrupos() {
    let div = $("#botones-grupos");
    if (!div) {
      div = document.createElement("div");
      div.id = "botones-grupos";
      div.className = "botones-flotantes";
      document.body.appendChild(div);
    }
    document.body.classList.toggle("tiene-flotantes", !grupoCerrado);
    if (grupoCerrado) { div.innerHTML = ""; div.style.display = "none"; return; }
    div.style.display = "flex";
    if (editMode) {
      const cambios = JSON.stringify(localPicks) !== JSON.stringify(savedPicksRef);
      div.innerHTML = `
        <button id="btn-guardar-grupos" ${cambios?'':'disabled'}>💾 Guardar pronósticos</button>
        ${haySaved ? '<button id="btn-cancelar-edicion" class="secundario">Cancelar</button>' : ''}
      `;
      $("#btn-guardar-grupos").onclick = guardarGrupos;
      const c = $("#btn-cancelar-edicion"); if (c) c.onclick = () => { localPicks = {...savedPicksRef}; editMode = false; renderGrupos(); };
    } else {
      div.innerHTML = `<button id="btn-editar-grupos" class="secundario">✏️ Editar pronósticos</button>`;
      $("#btn-editar-grupos").onclick = () => { editMode = true; renderGrupos(); };
    }
  }

  async function guardarGrupos() {
    limpiarError();
    const btn = $("#btn-guardar-grupos"); btn.disabled = true; btn.textContent = "Guardando…";
    // Cambios = entradas de localPicks distintas de savedPicksRef
    const entries = Object.entries(localPicks).filter(([k,v]) => k.startsWith("G_") && savedPicksRef[k] !== v);
    try {
      // Mandar en lotes de 20 en paralelo
      for (let i = 0; i < entries.length; i += 20) {
        const lote = entries.slice(i, i+20);
        const resultados = await Promise.all(lote.map(([partido_id, pred]) =>
          sb.rpc("guardar_pronostico_grupos", {
            p_usuario_id: sesion.id, p_token: sesion.token,
            p_partido_id: partido_id, p_prediccion: pred
          })
        ));
        const err = resultados.find(r => r.error);
        if (err) throw err.error;
      }
      savedPicksRef = { ...localPicks };
      editMode = false;
      renderGrupos();
      mostrarOk("Pronósticos guardados ✅");
    } catch (e) {
      mostrarError(e.message || "Error guardando");
      btn.disabled = false; btn.textContent = "💾 Guardar pronósticos";
    }
  }

  function mostrarOk(msg) {
    let el = $("#ok");
    if (!el) { el = document.createElement("div"); el.id = "ok"; el.className = "ok"; $("main").prepend(el); }
    el.textContent = msg; el.style.display = "block";
    setTimeout(() => el.style.display = "none", 2500);
  }

  // ============ BRACKET ELIMINATORIO ============
  const fasesElim = ["r32","r16","qf","sf","final"];
  const elim = partidos.filter(p => fasesElim.includes(p.fase));

  // Estado del bracket a nivel superior (compartido entre re-renders).
  // IMPORTANTE: deben declararse ANTES de llamar a renderBracket porque la función las usa.
  let savedBPicksRef = Object.fromEntries(
    Object.entries(localPicks).filter(([k]) => !k.startsWith("G_"))
  );
  let localBPicksGlobal = { ...savedBPicksRef };

  if (eliminatoriasAbiertas && elim.length > 0) {
    $("#estado-bracket").textContent = bracketBloqueado
      ? "🔒 Bracket bloqueado. No se puede cambiar."
      : "📝 Rellena tu bracket de una sola vez. Cuando empiecen los dieciseisavos quedará bloqueado.";
    renderBracket(elim, localPicks, bracketBloqueado);
  } else if (!eliminatoriasAbiertas) {
    $("#estado-bracket").innerHTML = "🔒 Las eliminatorias se abrirán cuando termine la fase de grupos. Vuelve entonces para rellenar tu bracket completo.";
    $("#bracket").innerHTML = `
      <div style="text-align:center; padding:40px 20px; color: var(--text-faint);">
        <div style="font-size:3rem; margin-bottom:12px">🏆</div>
        <p style="font-weight:600; color: var(--text-dim)">Aún no disponible</p>
        <p class="sub">Termina primero tus pronósticos de la fase de grupos.</p>
      </div>`;
  }

  function renderBracket(matches, picks, bloqueado) {
    const titulos = { r32:"Dieciseisavos", r16:"Octavos", qf:"Cuartos", sf:"Semifinales", final:"Final" };
    const porFase = {};
    for (const m of matches) (porFase[m.fase] ||= []).push(m);
    const localBPicks = localBPicksGlobal;

    function fasePrev(f) { return {r16:"r32", qf:"r16", sf:"qf", final:"sf"}[f]; }
    const mapaFuentes = window.__BRACKET_FUENTES__ || {};
    function equipoEn(matchId, slot) {
      const m = matches.find(x => x.id === matchId);
      if (!m) return "—";
      // Si el partido ya tiene equipos asignados (por propagación desde el backend), usarlos directamente
      if (m.fase === "r32" || (slot === "a" && m.equipo_a) || (slot === "b" && m.equipo_b)) {
        const eqDirecto = slot === "a" ? m.equipo_a : m.equipo_b;
        if (eqDirecto) return eqDirecto;
      }
      const f = mapaFuentes[matchId]; if (!f) return "?";
      const src = slot === "a" ? f.a : f.b;
      // Prioridad 1: resultado real del partido fuente (si ya se jugó)
      const srcMatch = matches.find(x => x.id === src);
      if (srcMatch && srcMatch.resultado) return srcMatch.resultado;
      // Prioridad 2: predicción del usuario para ese partido
      return localBPicks[src] || "?";
    }

    let html = "";
    for (const f of fasesElim) {
      const ms = (porFase[f] || []).sort((a,b)=>a.id.localeCompare(b.id, undefined, {numeric:true}));
      if (ms.length === 0) continue;
      const marcados = ms.filter(m => localBPicks[m.id]).length;
      const totalRonda = ms.length;
      const completa = marcados === totalRonda;
      const badge = `<span class="ronda-contador ${completa ? 'completa' : ''}">${marcados}/${totalRonda}</span>`;
      // Por defecto abrir la primera ronda incompleta (o la primera si todas están completas)
      const abrir = !completa || f === "r32";
      html += `<details ${abrir ? 'open' : ''} class="grupo ronda-grupo" data-fase="${f}">
        <summary>${titulos[f]} ${badge}</summary>
        <div class="partidos ronda">`;
      for (const m of ms) {
        const eqA = equipoEn(m.id, "a"), eqB = equipoEn(m.id, "b");
        const mi = localBPicks[m.id];
        const labA = eqA === "?" || eqA === "—" ? eqA : equipoLabel(eqA);
        const labB = eqB === "?" || eqB === "—" ? eqB : equipoLabel(eqB);
        const real = m.resultado;
        const fallado = !!(real && mi && mi !== real);
        const acertado = !!(real && mi && mi === real);
        const estadoCls = fallado ? 'fallada' : (acertado ? 'acertada' : '');
        const resultCls = fallado ? 'fallado' : '';
        html += `
          <div class="partido-elim" data-partido="${m.id}">
            <div class="fecha">${m.fecha_hora ? new Date(m.fecha_hora).toLocaleString("es-ES",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}) : ""}</div>
            ${real ? `<div class="resultado-real ${resultCls}">Ganó: <b>${equipoLabel(real)}</b></div>` : ""}
            <div class="opciones-elim">
              <button class="op ${mi===eqA?'activa':''} ${mi===eqA?estadoCls:''}" data-equipo="${eqA}" ${bloqueado||eqA==='?'||eqA==='—'?'disabled':''}>${labA}</button>
              <button class="op ${mi===eqB?'activa':''} ${mi===eqB?estadoCls:''}" data-equipo="${eqB}" ${bloqueado||eqB==='?'||eqB==='—'?'disabled':''}>${labB}</button>
            </div>
          </div>`;
      }
      html += "</div></details>";
    }
    $("#bracket").innerHTML = html;

    // Preservar qué rondas estaban abiertas/cerradas entre re-renders
    const estadoRondas = window.__ESTADO_RONDAS__ || {};
    $$("#bracket details.ronda-grupo").forEach(d => {
      const fase = d.dataset.fase;
      if (estadoRondas[fase] !== undefined) d.open = estadoRondas[fase];
      d.addEventListener("toggle", () => {
        estadoRondas[fase] = d.open;
        window.__ESTADO_RONDAS__ = estadoRondas;
      });
    });

    // El botón inline antiguo lo ocultamos; ahora usamos barra flotante
    const btnInline = $("#btn-guardar-bracket");
    if (btnInline) btnInline.style.display = "none";

    if (!bloqueado) {
      $$("#bracket .partido-elim .op").forEach(btn => {
        btn.addEventListener("click", () => {
          if (btn.disabled) return;
          const partidoId = btn.closest(".partido-elim").dataset.partido;
          const equipo = btn.dataset.equipo;
          localBPicks[partidoId] = equipo;
          renderBracket(matches, localBPicks, bloqueado);
          renderBotonesElim(matches);
          actualizarContadores();
        });
      });
      renderBotonesElim(matches);
    }
  }

  function renderBotonesElim(matches) {
    if (!eliminatoriasAbiertas || bracketBloqueado) return;
    let div = $("#botones-elim");
    if (!div) {
      div = document.createElement("div");
      div.id = "botones-elim";
      div.className = "botones-flotantes";
      document.body.appendChild(div);
    }
    const cambios = JSON.stringify(localBPicksGlobal) !== JSON.stringify(savedBPicksRef);
    const nE = Object.keys(localBPicksGlobal).length;
    div.innerHTML = `
      <button id="btn-guardar-bracket-flot" ${cambios && nE>0 ? '' : 'disabled'}>
        💾 Guardar bracket ${cambios ? `(${nE}/${totalElim})` : ''}
      </button>
    `;
    $("#btn-guardar-bracket-flot").onclick = async () => {
      const btn = $("#btn-guardar-bracket-flot");
      btn.disabled = true;
      btn.innerHTML = `<span class="loading"></span> Guardando…`;
      const picksArr = Object.entries(localBPicksGlobal)
        .filter(([id]) => matches.find(m=>m.id===id))
        .map(([partido_id, equipo]) => ({partido_id, equipo}));
      const { error } = await sb.rpc("guardar_bracket", {
        p_usuario_id: sesion.id, p_token: sesion.token, p_picks: picksArr
      });
      if (error) {
        mostrarError(error.message);
        btn.disabled = false;
        btn.innerHTML = "💾 Guardar bracket";
      } else {
        limpiarError();
        savedBPicksRef = { ...localBPicksGlobal };
        // Reflejar también en localPicks global para que el contador en la tab sea correcto
        for (const [k,v] of Object.entries(localBPicksGlobal)) localPicks[k] = v;
        renderBotonesElim(matches);
        actualizarContadores();
        Modal.toast("Bracket guardado ✅");
      }
    };
  }

  renderGrupos();
  actualizarContadores();
  activarTab(tabInicial);
})();
