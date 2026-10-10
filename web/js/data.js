/* =====================================================================
   data.js — API de Befine Store CONECTADA A SUPABASE (real)
   ---------------------------------------------------------------------
   Este archivo reemplaza a la "API falsa". La interfaz (home, catálogo,
   ficha) sigue hablando SOLO con `window.Befine`, con los MISMOS métodos
   y el MISMO formato de salida que antes; lo único que cambió es que ahora
   los datos vienen de la base real (tablas del schema DEFINITIVO), no de
   arreglos en memoria.

   Requisito: cargar supabase-js ANTES que este archivo. En cada HTML,
   justo antes de <script src="js/data.js">:
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   Eso expone window.supabase.createClient (sin build, sin bundler).

   Seguridad: la anon/publishable key es PÚBLICA por diseño; lo que protege
   los datos es el RLS de Supabase (lectura pública solo del catálogo activo).
   La service_role NUNCA va aquí.
   ===================================================================== */

/* ---------- Conexión (pública; la protege el RLS) ---------- */
const SUPABASE_URL = "https://tbnevbvvwwzpnowxqyps.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_km2cItCJ9UtuZkh1xNb-Uw_FqqUeUYG";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- Ofertas (precio "habitual" tachado) ----------
   El schema hoy guarda SOLO `precio`, no `precio_comparacion`. Para no
   tocar la base en producción, el precio tachado (marketing) vive aquí,
   mapeado por SKU (estable). Si mañana agregan la columna a la tabla
   precios_variante, se borra este bloque y se lee de la BD. */
const OFERTAS = {
  "BEF-DISP-MESA":      90990,
  "BEF-DISP-SINOCULTO": 139990,
  "BEF-BID-12":         5490,
  "BEF-BID-20":         6500,
  "BEF-REC-12":         2400,
  "BEF-REC-20-BEFINE":  3500,
  "BEF-REC-20-OTRA":    3500,
};

/* ---------- Reseñas reales de Google ----------
   Se leen desde la Edge Function `resenas-google` de Supabase, que consulta
   Google Places API (New) con la clave guardada como SECRETO en Supabase
   (la clave de Google NUNCA va en el navegador). Places entrega la nota,
   el total y hasta 5 reseñas (las más relevantes según Google). */
const RESENAS_FN = "resenas-google";

/* ---------- Aviso destacado para recargas ----------
   Mensaje visible en la tarjeta de recarga. Se aplica a los productos cuyos
   SKU empiezan con "BEF-REC-". Texto editable (pendiente migrar al Admin). */
const AVISO_RECARGA = "Aceptamos envases de otras marcas"; // se muestra en MAYÚSCULAS por CSS

/* ---------- Selección de productos por SKU (estable entre entornos) ----------
   Los UUID cambian entre bases; el SKU no. Por eso los "destacados" y el
   producto protagonista del hero se eligen por SKU, no por id. */
const DESTACADOS_SKU = ["BEF-PACK-4REC12", "BEF-DISP-USB", "BEF-BID-20", "BEF-REC-12"]; // sin la Recarga 20L (ya es protagonista del inicio)
const HERO_SKU = "BEF-REC-20-BEFINE"; // Recarga Bidón 20 L (protagonista del inicio)

/* ---------- Consulta base: producto + categoría + variantes + precios ---------- */
const SELECT_PRODUCTO =
  "id,categoria_id,nombre,descripcion,imagen_url,activo," +
  "categorias(nombre,slug)," +
  "variantes_producto(id,producto_id,sku,nombre,atributos,stock,activo," +
  "precios_variante(nivel_precio_id,precio))";

/* Resuelve el id del nivel de precio "retail" una sola vez (no lo quema). */
let _retailId = null;
async function _nivelRetail() {
  if (_retailId != null) return _retailId;
  const { data } = await sb.from("niveles_precio").select("id,codigo").order("id");
  const r = (data || []).find((n) => /retail/i.test(n.codigo || "")) || (data || [])[0];
  _retailId = r ? r.id : 1;
  return _retailId;
}

