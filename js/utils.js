'use strict';

/* =====================================================================
   Gastos Coche — lógica de la app (sin frameworks, sin backend)
   Todo se guarda en localStorage. Ver README.md para publicar en
   GitHub Pages.

   El código está repartido en varios scripts clásicos que comparten el
   ámbito global y se cargan en este orden (ver index.html):
     utils.js     utilidades de fechas, formato y DOM
     state.js     estado y guardado en localStorage
     ui.js        toast, modales, pestañas y gestos
     calc.js      cálculo puro (costes, reparto, deudas…), probado en tests.html
     registro.js / resumen.js / historial.js / config.js   una por pestaña
     app.js       tema, PIN, banners, service worker y arranque
   ===================================================================== */

// Con ?uitest (las pruebas de interfaz de tests-ui.html) la app usa otra
// clave, para no tocar nunca los datos reales.
const UI_TEST_MODE = /[?&]uitest\b/.test(location.search);
const STORAGE_KEY = UI_TEST_MODE ? 'gasolinaInstitutoState_v1_uitest' : 'gasolinaInstitutoState_v1';

/* ----------------------------- Utilidades ----------------------------- */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function todayISO() {
  return toISODate(new Date());
}

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseISODate(str) {
  return new Date(`${str}T00:00:00`);
}

function daysBetween(fromISO, toISO) {
  return Math.round((parseISODate(toISO) - parseISODate(fromISO)) / 86400000);
}

function addDaysISO(dateISO, days) {
  const d = parseISODate(dateISO);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

function formatEUR(n) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0);
}

function formatKm(n) {
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(n || 0)} km`;
}

function formatLiters(n) {
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(n || 0)} L`;
}

function formatPricePerL(n) {
  return `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(n || 0)} €/L`;
}

function formatConsumption(n) {
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(n || 0)} L/100km`;
}

function formatDateLong(dateStr) {
  const str = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(parseISODate(dateStr));
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDateShort(dateStr) {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(parseISODate(dateStr));
}

function qs(sel, root) { return (root || document).querySelector(sel); }
function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

