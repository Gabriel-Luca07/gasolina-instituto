'use strict';

/* Tema, bloqueo con PIN, banners, service worker y arranque de la app. */

/* =====================================================================
   Tema (claro / oscuro / automático)
   ===================================================================== */

const THEME_ICONS = { auto: 'contrast', light: 'sun', dark: 'moon' };
const THEME_LABELS = { auto: 'Automático (según el sistema)', light: 'Claro', dark: 'Oscuro' };

function applyTheme() {
  const root = document.documentElement;
  if (state.theme === 'auto') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', state.theme);
  }
  const btn = qs('#themeToggleBtn');
  btn.innerHTML = icon(THEME_ICONS[state.theme]);
  btn.setAttribute('aria-label', `Tema: ${THEME_LABELS[state.theme]}. Toca para cambiar.`);
}

function setupThemeToggle() {
  applyTheme();
  qs('#themeToggleBtn').addEventListener('click', () => {
    const order = ['auto', 'light', 'dark'];
    state.theme = order[(order.indexOf(state.theme) + 1) % order.length];
    saveState();
    applyTheme();
    showToast(`Tema: ${THEME_LABELS[state.theme]}`);
  });
}

/* =====================================================================
   Bloqueo con PIN (candado local, no es cifrado real de los datos: solo
   evita que alguien abra la app sin más en este dispositivo)
   ===================================================================== */

function renderSecurityCard() {
  const el = qs('#securityPinStatus');
  if (state.pin) {
    el.innerHTML = `
      <p class="hint" style="margin:0 0 10px;">La app pide un PIN de 4 dígitos al abrirla en este dispositivo.</p>
      <button type="button" class="btn btn-secondary btn-block" id="changePinBtn">Cambiar PIN</button>
      <button type="button" class="btn btn-danger" id="removePinBtn">Quitar PIN</button>`;
    qs('#changePinBtn').addEventListener('click', () => openSetPinModal());
    qs('#removePinBtn').addEventListener('click', () => openRemovePinModal());
  } else {
    el.innerHTML = `
      <p class="hint" style="margin:0 0 10px;">Añade un PIN de 4 dígitos para que nadie abra la app sin más. Se guarda solo en este dispositivo (no viaja en las copias de seguridad) y no es un cifrado real de los datos.</p>
      <button type="button" class="btn btn-primary" id="setPinBtn">Activar PIN</button>`;
    qs('#setPinBtn').addEventListener('click', () => openSetPinModal());
  }
}

function openSetPinModal() {
  const html = `
    <label class="field">
      <span>Elige un PIN de 4 dígitos</span>
      <input type="password" id="newPinInput1" class="input" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="••••">
    </label>
    <label class="field">
      <span>Repite el PIN</span>
      <input type="password" id="newPinInput2" class="input" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="••••">
    </label>
    <button type="button" class="btn btn-primary btn-block" id="newPinSaveBtn">${state.pin ? 'Cambiar PIN' : 'Activar PIN'}</button>
  `;
  openModal(state.pin ? 'Cambiar PIN' : 'Activar PIN', html);
  qs('#newPinSaveBtn').addEventListener('click', (e) => {
    const p1 = qs('#newPinInput1').value.trim();
    const p2 = qs('#newPinInput2').value.trim();
    if (!/^\d{4}$/.test(p1)) { showToast('El PIN debe tener 4 dígitos'); return; }
    if (p1 !== p2) { showToast('Los dos PIN no coinciden'); return; }
    e.target.disabled = true;
    state.pin = p1;
    saveState();
    closeModal();
    renderSecurityCard();
    updateLockButtonVisibility();
    showToast('PIN guardado');
  });
}

function openRemovePinModal() {
  confirmModal({
    title: 'Quitar PIN',
    message: 'La app dejará de pedir un PIN al abrirla en este dispositivo. ¿Continuar?',
    confirmLabel: 'Quitar PIN',
    danger: true,
    onConfirm: () => {
      state.pin = null;
      saveState();
      renderSecurityCard();
      updateLockButtonVisibility();
      showToast('PIN desactivado');
    }
  });
}

