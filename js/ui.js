'use strict';

/* Piezas de interfaz compartidas: toast, modales, pestañas y gestos. */

/* -------------------------------- Toast -------------------------------- */

let toastTimer = null;
let toastUndoHandler = null;

function hideToast() {
  qs('#toast').classList.add('hidden');
  const btn = qs('#toastUndoBtn');
  btn.classList.add('hidden');
  if (toastUndoHandler) { btn.removeEventListener('click', toastUndoHandler); toastUndoHandler = null; }
}

function showToast(msg) {
  hideToast();
  const el = qs('#toast');
  qs('#toastMessage').textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 2600);
}

function showUndoToast(msg, onUndo, durationMs) {
  hideToast();
  const el = qs('#toast');
  const btn = qs('#toastUndoBtn');
  qs('#toastMessage').textContent = msg;
  btn.classList.remove('hidden');
  el.classList.remove('hidden');
  toastUndoHandler = () => { hideToast(); clearTimeout(toastTimer); onUndo(); };
  btn.addEventListener('click', toastUndoHandler);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, durationMs || 6000);
}

/* -------------------------------- Modal --------------------------------- */

let modalReturnFocusEl = null;

function getFocusable(container) {
  return qsa('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', container)
    .filter((el) => !el.disabled && el.getClientRects().length > 0);
}

function openModal(title, bodyHTML) {
  modalReturnFocusEl = document.activeElement;
  qs('#modalTitle').textContent = title;
  qs('#modalBody').innerHTML = bodyHTML;
  qs('#modalOverlay').classList.remove('hidden');
  // Foco al primer campo del modal para que el teclado (y lectores de
  // pantalla) entren directos en el contenido, sin tener que tabular desde
  // el botón que lo abrió.
  const focusables = getFocusable(qs('.modal-box'));
  (focusables[0] || qs('#modalClose')).focus();
}

function closeModal() {
  qs('#modalOverlay').classList.add('hidden');
  qs('#modalBody').innerHTML = '';
  if (modalReturnFocusEl && document.body.contains(modalReturnFocusEl)) modalReturnFocusEl.focus();
  modalReturnFocusEl = null;
}

qs('#modalClose').addEventListener('click', closeModal);
qs('#modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') closeModal();
});

// Atrapamos el foco dentro del modal (Tab/Shift+Tab no deben salir a la
// página de detrás) y permitimos cerrar con Escape, como se espera de
// cualquier diálogo accesible.
qs('#modalOverlay').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); return; }
  if (e.key !== 'Tab') return;
  const focusables = getFocusable(qs('.modal-box'));
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

/* --------------------------- Modal de confirmación --------------------------- */

function confirmModal({ title = 'Confirmar', message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false, onConfirm }) {
  const html = `
    <p class="confirm-message">${esc(message)}</p>
    <div class="confirm-actions">
      <button type="button" class="btn btn-secondary btn-block" id="confirmCancelBtn">${esc(cancelLabel)}</button>
      <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-block" id="confirmOkBtn">${esc(confirmLabel)}</button>
    </div>`;
  openModal(title, html);
  // El foco por defecto (heredado de openModal) cae en "Cancelar", el primer
  // botón del cuerpo: es el comportamiento más seguro para una acción que
  // puede ser destructiva.
  qs('#confirmCancelBtn').addEventListener('click', closeModal);
  qs('#confirmOkBtn').addEventListener('click', () => { closeModal(); onConfirm(); });
}

/* -------------------------------- Tabs ---------------------------------- */

const TAB_ORDER = ['registro', 'resumen', 'config', 'historial'];

// Duraciones que deben coincidir con las de las animaciones CSS
// tabExitTo*/tabEnterFrom* (con un pequeño margen). Usamos setTimeout en vez
// de esperar al evento "animationend": si el usuario toca varias pestañas muy
// rápido, un mismo panel puede acabar con clases de salida Y de entrada a la
// vez, y por especificidad CSS gana la que no toca, disparando el evento
// "equivocado" y encadenando una transición detrás de otra sin parar.
const TAB_EXIT_MS = 170;
const TAB_ENTER_MS = 250;

let tabTransitionTimer = null;

