// Cliente Supabase + utilidades de sesión
const { createClient } = window.supabase;
const sb = createClient(window.PORRA_CONFIG.SUPABASE_URL, window.PORRA_CONFIG.SUPABASE_ANON_KEY);

const Sesion = {
  guardar(u) {
    localStorage.setItem("porra_sesion", JSON.stringify(u));
  },
  cargar() {
    try { return JSON.parse(localStorage.getItem("porra_sesion")); } catch { return null; }
  },
  cerrar() { localStorage.removeItem("porra_sesion"); },
  requerir() {
    const s = this.cargar();
    if (!s) { window.location.href = "index.html"; return null; }
    return s;
  }
};

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

function mostrarError(msg) {
  const el = $("#error");
  if (el) { el.textContent = msg; el.style.display = "block"; }
  else { alert(msg); }
}
function limpiarError() {
  const el = $("#error");
  if (el) { el.textContent = ""; el.style.display = "none"; }
}

window.sb = sb;
window.Sesion = Sesion;
window.$ = $; window.$$ = $$;
window.mostrarError = mostrarError; window.limpiarError = limpiarError;