function updateLockButtonVisibility() {
  qs('#lockNowBtn').classList.toggle('hidden', !state.pin);
}

// Con la pantalla de bloqueo solo tapada por CSS, alguien con teclado podría
// tabular "a través" de ella hasta los botones de la app de detrás (el
// z-index no afecta el orden de tabulación). `inert` los saca del todo del
// alcance del teclado (y del resto de interacción) mientras está bloqueada.
function setAppInert(isInert) {
  [qs('#mainContent'), qs('#tabbar'), qs('.app-header')].forEach((el) => {
    if (!el) return;
    if (isInert) el.setAttribute('inert', ''); else el.removeAttribute('inert');
  });
}

function showLockScreen() {
  closeModal();
  setAppInert(true);
  const screen = qs('#lockScreen');
  const input = qs('#lockPinInput');
  qs('#lockError').classList.add('hidden');
  input.value = '';
  screen.classList.remove('hidden');
  setTimeout(() => input.focus(), 50);
}

function attemptUnlock() {
  const input = qs('#lockPinInput');
  if (input.value === state.pin) {
    qs('#lockScreen').classList.add('hidden');
    input.value = '';
    setAppInert(false);
    return;
  }
  const box = qs('.lock-box');
  qs('#lockError').classList.remove('hidden');
  box.classList.remove('shake');
  void box.offsetWidth; // reinicia la animación si ya se había disparado
  box.classList.add('shake');
  input.value = '';
  input.focus();
}

function setupLockScreen() {
  updateLockButtonVisibility();
  if (state.pin) showLockScreen();
  qs('#lockUnlockBtn').addEventListener('click', attemptUnlock);
  qs('#lockPinInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptUnlock(); });
  qs('#lockNowBtn').addEventListener('click', showLockScreen);
}

/* =====================================================================
   Banner de instalación iOS
   ===================================================================== */

function setupIosBanner() {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  const dismissed = localStorage.getItem('iosBannerDismissed') === '1';

  if (isIos && !isStandalone && !dismissed) {
    qs('#iosInstallBanner').classList.remove('hidden');
  }
  qs('#iosInstallDismiss').addEventListener('click', () => {
    qs('#iosInstallBanner').classList.add('hidden');
    localStorage.setItem('iosBannerDismissed', '1');
  });
}

/* =====================================================================
   Service worker
   ===================================================================== */

// La versión nueva se activa sola (ver sw.js). Aquí solo se recarga la página
// para usarla, y solo cuando no hay nada a medias: con un formulario abierto
// se espera, para no perder lo que se está escribiendo.
function reloadWhenIdle() {
  if (!qs('#modalOverlay').classList.contains('hidden')) {
    setTimeout(reloadWhenIdle, 2500);
    return;
  }
  showToast('Actualizando a la versión nueva…');
  setTimeout(() => window.location.reload(), 600);
}

// Versión del service worker que controla esta página (null si no hay o no contesta).
function currentSwVersion() {
  return new Promise((resolve) => {
    const controller = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (!controller) { resolve(null); return; }
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => resolve((e.data && e.data.version) || null);
    controller.postMessage('GET_VERSION', [channel.port2]);
    setTimeout(() => resolve(null), 1500);
  });
}

// Quita el service worker y las copias guardadas y recarga desde la red.
// NO toca los datos (viven en localStorage): es el equivalente a quitar la app
// de la pantalla de inicio y volver a añadirla, pero sin perder nada.
async function forceRefreshApp() {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  } catch (e) { /* sigue */ }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch (e) { /* sigue */ }
  // El navegador guarda además sus propias copias (GitHub Pages, 10 minutos):
  // se piden de nuevo saltándolas, o la recarga volvería a usar las viejas.
  const urls = ['index.html', ...qsa('script[src], link[rel="stylesheet"]').map((el) => el.getAttribute('src') || el.getAttribute('href'))];
  await Promise.all(urls.map((u) => fetch(u, { cache: 'reload' }).catch(() => {})));
  window.location.reload();
}

