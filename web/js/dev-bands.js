/* =====================================================================
   dev-bands.js — PANEL DE VISTA PREVIA (SOLO DESARROLLO)
   ---------------------------------------------------------------------
   Cambia la banda horaria a mano para ver cómo queda cada momento del día:
   colores + agua + acento (js/bands.js) Y la escena de fondo (js/scenes.js).
   QUITAR ANTES DE PUBLICAR: borra este archivo y su <script> en los HTML.
   ===================================================================== */
(function () {
  var BANDS = [
    ["auto", "Auto (hora real)"], ["madrugada", "Madrugada"],
    ["mediodia", "Día / Mediodía"], ["tarde", "Tarde"], ["noche", "Noche"]
  ];
  document.addEventListener("DOMContentLoaded", function () {
    var box = document.createElement("div");
    box.className = "dev-bands";
    box.innerHTML =
      '<span class="dev-lbl">Vista previa · dev</span><div class="seg">' +
      BANDS.map(function (x, i) {
        return '<button data-b="' + x[0] + '"' + (i === 0 ? ' class="active"' : '') + '>' + x[1] + '</button>';
      }).join("") + '</div>';
    document.body.appendChild(box);
    box.querySelector(".seg").addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-b]"); if (!btn) return;
      box.querySelectorAll("button").forEach(function (x) { x.classList.remove("active"); });
      btn.classList.add("active");
      var bnd = btn.dataset.b;
      if (window.Bands) window.Bands.apply(bnd);                       // colores + agua + acento
      if (window.BefineScenes) window.BefineScenes.set(bnd);           // escena de fondo
      if (document.body.classList.contains("tema-claro") && window.BefineTheme) window.BefineTheme.aguaClara();
      if (typeof window.onBandChange === "function") window.onBandChange(); // saludo (home)
      if (window.toast) window.toast("Vista previa: " + btn.textContent);
    });
  });
})();
