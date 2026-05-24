// Pantalla de clasificación de grupos: una tabla por grupo con PJ, G, E, P, GF, GC, DG, Pts
(async function() {
  const sesion = Sesion.requerir(); if (!sesion) return;
  $("#usuario-nombre").textContent = "👤 " + sesion.nombre;
  if (sesion.es_admin) $("#link-admin").style.display = "inline-block";
  $("#btn-salir").addEventListener("click", e => { e.preventDefault(); Sesion.cerrar(); location.href = "index.html"; });

  const { data: partidos, error } = await sb.from("partidos").select("*");
  if (error) { mostrarError("Error cargando datos"); return; }

  const partidosGrupos = partidos.filter(p => p.fase === "grupos");
  if (partidosGrupos.length === 0) {
    $("#estado").textContent = "Aún no se ha cargado el calendario.";
    return;
  }
  const totalJugados = partidosGrupos.filter(p => p.resultado).length;
  $("#estado").innerHTML = `Partidos jugados: <b>${totalJugados}/${partidosGrupos.length}</b> · Ordenado por puntos → diferencia de goles → goles a favor.`;

  // ¿Bracket ya creado? Si sí, sabemos qué 8 terceros han pasado.
  const partidosR32 = partidos.filter(p => p.fase === "r32");
  const bracketCreado = partidosR32.length > 0;
  const equiposEnR32 = new Set();
  if (bracketCreado) {
    for (const p of partidosR32) {
      if (p.equipo_a) equiposEnR32.add(p.equipo_a);
      if (p.equipo_b) equiposEnR32.add(p.equipo_b);
    }
  }

  // Calcular clasificaciones
  const equipos = {};
  for (const m of partidosGrupos) {
    (equipos[m.grupo] ||= {});
    for (const e of [m.equipo_a, m.equipo_b]) {
      equipos[m.grupo][e] ||= {equipo:e, pj:0, g:0, e:0, p:0, gf:0, gc:0, pts:0};
    }
  }
  for (const m of partidosGrupos) {
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

  const html = Object.keys(equipos).sort().map(g => {
    const filas = Object.values(equipos[g])
      .map(t => ({...t, dg: t.gf - t.gc}))
      .sort((x,y) => y.pts-x.pts || y.dg-x.dg || y.gf-x.gf || x.equipo.localeCompare(y.equipo));

    return `
      <section class="card">
        <h2>Grupo ${g}</h2>
        <table class="tabla-grupo">
          <thead><tr>
            <th>#</th><th>Equipo</th>
            <th title="Partidos jugados">PJ</th>
            <th title="Ganados">G</th>
            <th title="Empatados">E</th>
            <th title="Perdidos">P</th>
            <th title="Goles a favor">GF</th>
            <th title="Goles en contra">GC</th>
            <th title="Diferencia de goles">DG</th>
            <th title="Puntos">Pts</th>
          </tr></thead>
          <tbody>
            ${filas.map((t,i) => {
              const e = equipo(t.equipo);
              let clasePos;
              if (i < 2) clasePos = 'pasa-directo';
              else if (i === 2) {
                // 3er puesto: si el bracket existe, sabemos si pasó o no
                if (bracketCreado) {
                  clasePos = equiposEnR32.has(t.equipo) ? 'pasa-tercero' : 'eliminado';
                } else {
                  clasePos = 'tercero';  // aún no se sabe
                }
              } else clasePos = 'eliminado';
              return `<tr class="${clasePos}">
                <td><b>${i+1}</b></td>
                <td><span class="g-flag">${e.flag}</span> ${e.nombre}</td>
                <td>${t.pj}</td><td>${t.g}</td><td>${t.e}</td><td>${t.p}</td>
                <td>${t.gf}</td><td>${t.gc}</td>
                <td>${t.dg >= 0 ? '+'+t.dg : t.dg}</td>
                <td><b>${t.pts}</b></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
        <p class="leyenda-grupo">
          <span><span class="dot pasa-directo"></span>Pasa directo</span>
          ${bracketCreado
            ? `<span><span class="dot pasa-tercero"></span>Pasa como 3º</span>`
            : `<span><span class="dot tercero"></span>Puede pasar (3º)</span>`
          }
          <span><span class="dot eliminado"></span>Eliminado</span>
        </p>
      </section>`;
  }).join("");
  $("#grupos").innerHTML = html;
})();
