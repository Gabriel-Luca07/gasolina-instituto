'use strict';

/* Estado de la app: se carga de localStorage y se guarda con saveState(). */

/* ------------------------------- Estado -------------------------------- */

function createDefaultState() {
  return {
    version: 1,
    people: [],
    cars: [],
    globalPrice: 1.65,
    savedTrips: [],
    driverPays: true,
    period: { id: uid(), createdAt: todayISO(), days: [] },
    history: [],
    lastTrip: null,
    theme: 'auto',
    pin: null,
    refuels: [],
    lastBackupAt: null,
    // Desde cuándo contar para recordar la copia de seguridad (se mueve al
    // exportar o al posponer el aviso).
    backupReminderFrom: todayISO(),
    // Días que puede estar abierto un periodo antes de sugerir cerrarlo (0 = nunca).
    closeReminderDays: 30,
    closeReminderSnoozedUntil: null
  };
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.people)) return createDefaultState();
    if (!parsed.period) parsed.period = { id: uid(), createdAt: todayISO(), days: [] };
    if (!Array.isArray(parsed.history)) parsed.history = [];
    if (!Array.isArray(parsed.savedTrips)) parsed.savedTrips = [];
    if (!Array.isArray(parsed.cars)) parsed.cars = [];
    if (typeof parsed.globalPrice !== 'number') parsed.globalPrice = 1.65;
    if (typeof parsed.driverPays !== 'boolean') parsed.driverPays = true;
    if (!['auto', 'light', 'dark'].includes(parsed.theme)) parsed.theme = 'auto';
    if (!(/^\d{4}$/.test(parsed.pin))) parsed.pin = null;
    if (!Array.isArray(parsed.refuels)) parsed.refuels = [];
    if (typeof parsed.lastBackupAt !== 'string') parsed.lastBackupAt = null;
    if (typeof parsed.backupReminderFrom !== 'string') parsed.backupReminderFrom = parsed.lastBackupAt || todayISO();
    if (![0, 7, 14, 30].includes(parsed.closeReminderDays)) parsed.closeReminderDays = 30;
    if (typeof parsed.closeReminderSnoozedUntil !== 'string') parsed.closeReminderSnoozedUntil = null;
    return parsed;
  } catch (e) {
    console.error('Estado corrupto, se reinicia', e);
    return createDefaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