/* Convierte una fila de Supabase al MISMO view-model que usaba la maqueta,
   para que cards.js / home.js / catalogo.js / producto.js no cambien. */
function _armarProducto(p, nivel) {
  const variantes = (p.variantes_producto || [])
    .filter((v) => v.activo)
    .sort((a, b) => (a.sku || "").localeCompare(b.sku || "")) // orden estable (Befine antes que Otra)
    .map((v) => {
      const pr =
        (v.precios_variante || []).find((x) => x.nivel_precio_id === nivel) ||
        (v.precios_variante || [])[0];
      return {
        id: v.id,
        producto_id: v.producto_id,
        sku: v.sku,
        nombre: v.nombre,
        atributos: v.atributos || {},
        stock: v.stock,
        activo: v.activo,
        precio: pr ? pr.precio : null,
        precio_comparacion: OFERTAS[v.sku] || null,
      };
    });
  const precios = variantes.map((v) => v.precio).filter((n) => n != null);
  const desde = precios.length ? Math.min(...precios) : null;
  const varMin = variantes.find((v) => v.precio === desde);
  const cat = p.categorias || {};
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    imagen_url: p.imagen_url,
    activo: p.activo,
    categoria: cat.nombre || null,
    categoria_slug: cat.slug || null,
    variantes,
    desde_precio: desde,
    desde_comparacion: varMin ? varMin.precio_comparacion : null,
    aviso: variantes.some((v) => (v.sku || "").startsWith("BEF-REC-")) ? AVISO_RECARGA : null,
  };
}

/* =====================================================================
   Befine — la "API". La interfaz SOLO habla con esto (igual que antes).
   Todos los métodos devuelven Promesas (ahora reales, contra Supabase).
   ===================================================================== */
/* Normaliza texto para buscar sin distinguir acentos ni mayúsculas:
   "Bidón" -> "bidon", así "bidon" también encuentra "Bidón". */
