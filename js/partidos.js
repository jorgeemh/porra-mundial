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
  const grupoCerrado = new Date() >= limiteGrupos;
  const eliminatoriasAbiertas = config.eliminatorias_abiertas === "true";
  const bracketBloqueado = config.bracket_bloqueado === "true";

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
      if (grupoCerrado) return "⏰ Fase de grupos cerrada. Ya no puedes modificar pronósticos.";
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
            return `
              <div class="partido ${disabled ? 'cerrado':''}">
                <div class="fecha">${new Date(p.fecha_hora).toLocaleString("es-ES",{weekday:"short", day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"})}</div>
                ${real ? `<div class="resultado-real">Resultado: <b>${p.goles_a}-${p.goles_b}</b> (${real==='A'?eqA.nombre:real==='B'?eqB.nombre:'Empate'})</div>` : ""}
                <div class="opciones" data-partido="${p.id}">
                  <button class="op ${mi==='A'?'activa':''}" data-pick="A" ${disabled?'disabled':''}>${eqA.flag} ${eqA.nombre}</button>
                  <button class="op ${mi==='EMPATE'?'activa':''}" data-pick="EMPATE" ${disabled?'disabled':''}>Empate</button>
                  <button class="op ${mi==='B'?'activa':''}" data-pick="B" ${disabled?'disabled':''}>${eqB.flag} ${eqB.nombre}</button>
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
  if (eliminatoriasAbiertas && elim.length > 0) {
    $("#seccion-bracket").style.display = "block";
    $("#estado-bracket").textContent = bracketBloqueado
      ? "🔒 Bracket bloqueado. No se puede cambiar."
      : "📝 Rellena tu bracket de una sola vez. Cuando empiecen los dieciseisavos quedará bloqueado.";
    renderBracket(elim, localPicks, bracketBloqueado);
  }

  function renderBracket(matches, picks, bloqueado) {
    const titulos = { r32:"Dieciseisavos", r16:"Octavos", qf:"Cuartos", sf:"Semifinales", final:"Final" };
    const porFase = {};
    for (const m of matches) (porFase[m.fase] ||= []).push(m);
    const localBPicks = { ...picks };

    function fasePrev(f) { return {r16:"r32", qf:"r16", sf:"qf", final:"sf"}[f]; }
    const mapaFuentes = window.__BRACKET_FUENTES__ || {};
    function equipoEn(matchId, slot) {
      const m = matches.find(x => x.id === matchId);
      if (!m) return "—";
      if (m.fase === "r32") return slot === "a" ? m.equipo_a : m.equipo_b;
      const f = mapaFuentes[matchId]; if (!f) return "?";
      const src = slot === "a" ? f.a : f.b;
      return localBPicks[src] || "?";
    }

    let html = "";
    for (const f of fasesElim) {
      const ms = (porFase[f] || []).sort((a,b)=>a.id.localeCompare(b.id, undefined, {numeric:true}));
      if (ms.length === 0) continue;
      html += `<h3>${titulos[f]}</h3><div class="ronda">`;
      for (const m of ms) {
        const eqA = equipoEn(m.id, "a"), eqB = equipoEn(m.id, "b");
        const mi = localBPicks[m.id];
        const labA = eqA === "?" || eqA === "—" ? eqA : equipoLabel(eqA);
        const labB = eqB === "?" || eqB === "—" ? eqB : equipoLabel(eqB);
        html += `
          <div class="partido-elim" data-partido="${m.id}">
            <div class="fecha">${m.fecha_hora ? new Date(m.fecha_hora).toLocaleString("es-ES",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}) : ""}</div>
            ${m.resultado ? `<div class="resultado-real">Ganó: <b>${equipoLabel(m.resultado)}</b></div>` : ""}
            <div class="opciones-elim">
              <button class="op ${mi===eqA?'activa':''}" data-equipo="${eqA}" ${bloqueado||eqA==='?'||eqA==='—'?'disabled':''}>${labA}</button>
              <button class="op ${mi===eqB?'activa':''}" data-equipo="${eqB}" ${bloqueado||eqB==='?'||eqB==='—'?'disabled':''}>${labB}</button>
            </div>
          </div>`;
      }
      html += "</div>";
    }
    $("#bracket").innerHTML = html;

    if (!bloqueado) {
      $("#btn-guardar-bracket").style.display = "inline-block";
      $$("#bracket .partido-elim .op").forEach(btn => {
        btn.addEventListener("click", () => {
          if (btn.disabled) return;
          const partidoId = btn.closest(".partido-elim").dataset.partido;
          const equipo = btn.dataset.equipo;
          localBPicks[partidoId] = equipo;
          renderBracket(matches, localBPicks, bloqueado);
        });
      });
      $("#btn-guardar-bracket").onclick = async () => {
        const picksArr = Object.entries(localBPicks)
          .filter(([id]) => matches.find(m=>m.id===id))
          .map(([partido_id, equipo]) => ({partido_id, equipo}));
        const { error } = await sb.rpc("guardar_bracket", {
          p_usuario_id: sesion.id, p_token: sesion.token, p_picks: picksArr
        });
        if (error) mostrarError(error.message);
        else { limpiarError(); Modal.toast("Bracket guardado"); }
      };
    }
  }

  renderGrupos();
})();
