# befine-store

Plataforma e-commerce propia (HTML5/CSS3/JavaScript + Supabase) para **Agua Purificada Befine** — Capstone APT Duoc UC, Grupo N3.

Documentación del proyecto: [Cmfg96/Documentos_Capstone_Grupo_N3](https://github.com/Cmfg96/Documentos_Capstone_Grupo_N3)

## Ejecutar en local con Docker

Requisito: [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y abierto.

```bash
git clone https://github.com/IvnRP/befine-store.git
cd befine-store
cp .env.example .env      # opcional: cambiar el puerto con WEB_PORT
docker compose up --build
```

Abrir **http://localhost:8080**. Para detenerlo: `docker compose down`.

| Archivo | Para qué sirve |
|---|---|
| `Dockerfile` | Construye la imagen: nginx + la carpeta `web/` |
| `docker-compose.yml` | Levanta el contenedor en el puerto 8080 |
| `docker/nginx.conf` | Compresión, caché y cabeceras de seguridad |
| `.env.example` | Variables de entorno de ejemplo (el `.env` real nunca se sube) |

## Ejecutar sin Docker

```bash
cd web
python -m http.server 8080
```

No abrir los HTML con doble clic (`file://`): el inicio de sesión con Google requiere `http://`.

## Estructura

```
web/          Sitio (index, catálogo, producto, checkout, cuenta) + css/ js/ assets/
web/supabase/ Edge Functions de Supabase (no se publican en el contenedor)
docker/       Configuración de nginx
```
