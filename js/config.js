// ============================================================
// CONFIGURACIÓN DE LA PORRA
// ============================================================
// 1) Rellena SUPABASE_URL y SUPABASE_ANON_KEY con los valores
//    que copies de Supabase (Project Settings → API).
// 2) Si quieres cambiar el sistema de puntos, edita PUNTOS.
// ============================================================

window.PORRA_CONFIG = {
  SUPABASE_URL: "https://weejlbmvgawixgjvvokj.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_u5_1_dsnza42-yyjqjdCNQ_Y4iS87hc",

  PUNTOS: {
    grupos: 1,
    r32: 2,     // dieciseisavos: 2 puntos por cada equipo correctamente colocado en octavos
    r16: 3,     // octavos
    qf:  5,     // cuartos
    sf:  7,     // semis
    final: 10   // campeón
  }
};
