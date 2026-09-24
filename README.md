# Gasolina Instituto

App web (PWA) para calcular cuánto paga cada persona de gasolina al compartir coche para ir al instituto. Escrita en HTML, CSS y JavaScript puro, sin frameworks ni backend. Todos los datos se guardan **solo en el dispositivo** (localStorage).

## Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub (puede ser público o privado) y sube todo el contenido de esta carpeta a la rama `main`:
   ```bash
   git init
   git add .
   git commit -m "Primera versión de Gasolina Instituto"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
   git push -u origin main
   ```
2. En GitHub, ve a **Settings → Pages**.
3. En "Build and deployment", selecciona **Deploy from a branch**, rama `main` y carpeta `/ (root)`.
4. Guarda. En un par de minutos la app estará disponible en `https://TU_USUARIO.github.io/TU_REPO/`.

No hace falta ningún paso de compilación: son archivos estáticos.

## Instalar en iPhone (Añadir a pantalla de inicio)

1. Abre la URL de la app en **Safari** (tiene que ser Safari, no Chrome, para poder instalarla en iOS).
2. Toca el icono de **Compartir** (el cuadrado con la flecha hacia arriba).
3. Elige **"Añadir a pantalla de inicio"**.
4. Listo: se abrirá como una app normal, a pantalla completa y funcionando sin conexión.

## Funcionamiento offline

El archivo `sw.js` (service worker) cachea todos los archivos de la app la primera vez que se visita con conexión. A partir de ahí, la app funciona sin internet. Solo necesitas conexión la primera vez para instalarla y cada vez que subas una nueva versión.

Si cambias los archivos y quieres forzar que los usuarios reciban la actualización, sube el número de `CACHE_VERSION` en `sw.js`.

## Copia de seguridad de los datos

Desde **Configuración → Datos** puedes exportar todos tus datos a un archivo `.json` y volver a importarlos en otro dispositivo o después de borrar el navegador. No hay ningún servidor: si borras los datos del navegador sin haber exportado antes, se pierden.

## Estructura del proyecto

```
index.html          Estructura de la app (4 pantallas: Registro, Resumen, Configuración, Historial)
css/styles.css       Estilos, mobile-first, modo oscuro automático
js/app.js            Toda la lógica: datos, cálculo de costes y deudas, render
manifest.json        Manifest de la PWA
sw.js                Service worker (caché offline)
icons/               Iconos de la app en varios tamaños
```
