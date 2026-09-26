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

  /* Perfil del usuario autenticado. Sin login todavía -> null (visitante).
     Cuando exista Supabase Auth: leer public.perfiles del usuario de sesión. */
  async getPerfil() {
    return null;
  },
};

// Exponer en window para que las páginas lo usen sin bundler (igual que antes).
window.Befine = Befine;