function _norm(str) {
  return (str || "").toString().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

const Befine = {
  /* Formatea CLP: 2500 -> "$2.500" */
  clp(n) {
    return "$" + Number(n).toLocaleString("es-CL");
  },

  /* Categorías para los filtros del catálogo */
  async listCategorias() {
    const { data, error } = await sb.from("categorias").select("*").order("id");
    if (error) { console.error("listCategorias:", error.message); return []; }
    return data || [];
  },

  /* Lista de productos activos, con filtro opcional por categoría (slug) y búsqueda (q). */
  async listProductos({ categoria = null, q = null } = {}) {
    const nivel = await _nivelRetail();
    const { data, error } = await sb
      .from("productos")
      .select(SELECT_PRODUCTO)
      .eq("activo", true)
      .order("created_at", { ascending: true });
    if (error) { console.error("listProductos:", error.message); return []; }
    let items = (data || []).map((p) => _armarProducto(p, nivel));
    if (categoria) items = items.filter((p) => p.categoria_slug === categoria);
    if (q) {
      const t = _norm(q);
      items = items.filter((p) =>
        _norm((p.nombre || "") + " " + (p.descripcion || "") + " " + (p.categoria || "")).includes(t)
      );
    }
    return items;
  },

  /* Un producto por id (UUID real), con variantes y precios (para la ficha) */
  async getProducto(id) {
    const nivel = await _nivelRetail();
    const { data, error } = await sb
      .from("productos")
      .select(SELECT_PRODUCTO)
      .eq("id", id)
      .eq("activo", true)
      .maybeSingle();
    if (error) { console.error("getProducto:", error.message); return null; }
    return data ? _armarProducto(data, nivel) : null;
  },

  /* Producto protagonista del hero (Recarga 20 L), elegido por SKU estable */
  async getHero() {
    const nivel = await _nivelRetail();
    // Busca la variante por SKU y de ahí sube al producto completo.
    const { data: v } = await sb
      .from("variantes_producto")
      .select("producto_id")
      .eq("sku", HERO_SKU)
      .maybeSingle();
    if (!v) return null;
    const { data, error } = await sb
      .from("productos")
      .select(SELECT_PRODUCTO)
      .eq("id", v.producto_id)
      .maybeSingle();
    if (error) { console.error("getHero:", error.message); return null; }
    return data ? _armarProducto(data, nivel) : null;
  },

  /* Destacados para la home ("Lo más pedido"), elegidos por SKU y en orden */
  async getDestacados() {
    const items = await this.listProductos();
    const bySku = (sku) => items.find((p) => (p.variantes || []).some((v) => v.sku === sku));
    return DESTACADOS_SKU.map(bySku).filter(Boolean);
  },

  /* Reseñas reales para la home. Devuelve
     { fuente, promedio, total, url_resenas, url_escribir, items[] } o null si falla
     (la home oculta la sección en ese caso, sin romper la página). */
  async getResenas() {
    // Costo cero: cada visitante reutiliza su copia por 1 hora (no vuelve a llamar).
    const K = "befine_resenas", TTL = 60 * 60 * 1000;
    try { const c = JSON.parse(localStorage.getItem(K) || "null"); if (c && Date.now() - c.t < TTL) return c.data; } catch (e) {}
    try {
      const { data, error } = await sb.functions.invoke(RESENAS_FN, { method: "GET" });
      if (error || !data || data.error) { console.error("getResenas:", error?.message || data?.error); return null; }
      try { localStorage.setItem(K, JSON.stringify({ t: Date.now(), data })); } catch (e) {}
      return data;
    } catch (e) { console.error("getResenas:", e); return null; }
  },

  /* Zonas de despacho (para el checkout). Lectura pública por RLS. */
  async listZonas() {
    const { data, error } = await sb
      .from("zonas_despacho")
      .select("*")
      .eq("activo", true)
      .order("id");
    if (error) { console.error("listZonas:", error.message); return []; }
    return data || [];
  },

  /* Perfil del usuario autenticado (o null si es visitante). */
  async getPerfil() {
    return this.auth.sesion();
  },
};

/* =====================================================================
   CUENTA — Supabase Auth (REAL). Correo+contraseña, Google y recuperación.
   Requisitos en Supabase (panel): Authentication → Providers → Email (activo);
   Google (cuando se configure el cliente OAuth); URL Configuration → Site URL
   y Redirect URLs con el dominio del sitio (ver claude/pendiente-backend-checkout.md).
   ===================================================================== */
// URL base del sitio (para los enlaces de correo y el regreso desde Google). En file:// no aplica.
const APP_URL = /^https?:/.test(location.protocol) ? location.href.replace(/[^/]*([?#].*)?$/, "") : null;

// Mensajes de Supabase → español claro para el cliente
function _msgAuth(e) {
  const m = ((e && (e.message || e.error_description)) || String(e || "")).toLowerCase();
  if (m.includes("invalid login")) return "Correo o contraseña incorrectos.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Ya existe una cuenta con ese correo. Ingresa o recupera tu contraseña.";
  if (m.includes("email not confirmed")) return "Confirma tu correo: te enviamos un enlace al registrarte.";
  if (m.includes("password") && (m.includes("at least") || m.includes("6 characters"))) return "La contraseña debe tener al menos 8 caracteres.";
  if (m.includes("rate limit") || m.includes("too many")) return "Demasiados intentos. Espera un minuto e inténtalo de nuevo.";
  if (m.includes("provider is not enabled") || m.includes("unsupported provider")) return "El ingreso con Google aún no está activado.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Sin conexión. Revisa tu internet e inténtalo de nuevo.";
  return "No pudimos completar la acción. Inténtalo nuevamente.";
}

Befine.auth = {
  /* Sesión actual + datos de public.perfiles → { id, email, nombre, telefono, rut, razon_social, giro, es_empresa, puntos } | null */
  async sesion() {
    try {
      const { data } = await sb.auth.getSession();
      const u = data && data.session && data.session.user;
      if (!u || u.is_anonymous) return null;
      const { data: pf } = await sb.from("perfiles")
        .select("nombre,apellido,telefono,rut,razon_social,giro,es_empresa,puntos_saldo")
        .eq("id", u.id).maybeSingle();
      const meta = u.user_metadata || {};
      return {
        id: u.id, email: u.email,
        nombre: (pf && pf.nombre) || meta.nombre || meta.full_name || (u.email || "").split("@")[0],
        apellido: pf && pf.apellido, telefono: (pf && pf.telefono) || meta.telefono || "",
        rut: pf && pf.rut, razon_social: pf && pf.razon_social, giro: pf && pf.giro,
        es_empresa: !!(pf && pf.es_empresa), puntos: (pf && pf.puntos_saldo) || 0,
      };
    } catch (e) { return null; }
  },
  async ingresar(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    return error ? { ok: false, error: _msgAuth(error) } : { ok: true };
  },
  /* Registro: el trigger handle_new_user crea la fila en perfiles con el nombre enviado */
  async registrar({ nombre, email, password, telefono }) {
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { nombre, telefono }, emailRedirectTo: APP_URL ? APP_URL + "cuenta.html" : undefined },
    });
    if (error) return { ok: false, error: _msgAuth(error) };
    // Si el proyecto exige confirmar correo, no hay sesión todavía
    return { ok: true, confirmar: !(data && data.session) };
  },
  async google(volver) {
    if (!APP_URL) return { ok: false, error: "Google funciona al abrir el sitio desde un servidor (http/https), no como archivo local." };
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: APP_URL + (volver || "cuenta.html") } });
    return error ? { ok: false, error: _msgAuth(error) } : { ok: true };
  },
  async recuperar(email) {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: APP_URL ? APP_URL + "cuenta.html?modo=nueva" : undefined });
    return error ? { ok: false, error: _msgAuth(error) } : { ok: true };
  },
  async nuevaClave(password) {
    const { error } = await sb.auth.updateUser({ password });
    return error ? { ok: false, error: _msgAuth(error) } : { ok: true };
  },
  async salir() { await sb.auth.signOut(); },
  onCambio(cb) { return sb.auth.onAuthStateChange((evento) => cb(evento)); },
};

