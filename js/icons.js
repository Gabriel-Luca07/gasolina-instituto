'use strict';

/* Iconos de la app: SVG de trazo fino (24×24) que heredan el color del texto.
   Cada icono es un único trazado, así sirve igual para el DOM (icon()) y para
   dibujar en el canvas de la imagen compartida (drawIcon()). */

const ICONS = {
  fuel: 'M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16 M3 21h12 M7 8h4 M14 10h2a2 2 0 0 1 2 2v3a1.5 1.5 0 0 0 3 0V8l-3-3',
  lock: 'M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z M8 11V7a4 4 0 0 1 8 0v4',
  contrast: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 3v18',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z',
  x: 'M18 6 6 18 M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  'check-circle': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M8 12.5l3 3 5-6',
  share: 'M12 15V3 M8 7l4-4 4 4 M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7',
  download: 'M12 3v12 M8 11l4 4 4-4 M5 21h14',
  upload: 'M12 15V3 M8 7l4-4 4 4 M5 21h14',
  trash: 'M3 6h18 M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2 M6 6l1 14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-14 M10 11v6 M14 11v6',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4z M13.5 6.5l4 4',
  car: 'M5 16H3v-4l2-5.5A2 2 0 0 1 6.9 5h10.2a2 2 0 0 1 1.9 1.5L21 12v4h-2 M3 12h18 M7 14.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M17 14.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M9 16.5h6',
  calendar: 'M5 4h14a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M4 10h16 M8 2v4 M16 2v4',
  euro: 'M18 7a7 7 0 1 0 0 10 M4 10h10 M4 14h10',
  sliders: 'M10 5H3 M12 19H3 M14 3v4 M16 17v4 M21 12h-9 M21 19h-5 M21 5h-7 M8 10v4 M8 12H3',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5 M12 7v5l3 2',
  copy: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  'check-square': 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M8.5 12l2.5 2.5 4.5-5',
  message: 'M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.3A8 8 0 1 1 21 12z',
  repeat: 'M17 2l4 4-4 4 M3 11v-1a4 4 0 0 1 4-4h14 M7 22l-4-4 4-4 M21 13v1a4 4 0 0 1-4 4H3',
  scale: 'M12 3v18 M7 21h10 M5 7h14 M5 7l-3 7a3 3 0 0 0 6 0L5 7z M19 7l-3 7a3 3 0 0 0 6 0l-3-7z',
  hourglass: 'M6 2h12 M6 22h12 M7 2v4a5 5 0 0 0 2 4l3 2-3 2a5 5 0 0 0-2 4v4 M17 2v4a5 5 0 0 1-2 4l-3 2 3 2a5 5 0 0 1 2 4v4',
  image: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M9 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z M20 16l-5-5L6 20',
  'file-text': 'M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M14 3v5h5 M9 13h6 M9 17h6',
  'chevron-up': 'M6 15l6-6 6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  table: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M3 10h18 M3 15h18 M9 5v14',
  arrow: 'M5 12h14 M13 6l6 6-6 6'
};

// Trazo común: se ajusta desde CSS (.icon) si hace falta.
function icon(name, extraClass) {
  const d = ICONS[name];
  if (!d) return '';
  return `<svg class="icon${extraClass ? ' ' + extraClass : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
}

// Sustituye cada <i data-icon="nombre"></i> del HTML por su SVG.
function hydrateIcons(root) {
  (root || document).querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
    el.removeAttribute('data-icon');
  });
}

// Dibuja un icono en un canvas (para la imagen que se comparte).
function drawIcon(ctx, name, x, y, size, color, lineWidth) {
  const d = ICONS[name];
  if (!d) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color || '#fff';
  ctx.lineWidth = lineWidth || 1.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(d));
  ctx.restore();
}

hydrateIcons(document);
