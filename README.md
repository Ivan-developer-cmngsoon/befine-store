# Befine Store

Plataforma de comercio electrónico propia para **Agua Purificada Befine** (agua purificada a domicilio en Quilicura y el sector norte de Santiago). Reemplaza la tienda en Shopify por una solución propia: tienda en línea, panel de administración, pagos, facturación electrónica y fidelización.

**Capstone APT · Ingeniería en Informática · Duoc UC (Sede Plaza Norte) · Grupo N3**
Equipo: Iván Rodríguez · Carlos Fuentes · Felipe Moraga

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | HTML5, CSS3 y JavaScript (sin framework ni build), mobile-first |
| Backend | Supabase: PostgreSQL, Auth, Row Level Security y Edge Functions |
| Pagos | Mercado Pago |
| Facturación | OpenFactura (Haulmer) · boleta y factura electrónica SII |

> El frontend inicial en Flutter se reemplazó por HTML/CSS/JS mediante la **Solicitud de Cambio SC-02** (aprobada el 22-09-2026). El backend no cambió.

## Estructura

```
web/
├─ index.html · catalogo.html · producto.html · checkout.html · cuenta.html
├─ css/        estilos por capas (tokens → base → shell → componentes → página)
├─ js/         data.js es el puente único a Supabase; un controlador por página
├─ assets/     imágenes optimizadas (WebP)
└─ supabase/functions/   Edge Functions (ej.: resenas-google)
```

## Ejecutar en local

Abre `web/index.html` en el navegador, o sírvelo con un servidor estático:

```bash
npx serve web
```

## Forma de trabajo

- **Kanban:** GitHub Projects "Befine Store - Desarrollo"; un milestone por sprint.
- **Ramas:** `main` protegida (Pull Request + 1 aprobación) · ramas de trabajo `ivan`, `carlos`, `felipe` o `feature/HU-XX`.
- **Trazabilidad:** tarjeta `HU-XX` → rama → PR con `Cierra #N` → sección del informe.
- **Control de cambios:** issues con la etiqueta `tipo:cambio` (SC-01, SC-02), según el Plan de Gestión de Cambios.
- **Seguridad:** ninguna clave privada en el repositorio; los secretos viven en Supabase.

## Documentación

Planes de gestión, informes y actas: [Documentos_Capstone_Grupo_N3](https://github.com/Cmfg96/Documentos_Capstone_Grupo_N3)