/* =====================================================================
   CHECKOUT — cobertura, despacho, días de entrega, pedido y pago.
   Lectura de cobertura: REAL (tablas comunas_cobertura / zonas_despacho /
   parametros, lectura pública). Crear pedido y pagar: DEMO hasta el backend
   (compra como invitado + Mercado Pago). La UI no cambia al conectarlo.
   ===================================================================== */
// Contacto del negocio (pendiente migrar a parametros / Admin)
const CONTACTO = { whatsapp: "56958549641" };
// Regla de entrega: lunes a viernes; el pedido estándar llega el siguiente día hábil.
// FERIADOS: fechas "AAAA-MM-DD" sin reparto (pendiente: editable desde el Admin).
const ENTREGA = { diasHabiles: [1, 2, 3, 4, 5], diasAgendables: 20, feriados: [] };
// Respaldo si la BD no responde (mismos datos del schema)
const COBERTURA_RESPALDO = {
  envioGratisDesde: 7000,
  comunas: [
    { comuna: "Quilicura", zona: "Quilicura", costo: 0 },
    { comuna: "Huechuraba", zona: "Sector Norte", costo: 2500 },
    { comuna: "Recoleta", zona: "Sector Norte", costo: 2500 },
    { comuna: "Valle Grande", zona: "Sector Norte", costo: 2500 },
    { comuna: "Valle Lo Campino", zona: "Sector Norte", costo: 2500 },
  ],
};
const _iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const _esHabil = (d) => ENTREGA.diasHabiles.includes(d.getDay()) && !ENTREGA.feriados.includes(_iso(d));

Befine.contacto = CONTACTO;