// Compara la versión que corre con la que hay publicada y, si el móvil no se
// ha enterado de la nueva, lo empuja: primero pidiendo el service worker nuevo
// y, si tras unos segundos sigue igual, reinstalando la app (sin perder datos).
// Devuelve 'current' | 'updating' | 'offline' | 'unsupported'.
const FORCE_REFRESH_MIN_GAP_MS = 10 * 60 * 1000;

async function checkForUpdate({ manual = false } = {}) {
  if (!('serviceWorker' in navigator) || UI_TEST_MODE) return 'unsupported';

  let remote = null;
  try {
    const text = await (await fetch('sw.js', { cache: 'no-store' })).text();
    remote = (text.match(/CACHE_VERSION\s*=\s*'([^']+)'/) || [])[1] || null;
  } catch (e) {
    return 'offline';
  }
  if (!remote) return 'offline';

  if ((await currentSwVersion()) === remote) return 'current';

  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) { try { await reg.update(); } catch (e) { /* sigue */ } }
  // Si el service worker nuevo se activa, controllerchange recarga la página y
  // esto no llega a ejecutarse. Si seguimos aquí, el móvil no se ha enterado.
  await new Promise((r) => setTimeout(r, 6000));

  const last = Number(localStorage.getItem('lastForcedRefresh') || 0);
  if (manual || Date.now() - last > FORCE_REFRESH_MIN_GAP_MS) {
    localStorage.setItem('lastForcedRefresh', String(Date.now()));
    await forceRefreshApp();
  }
  return 'updating';
}

async function renderVersionInfo() {
  const el = qs('#appVersionInfo');
  if (!el) return;
  const version = await currentSwVersion();
  el.textContent = version ? `Versión instalada: ${version}.` : 'Versión instalada: sin determinar (se mostrará cuando la app se haya actualizado).';
}

qs('#checkUpdateBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  showToast('Buscando actualización…');
  const result = await checkForUpdate({ manual: true });
  btn.disabled = false;
  if (result === 'current') showToast('Ya tienes la última versión');
  else if (result === 'offline') showToast('Sin conexión: no se puede comprobar');
  else if (result === 'unsupported') showToast('Este navegador no permite actualizar así');
});

qs('#reinstallAppBtn').addEventListener('click', () => {
  confirmModal({
    title: 'Reinstalar la app',
    message: 'Se descargará la app de nuevo y se recargará. Tus datos (personas, coches, trayectos, historial) no se tocan.',
    confirmLabel: 'Reinstalar',
    onConfirm: () => forceRefreshApp()
  });
});

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || UI_TEST_MODE) return;

  // En la primera instalación no había service worker previo: ahí no hay
  // nada que recargar. Solo se recarga cuando uno nuevo sustituye a otro.
  const hadController = !!navigator.serviceWorker.controller;

  window.addEventListener('load', async () => {
    try {
      // updateViaCache: 'none' impide que el navegador reutilice una copia
      // vieja del propio sw.js al buscar actualizaciones.
      const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });

      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || reloaded) return;
        reloaded = true;
        reloadWhenIdle();
      });

      // Instalada como app, puede pasar días abierta en segundo plano sin
      // recargarse: al volver a ella se busca versión nueva (como mucho una vez por minuto).
      let lastCheck = 0;
      const checkSoon = () => {
        if (Date.now() - lastCheck < 60000) return;
        lastCheck = Date.now();
        reg.update().catch(() => {});
        checkForUpdate().catch(() => {});
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkSoon();
      });
      setTimeout(checkSoon, 2500);
      setTimeout(renderVersionInfo, 1200);
    } catch (err) {
      console.warn('SW no registrado', err);
    }
  });
}

/* =====================================================================
   Arranque
   ===================================================================== */

function renderAll() {
  renderRoster();
  renderSavedTrips();
  renderConfigMisc();
  renderBackupInfo();
  updatePeriodBadge();
}

setupThemeToggle();
freezeUnratedTrips();
if (!Array.isArray(state.tripHabits)) { state.tripHabits = habitsFromPeriod(state.period); saveState(); }
renderAll();
setupIosBanner();
setupLockScreen();
registerServiceWorker();
