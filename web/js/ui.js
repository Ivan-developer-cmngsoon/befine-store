/* =====================================================================
   ui.js — Cascarón interactivo compartido (se carga en TODAS las páginas)
   ---------------------------------------------------------------------
   Responsabilidades:
     - toast()        : aviso flotante reutilizable  -> window.toast('...')
     - catGrad()      : degradado placeholder por categoría -> window.catGrad(slug)
     - Reveals        : animación de aparición al hacer scroll
     - Carrito        : inyecta y controla el cajón (drawer) + contador
     - Checkout demo  : modal de confirmación (nombre + términos)
     - Menú móvil     : abre/cierra la navegación en pantallas chicas
   Se ejecuta al cargar el DOM. Las páginas solo deben tener el botón
   .cart-btn en la barra; el resto lo monta este archivo.
   ===================================================================== */
(function () {
  /* ---------- Degradados placeholder por categoría ---------- */
  const GRADS = {
    packs: "linear-gradient(160deg,#2A86E0,#0B2F70)",
    dispensadores: "linear-gradient(160deg,#3D9BEA,#0D2A5E)",
    bidones: "linear-gradient(160deg,#1E6FD0,#0A2A66)",
    recargas: "linear-gradient(160deg,#1259B8,#0A2352)",
  };
  window.catGrad = (slug) => GRADS[slug] || "linear-gradient(160deg,#1E6FD0,#0A2A66)";

  /* ---------- Toast ---------- */
  let toastT;
  window.toast = function (msg) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 3000);
  };

  /* ---------- Reveals (aparecer al hacer scroll) ---------- */
  function initReveals() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.documentElement.classList.add("js-anim");
    const io = new IntersectionObserver((ents) => {
      ents.forEach((en) => {
        if (en.isIntersecting) {
          en.target.style.transitionDelay = ((+en.target.dataset.d || 0) * 0.07) + "s";
          en.target.classList.add("in"); io.unobserve(en.target);
        }
      });
    }, { threshold: .12, rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  }

  /* ---------- Carrito: inyecta el drawer y el modal de checkout ---------- */
  function buildCartUI() {
    const html = `
      <div class="drawer-backdrop" id="cartBackdrop"></div>
      <aside class="drawer" id="cartDrawer" aria-label="Carrito de compra">
        <header><h3>Tu carrito</h3><button class="close" id="cartClose" aria-label="Cerrar">&times;</button></header>
        <div class="items" id="cartItems"></div>
        <footer>
          <div class="total-row"><span>Total</span><span class="big" id="cartTotal">$0</span></div>
          <button class="btn btn-primary btn-block" id="cartCheckout">Ir a pagar</button>
        </footer>
      </aside>
      <div class="overlay" id="checkout" hidden>
        <div class="panel" role="dialog" aria-modal="true" aria-label="Confirmar pedido">
          <h3>Confirmar pedido</h3>
          <p class="prod" id="checkoutResumen">—</p>
          <label class="field" for="coNombre">¿A nombre de quién va el pedido?</label>
          <input type="text" id="coNombre" placeholder="Tu nombre" maxlength="40" autocomplete="given-name">
          <div class="terms">
            <input type="checkbox" id="coTerms">
            <label for="coTerms">Acepto los términos y que Befine guarde mis datos para personalizar mi experiencia.</label>
          </div>
          <div class="actions">
            <button class="btn btn-ghost" id="coCancel">Cancelar</button>
            <button class="btn btn-primary" id="coConfirm" disabled>Confirmar compra</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML("beforeend", html);

    const backdrop = document.getElementById("cartBackdrop");
    const drawer = document.getElementById("cartDrawer");
    const openBtns = document.querySelectorAll(".cart-btn");
    const open = () => { backdrop.classList.add("open"); drawer.classList.add("open"); };
    const close = () => { backdrop.classList.remove("open"); drawer.classList.remove("open"); };
    openBtns.forEach((b) => b.addEventListener("click", open));
    document.getElementById("cartClose").addEventListener("click", close);
    backdrop.addEventListener("click", close);

    // Checkout modal
    const modal = document.getElementById("checkout");
    const nombre = document.getElementById("coNombre");
    const terms = document.getElementById("coTerms");
    const confirm = document.getElementById("coConfirm");
    const refresh = () => { confirm.disabled = !(terms.checked && nombre.value.trim()); };
    nombre.addEventListener("input", refresh); terms.addEventListener("change", refresh);
    document.getElementById("coCancel").addEventListener("click", () => modal.hidden = true);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });
    // Abrir el checkout (lo usan el carrito y el botón "Comprar ahora")
    function openCheckout() {
      if (Store.count() === 0) { window.toast("Tu carrito está vacío."); return; }
      document.getElementById("checkoutResumen").textContent =
        Store.count() + " producto(s) · Total " + Befine.clp(Store.total());
      modal.hidden = false; close(); setTimeout(() => nombre.focus(), 50);
    }
    window.openCheckout = openCheckout;   // disponible para "Comprar ahora"
    document.getElementById("cartCheckout").addEventListener("click", openCheckout);
    confirm.addEventListener("click", () => {
      const n = nombre.value.trim(); if (!n || !terms.checked) return;
      modal.hidden = true; Store.clear();
      window.toast("¡Listo, " + n + "! Pedido confirmado (demo). Aquí se conectaría Mercado Pago.");
    });

    // Redibujar el contenido del carrito cada vez que cambia
    Store.subscribe(renderCart);
  }

  function renderCart(items) {
    // Contador en la barra
    document.querySelectorAll(".cart-count").forEach((el) => {
      const c = Store.count(); el.textContent = c; el.style.display = c ? "grid" : "none";
    });
    const box = document.getElementById("cartItems");
    const totalEl = document.getElementById("cartTotal");
    if (!box) return;
    if (!items.length) { box.innerHTML = `<p class="empty">Aún no agregas productos.</p>`; if (totalEl) totalEl.textContent = "$0"; return; }
    box.innerHTML = items.map((i) => `
      <div class="cart-item">
        <div class="thumb" style="background:${i.grad || window.catGrad()}"></div>
        <div class="info">
          <h4>${i.nombre}</h4>
          ${i.variante && i.variante !== "Estándar" ? `<div class="var">${i.variante}</div>` : ""}
          <div class="price">${Befine.clp(i.precio)} · x${i.cantidad}</div>
          <div class="stepper" style="margin-top:6px">
            <button data-dec="${i.variante_id}">−</button>
            <input value="${i.cantidad}" readonly>
            <button data-inc="${i.variante_id}">+</button>
          </div>
        </div>
        <button class="remove" data-del="${i.variante_id}">Quitar</button>
      </div>`).join("");
    if (totalEl) totalEl.textContent = Befine.clp(Store.total());

    box.querySelectorAll("[data-inc]").forEach((b) => b.onclick = () => Store.setQty(b.dataset.inc, itemQty(b.dataset.inc) + 1));
    box.querySelectorAll("[data-dec]").forEach((b) => b.onclick = () => Store.setQty(b.dataset.dec, itemQty(b.dataset.dec) - 1));
    box.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => Store.remove(b.dataset.del));
  }
  function itemQty(id) { const it = Store.items().find((i) => i.variante_id === id); return it ? it.cantidad : 0; }

  /* ---------- Menú móvil ---------- */
  function initMenu() {
    const btn = document.querySelector(".menu-btn");
    const nav = document.querySelector(".nav");
    if (btn && nav) btn.addEventListener("click", () => {
      const open = nav.style.display === "flex";
      nav.style.display = open ? "" : "flex";
      nav.style.position = "absolute"; nav.style.top = "58px"; nav.style.right = "16px";
      nav.style.flexDirection = "column"; nav.style.background = "var(--glass-2)";
      nav.style.padding = "14px 18px"; nav.style.borderRadius = "14px"; nav.style.border = "1px solid var(--line)";
    });
  }

  /* ---------- Buscador móvil: la lupa despliega el campo sobre la barra ---------- */
  function initSearch() {
    const form = document.querySelector(".search");
    if (!form) return;
    const input = form.querySelector("input");
    const icon = form.querySelector("svg");
    if (!input || !icon) return;
    const isMobile = () => window.matchMedia("(max-width: 720px)").matches;
    icon.style.cursor = "pointer";
    icon.addEventListener("click", (e) => {
      if (!isMobile()) return;                         // en desktop el campo ya está visible
      if (!form.classList.contains("expanded")) {
        e.preventDefault(); e.stopPropagation();
        form.classList.add("expanded");
        setTimeout(() => input.focus(), 60);
      } else if (input.value.trim()) {
        form.submit();                                 // ya expandido y con texto: buscar
      } else {
        e.preventDefault();
      }
    });
    input.addEventListener("blur", () => { if (!input.value.trim()) form.classList.remove("expanded"); });
    input.addEventListener("keydown", (e) => { if (e.key === "Escape") { form.classList.remove("expanded"); input.blur(); } });
  }

  /* ---------- Arranque ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    buildCartUI();
    initReveals();
    initMenu();
    initSearch();
  });
})();