/* Comunas con cobertura y su costo → { envioGratisDesde, comunas:[{comuna, zona, zona_id, costo}] } */
Befine.getCobertura = async function () {
  try {
    const [{ data: com, error: e1 }, { data: par }] = await Promise.all([
      sb.from("comunas_cobertura").select("comuna,zona_id,zonas_despacho(nombre,costo_despacho,activo)").eq("activo", true).order("comuna"),
      sb.from("parametros").select("valor").eq("clave", "envio_gratis_minimo").maybeSingle(),
    ]);
    if (e1 || !com || !com.length) throw e1 || new Error("sin comunas");
    return {
      envioGratisDesde: par ? Number(par.valor) : COBERTURA_RESPALDO.envioGratisDesde,
      comunas: com.filter((c) => !c.zonas_despacho || c.zonas_despacho.activo !== false).map((c) => ({
        comuna: c.comuna, zona_id: c.zona_id, zona: c.zonas_despacho ? c.zonas_despacho.nombre : "",
        costo: c.zonas_despacho ? c.zonas_despacho.costo_despacho : 0,
      })),
    };
  } catch (e) { return COBERTURA_RESPALDO; }
};

/* Costo de despacho que VE el cliente (el backend lo recalcula al crear el pedido) */
Befine.costoDespacho = function (cobertura, comuna, subtotal) {
  const c = cobertura && cobertura.comunas.find((x) => x.comuna === comuna);
  if (!c) return null;
  if (c.costo > 0 && subtotal >= cobertura.envioGratisDesde) return 0;
  return c.costo;
};

/* Días de entrega: { estandar: Date (siguiente día hábil), agendables: [Date...] } */
Befine.diasEntrega = function (desde = new Date()) {
  const d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const sig = () => { do { d.setDate(d.getDate() + 1); } while (!_esHabil(d)); return new Date(d); };
  const estandar = sig(), agendables = [estandar];
  while (agendables.length < ENTREGA.diasAgendables) agendables.push(sig());
  return { estandar, agendables };
};
Befine.isoFecha = _iso;

/* Crear pedido. payload = {
     contacto:{nombre,email,telefono}, direccion:{calle,numero,depto,comuna,region,referencia},
     entrega:{tipo:'estandar'|'agendada', fecha:'AAAA-MM-DD'}, documento:{tipo:'boleta'|'factura',rut,razon_social,giro},
     items:[{variante_id,nombre,variante,cantidad,precio_unitario}], subtotal, costo_despacho, total }
   DEMO: se guarda en este navegador. PRODUCCIÓN: RPC/Edge Function que valida precios,
   recalcula totales y crea pedidos + detalle_pedido (ver claude/pendiente-backend-checkout.md). */
Befine.crearPedido = async function (payload) {
  await new Promise((r) => setTimeout(r, 650));
  let lista = [];
  try { lista = JSON.parse(localStorage.getItem("befine_pedidos_demo") || "[]"); } catch (e) {}
  const pedido = { ...payload, id: "demo-" + Date.now(), numero: 1000 + lista.length + 1, estado: "pendiente_pago", created_at: new Date().toISOString() };
  lista.unshift(pedido);
  try { localStorage.setItem("befine_pedidos_demo", JSON.stringify(lista.slice(0, 30))); } catch (e) {}
  return { ok: true, pedido };
};

/* Pagar con Mercado Pago. DEMO: aprueba en ~1 s. PRODUCCIÓN: una Edge Function crea la
   preferencia de pago y se redirige a su init_point; el webhook confirma el pago (HU-08/09). */
Befine.pagar = async function (pedido) {
  await new Promise((r) => setTimeout(r, 900));
  pedido.estado = "pagado";
  try {
    const lista = JSON.parse(localStorage.getItem("befine_pedidos_demo") || "[]");
    const it = lista.find((x) => x.id === pedido.id); if (it) it.estado = "pagado";
    localStorage.setItem("befine_pedidos_demo", JSON.stringify(lista));
  } catch (e) {}
  return { ok: true, estado: "aprobado" };
};

/* Pedidos del cliente (por correo). DEMO: los de este navegador. PRODUCCIÓN: select a pedidos (RLS). */
Befine.misPedidos = async function (email) {
  try {
    const lista = JSON.parse(localStorage.getItem("befine_pedidos_demo") || "[]");
    return email ? lista.filter((p) => p.contacto && p.contacto.email === email) : lista;
  } catch (e) { return []; }
};

// Exponer en window para que las páginas lo usen sin bundler (igual que antes).
window.Befine = Befine;
