# Gastos Coche

App web (PWA) para calcular cuánto paga cada persona por compartir coche: gasolina, trayectos y deudas del grupo. Escrita en HTML, CSS y JavaScript puro, sin frameworks ni backend. Todos los datos se guardan **solo en el dispositivo** (localStorage).

## Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub (puede ser público o privado) y sube todo el contenido de esta carpeta a la rama `main`:
   ```bash
   git init
   git add .
   git commit -m "Primera versión de Gastos Coche"
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

Para que los usuarios reciban una versión nueva hay que subir `CACHE_VERSION` en `sw.js`. El hook `.githooks/pre-commit` lo hace solo en cada commit que cambie archivos de la app (si no lo has subido ya a mano). Actívalo una vez en cada clon del repositorio:

```bash
git config core.hooksPath .githooks
```

## Pruebas

`tests.html` prueba el cálculo (`js/calc.js`): costes, reparto, pesos, deudas, pagos, consumo real, recordatorios e importación. Ábrelo en el navegador desde un servidor local (por ejemplo `python -m http.server` o la extensión Live Server de VS Code) y ejecútalo después de tocar cualquier cálculo: arriba sale en verde o en rojo, con el detalle de lo que falla.

## Copia de seguridad de los datos

Desde **Configuración → Datos** puedes exportar todos tus datos a un archivo `.json` y volver a importarlos en otro dispositivo o después de borrar el navegador. No hay ningún servidor: si borras los datos del navegador sin haber exportado antes, se pierden.

## Estructura del proyecto

```
index.html          Estructura de la app (4 pantallas: Registro, Resumen, Configuración, Historial)
css/styles.css       Estilos, mobile-first, modo claro/oscuro (automático o manual)
js/utils.js          Utilidades de fechas, formato y DOM
js/state.js          Estado y guardado en localStorage
js/ui.js             Toast, modales, pestañas y gestos
js/calc.js           Cálculo puro: costes, reparto, deudas, consumo real, importación
js/registro.js       Pestaña Registro
js/resumen.js        Pestaña Resumen
js/historial.js      Pestaña Historial
js/config.js         Pestaña Configuración
js/app.js            Tema, PIN, banners, service worker y arranque
tests.html           Pruebas del cálculo (tests/calc.test.js)
manifest.json        Manifest de la PWA
sw.js                Service worker (caché offline)
icons/               Iconos de la app en varios tamaños
.githooks/           Hook que sube CACHE_VERSION en cada commit
```

Los scripts de `js/` son scripts clásicos que comparten el ámbito global y se cargan en orden en `index.html` (sin módulos ni compilación). Si añades uno, añádelo también a `APP_SHELL` en `sw.js`.
