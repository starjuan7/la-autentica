# La Auténtica Acapulqueña · Sistema de gestión

Sistema web independiente (Firebase + GitHub Pages) para pedidos, inventario, catálogo, clientes, producción, reportes y usuarios, con las plazas **Puebla** y **Acapulco** totalmente separadas.

- Dirección: https://autentica.ciudadpaleta.mx
- Firebase: proyecto `la-autentica-acapulquena`
- Administradores principales: Juan y Judith (UID fijos en `core.js` y en `firebase-rules.json`)

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Estructura de pantallas y ventanas |
| `styles.css` | Identidad visual (blanco, azul cielo y negro) |
| `core.js` | Configuración, sesión, plazas, esquemas y precios, datos en tiempo real |
| `pedidos.js` | Inicio, nuevo pedido, pedidos, estados, WhatsApp y PDF |
| `inventario.js` | Existencias, historial, PDF y plan de producción |
| `catalogo.js` | Sabores (precio por esquema) y clientes |
| `reportes.js` | Ventas por período, gráficas y PDF |
| `admin.js` | Bitácora, usuarios y configuración (logo, esquemas, opciones) |
| `boot.js` | Arranque |
| `firebase-rules.json` | Reglas de seguridad de la base de datos |
| `CNAME` | Dominio para GitHub Pages |

## Datos por plaza

Todo cuelga de `plazas/puebla/...` y `plazas/acapulco/...`: config (esquemas), sabores, inventario, pedidos, clientes, historial y bitácora. Los usuarios y el logo son comunes a la marca.

## Puesta en marcha

1. **Reglas de seguridad:** Firebase → Realtime Database → Reglas → pegar el contenido de `firebase-rules.json` → Publicar.
2. **GitHub Pages:** Settings → Pages → Deploy from a branch → `main` / `(root)` → Custom domain `autentica.ciudadpaleta.mx` → Enforce HTTPS.
3. **GoDaddy (DNS):** registro CNAME, Nombre `autentica`, Valor `starjuan7.github.io`.
4. **Firebase Authentication → Settings → Authorized domains:** agregar `autentica.ciudadpaleta.mx`.
5. Entrar con un administrador y, en **Configuración**, subir el logo y revisar los esquemas de cada plaza (por defecto 50–99, 100–249 y 250+).

## Usuarios nuevos

Crear la cuenta en Firebase → Authentication → Users, copiar el UID y registrarla en la pestaña **Usuarios** (rol, plaza asignada y permisos).