function switchTab(tab) {
  const panels = qsa('.tab-panel');
  const targetPanel = panels.find((p) => p.dataset.tabPanel === tab);
  if (!targetPanel) return;

  // Si había una transición en curso, la cortamos en seco (sin terminar de
  // animar) para partir de un estado limpio antes de empezar la siguiente.
  if (tabTransitionTimer) { clearTimeout(tabTransitionTimer); tabTransitionTimer = null; }
  panels.forEach((p) => p.classList.remove('tab-exit-left', 'tab-exit-right', 'tab-enter-left', 'tab-enter-right'));

  // El botón activo se sincroniza SIEMPRE, incluso si salimos ya mismo
  // porque el panel destino ya está activo: si no, un toque rápido a varias
  // pestañas puede cancelar una transición a medias y dejar el botón
  // resaltado en una pestaña distinta a la que realmente se ve.
  qsa('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));

  const currentPanel = panels.find((p) => p.classList.contains('active'));
  if (targetPanel === currentPanel) return;

  const fromIndex = TAB_ORDER.indexOf(currentPanel ? currentPanel.dataset.tabPanel : tab);
  const toIndex = TAB_ORDER.indexOf(tab);
  const forward = toIndex >= fromIndex;

  const showTarget = () => {
    if (tab === 'resumen') renderResumen();
    if (tab === 'historial') renderHistorial();
    targetPanel.classList.add('active', forward ? 'tab-enter-right' : 'tab-enter-left');
    tabTransitionTimer = setTimeout(() => {
      targetPanel.classList.remove('tab-enter-right', 'tab-enter-left');
      tabTransitionTimer = null;
    }, TAB_ENTER_MS);
  };

  if (currentPanel) {
    currentPanel.classList.add(forward ? 'tab-exit-left' : 'tab-exit-right');
    tabTransitionTimer = setTimeout(() => {
      currentPanel.classList.remove('active', 'tab-exit-left', 'tab-exit-right');
      showTarget();
    }, TAB_EXIT_MS);
  } else {
    showTarget();
  }
}

qs('#tabbar').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (btn) switchTab(btn.dataset.tab);
});

/* -------- Deslizar con el dedo para cambiar de pestaña -------- */
// Compartida por el gesto táctil y los atajos de teclado: mueve a la pestaña
// anterior/siguiente según TAB_ORDER, sin salirse por los extremos.
function goToAdjacentTab(direction) {
  const currentTab = qs('.tab-btn.active')?.dataset.tab;
  const idx = TAB_ORDER.indexOf(currentTab);
  if (idx === -1) return;
  const nextIdx = idx + direction;
  if (nextIdx < 0 || nextIdx >= TAB_ORDER.length) return;
  switchTab(TAB_ORDER[nextIdx]);
}

(function setupSwipeNavigation() {
  const main = qs('#mainContent');
  const SWIPE_MIN_DISTANCE = 60; // px mínimos para contar como swipe, no como un toque tembloroso
  const SWIPE_MAX_OFF_AXIS_RATIO = 0.5; // el movimiento vertical no puede superar la mitad del horizontal
  const SWIPE_MAX_TIME = 700; // ms: pasado esto, es un gesto lento (arrastrar, no deslizar) y lo ignoramos
  let startX = 0, startY = 0, startTime = 0, tracking = false;

  main.addEventListener('touchstart', (e) => {
    tracking = false;
    if (!qs('#modalOverlay').classList.contains('hidden')) return;
    if (!qs('#lockScreen').classList.contains('hidden')) return;
    // El gráfico de Historial tiene su propio scroll horizontal, y los campos
    // de texto/número necesitan poder arrastrar el cursor sin que eso cambie
    // de pestaña.
    if (e.target.closest('.chart-bars, input, select, textarea')) return;
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    startTime = Date.now();
    tracking = true;
  }, { passive: true });

  main.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    // En cuanto quede claro que el gesto es un scroll vertical (el caso más
    // común con diferencia), dejamos de vigilarlo: no hace falta esperar a
    // touchend para saber que esto no es un swipe de pestaña.
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) tracking = false;
  }, { passive: true });

  main.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    const dt = Date.now() - startTime;
    if (dt > SWIPE_MAX_TIME) return;
    if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return;
    if (Math.abs(dy) > Math.abs(dx) * SWIPE_MAX_OFF_AXIS_RATIO) return;

    if (dx < 0) goToAdjacentTab(1); // dedo hacia la izquierda -> siguiente pestaña
    else goToAdjacentTab(-1); // dedo hacia la derecha -> pestaña anterior
  }, { passive: true });
})();

/* -------- Flechas del teclado para cambiar de pestaña (escritorio) -------- */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  // No interferir con mover el cursor dentro de un campo de texto/número,
  // ni mientras hay un modal o la pantalla de bloqueo por encima.
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
  if (!qs('#modalOverlay').classList.contains('hidden')) return;
  if (!qs('#lockScreen').classList.contains('hidden')) return;
  goToAdjacentTab(e.key === 'ArrowRight' ? 1 : -1);
});

// Etiqueta junto al nombre de una persona o coche archivado, para que se
// entienda por qué sigue apareciendo en trayectos, resumen y deudas.
function archivedTagHTML(list, id) {
  const item = list.find((x) => x.id === id);
  return item && item.archived ? ' <span class="archived-tag">de baja</span>' : '';
}

