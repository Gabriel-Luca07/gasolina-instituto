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

## Actualizaciones automáticas (también con la app en la pantalla de inicio)

Tras subir una versión no hace falta quitar la app de la pantalla de inicio ni hacer nada: al abrirla con conexión se actualiza sola.

- `sw.js` pide siempre la versión más reciente a la red (nunca sirve primero lo guardado) y deja una copia para el modo sin conexión. La versión nueva se activa sola y la página se recarga, esperando a que no haya un formulario abierto para no perder lo que se escribe.
- Cada vez que se abre o se vuelve a la app, esta compara su versión con la publicada. Si el móvil no se ha enterado de la nueva, lo empuja y, si hace falta, reinstala la app **sin tocar los datos** (viven en `localStorage`).
- En **Configuración → Actualizaciones** hay «Buscar actualización» y «Reinstalar la app» por si alguna vez hiciera falta forzarlo a mano.
- Sigue valiendo la regla de siempre: cada commit que cambie archivos de la app debe subir `CACHE_VERSION` en `sw.js` (lo hace el hook de abajo).

## Funcionamiento offline

El archivo `sw.js` (service worker) guarda una copia de todos los archivos de la app cada vez que se abre con conexión. Sin conexión, la app funciona con esa copia. Solo necesitas conexión la primera vez para instalarla y para recibir cada versión nueva.

Para que los móviles detecten una versión nueva hay que subir `CACHE_VERSION` en `sw.js`. El hook `.githooks/pre-commit` lo hace solo en cada commit que cambie archivos de la app (si no lo has subido ya a mano). Actívalo una vez en cada clon del repositorio:

```bash
git config core.hooksPath .githooks
```

## Pruebas

`tests.html` prueba el cálculo (`js/calc.js`): costes, reparto, pesos, deudas, pagos, consumo real, recordatorios e importación. Ábrelo en el navegador desde un servidor local (por ejemplo `python -m http.server` o la extensión Live Server de VS Code) y ejecútalo después de tocar cualquier cálculo: arriba sale en verde o en rojo, con el detalle de lo que falla.

`tests-ui.html` prueba la interfaz: carga la app real en un marco con `?uitest` (usa otra clave de almacenamiento, así que no toca tus datos) y la maneja como un usuario: cambiar de pestaña, compartir como imagen o texto, modo simplificado, cerrar periodo y deshacer, pagos parciales, exportar copia y CSV, sin emojis y con nombres accesibles en los botones de icono. Se abre igual, desde un servidor local.

## Registrar trayectos rápido

- **Una sola pantalla:** al añadir un trayecto salen juntos el coche, los km y quién iba, con lo del último trayecto ya marcado. «Más opciones» abre el asistente por pasos para la vuelta con otras personas o el reparto en partes distintas; editar un trayecto también usa el asistente.
- **Atajos de km:** bajo el campo salen los km más usados con ese coche, y botones +1, +5 y +10.
- **Lo de siempre:** en cada día aparecen hasta 3 trayectos sugeridos (los más repetidos, con más peso los de ese día de la semana). Un toque lo apunta, y se puede deshacer. Se aprenden solos de lo que apuntas, duplicas o copias, y se conservan al cerrar un periodo.
- **Aviso de duplicado:** si ya hay un trayecto igual ese día (mismo coche, km y personas) avisa y pide pulsar otra vez para añadirlo igualmente.

## Copia de seguridad de los datos

Desde **Configuración → Datos** puedes exportar todos tus datos a un archivo `.json` y volver a importarlos en otro dispositivo o después de borrar el navegador. En el móvil se abre la bandeja de compartir para guardarlo en Archivos, iCloud o mandarlo por WhatsApp; en el ordenador se descarga. Al **cerrar un periodo** se ofrece guardar una copia en el mismo paso (viene marcada si hoy aún no hiciste ninguna), y el cierre se puede deshacer durante unos segundos. No hay ningún servidor: si borras los datos del navegador sin haber exportado antes, se pierden.

El **Historial** se puede exportar a CSV (una fila por persona y periodo, con `;` y decimales con coma) para abrirlo directamente en Excel u Hojas de cálculo.

## Estructura del proyecto

```
index.html          Estructura de la app (4 pantallas: Registro, Resumen, Configuración, Historial)
css/styles.css       Estilos, mobile-first, modo claro/oscuro (automático o manual)
js/icons.js          Iconos SVG de trazo fino (en el DOM y en la imagen compartida)
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
tests-ui.html        Pruebas de la interfaz (tests/ui.test.js)
manifest.json        Manifest de la PWA
sw.js                Service worker (caché offline)
icons/               Iconos de la app en varios tamaños
.githooks/           Hook que sube CACHE_VERSION en cada commit
```

Los scripts de `js/` son scripts clásicos que comparten el ámbito global y se cargan en orden en `index.html` (sin módulos ni compilación). Si añades uno, añádelo también a `APP_SHELL` en `sw.js`.
