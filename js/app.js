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

function showUpdateBanner(worker) {
  const banner = qs('#updateBanner');
  banner.classList.remove('hidden');
  qs('#updateReloadBtn').addEventListener('click', () => worker.postMessage('SKIP_WAITING'), { once: true });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || UI_TEST_MODE) return;

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');

      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(newWorker);
          }
        });
      });

      // Instalada como app, puede pasar días abierta en segundo plano sin
      // recargarse: al volver a ella se comprueba si hay versión nueva.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });

      let reloadedForUpdate = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloadedForUpdate) return;
        reloadedForUpdate = true;
        window.location.reload();
      });
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
renderAll();
setupIosBanner();
setupLockScreen();
registerServiceWorker();
