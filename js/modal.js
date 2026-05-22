// Sistema de modales personalizado (sustituye alert/confirm/prompt del navegador)
(function() {
  function crearBackdrop() {
    const bg = document.createElement("div");
    bg.className = "modal-backdrop";
    return bg;
  }
  function cerrar(bg) { bg.remove(); }

  window.Modal = {
    alert(mensaje, titulo = "Aviso") {
      return new Promise(resolve => {
        const bg = crearBackdrop();
        bg.innerHTML = `
          <div class="modal" role="dialog" aria-modal="true">
            <h3>${titulo}</h3>
            <p>${mensaje}</p>
            <div class="modal-acciones">
              <button class="ok-btn">Entendido</button>
            </div>
          </div>`;
        document.body.appendChild(bg);
        bg.querySelector(".ok-btn").focus();
        const fin = () => { cerrar(bg); resolve(); };
        bg.querySelector(".ok-btn").onclick = fin;
        bg.addEventListener("click", e => { if (e.target === bg) fin(); });
      });
    },

    confirm(mensaje, titulo = "¿Confirmar?", opciones = {}) {
      const okText = opciones.okText || "Sí";
      const cancelText = opciones.cancelText || "Cancelar";
      const peligro = opciones.peligro;
      return new Promise(resolve => {
        const bg = crearBackdrop();
        bg.innerHTML = `
          <div class="modal" role="dialog" aria-modal="true">
            <h3>${titulo}</h3>
            <p>${mensaje}</p>
            <div class="modal-acciones">
              <button class="secundario cancel-btn">${cancelText}</button>
              <button class="${peligro?'peligro':''} ok-btn">${okText}</button>
            </div>
          </div>`;
        document.body.appendChild(bg);
        bg.querySelector(".ok-btn").focus();
        const fin = v => { cerrar(bg); resolve(v); };
        bg.querySelector(".ok-btn").onclick = () => fin(true);
        bg.querySelector(".cancel-btn").onclick = () => fin(false);
        bg.addEventListener("click", e => { if (e.target === bg) fin(false); });
      });
    },

    prompt(mensaje, titulo = "Introduce un valor", opciones = {}) {
      return new Promise(resolve => {
        const bg = crearBackdrop();
        const inputType = opciones.type || "text";
        const placeholder = opciones.placeholder || "";
        bg.innerHTML = `
          <div class="modal" role="dialog" aria-modal="true">
            <h3>${titulo}</h3>
            <p>${mensaje}</p>
            <input type="${inputType}" class="prompt-input" placeholder="${placeholder}" ${opciones.pattern?`pattern="${opciones.pattern}"`:''} ${opciones.maxlength?`maxlength="${opciones.maxlength}"`:''} ${opciones.inputmode?`inputmode="${opciones.inputmode}"`:''}>
            <div class="modal-acciones" style="margin-top:14px">
              <button class="secundario cancel-btn">Cancelar</button>
              <button class="ok-btn">Aceptar</button>
            </div>
          </div>`;
        document.body.appendChild(bg);
        const inp = bg.querySelector(".prompt-input");
        inp.focus();
        const fin = v => { cerrar(bg); resolve(v); };
        bg.querySelector(".ok-btn").onclick = () => fin(inp.value);
        bg.querySelector(".cancel-btn").onclick = () => fin(null);
        bg.addEventListener("click", e => { if (e.target === bg) fin(null); });
        inp.addEventListener("keydown", e => { if (e.key === "Enter") fin(inp.value); });
      });
    },

    toast(mensaje, tipo = "ok", duracion = 2500) {
      const t = document.createElement("div");
      t.className = tipo === "error" ? "error" : "ok";
      t.style.position = "fixed";
      t.style.top = "70px";
      t.style.right = "16px";
      t.style.zIndex = "200";
      t.style.maxWidth = "320px";
      t.style.boxShadow = "0 8px 24px rgba(0,0,0,.35)";
      t.textContent = mensaje;
      document.body.appendChild(t);
      setTimeout(() => {
        t.style.transition = "opacity .3s, transform .3s";
        t.style.opacity = "0"; t.style.transform = "translateX(20px)";
        setTimeout(() => t.remove(), 300);
      }, duracion);
    }
  };
})();
