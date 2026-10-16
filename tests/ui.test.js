'use strict';

/* Pruebas de interfaz: cargan la app real (index.html?uitest) en un iframe,
   con datos inventados y sin tocar los guardados, y la manejan como un
   usuario: pulsar botones, mirar el DOM. Se abren con tests-ui.html. */

const UI_KEY = 'gasolinaInstitutoState_v1_uitest';
const frame = document.getElementById('appFrame');
const results = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function assert(cond, msg) { if (!cond) throw new Error(msg || 'la condición no se cumple'); }
function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg ? msg + ': ' : ''}esperaba ${b}, salió ${a}`);
}

function localISO(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Ana y Luis conducen un coche cada uno; Luis va con Ana y Marta con Luis:
// Luis le debe 4,5 a Ana y Marta le debe 4,5 a Luis.
function seedState(extra) {
  const today = localISO(new Date());
  const trip = (id, carId, passengerIds) => ({ id, carId, km: 100, passengerIds, roundTrip: false, consumption: 6, pricePerL: 1.5 });
  return Object.assign({
    version: 1,
    people: [{ id: 'ana', name: 'Ana' }, { id: 'luis', name: 'Luis' }, { id: 'marta', name: 'Marta' }],
    cars: [
      { id: 'c1', name: 'Coche de Ana', driverId: 'ana', consumption: 6, useOwnPrice: false, ownPrice: null },
      { id: 'c2', name: 'Coche de Luis', driverId: 'luis', consumption: 6, useOwnPrice: false, ownPrice: null }
    ],
    globalPrice: 1.5,
    savedTrips: [],
    driverPays: true,
    settleMode: 'pairwise',
    period: { id: 'p1', createdAt: today, days: [{ id: 'd1', date: today, trips: [trip('t1', 'c1', ['luis']), trip('t2', 'c2', ['marta'])] }], settlements: [] },
    history: [],
    theme: 'light',
    refuels: [],
    lastBackupAt: today,
    backupReminderFrom: today,
    closeReminderDays: 0
  }, extra || {});
}

// Carga la app desde cero con ese estado y devuelve utilidades para manejarla.
async function openApp(extra) {
  localStorage.setItem(UI_KEY, JSON.stringify(seedState(extra)));
  await new Promise((resolve) => {
    frame.onload = resolve;
    frame.src = 'index.html?uitest&t=' + Date.now();
  });
  await sleep(150);
  const win = frame.contentWindow;
  const doc = frame.contentDocument;

  // Nada de abrir bandejas del sistema ni descargar archivos en las pruebas:
  // se anota lo que se intentaría compartir.
  const shared = { files: [], texts: [] };
  win.tryShareFile = async (file) => { shared.files.push(file); return true; };
  win.tryShareText = async (text) => { shared.texts.push(text); return true; };

  const q = (sel) => doc.querySelector(sel);
  const click = async (sel) => {
    const el = typeof sel === 'string' ? q(sel) : sel;
    assert(el, `no existe ${sel}`);
    el.click();
    // Cambiar de pestaña anima la salida y la entrada: se espera a que termine.
    await sleep(String(sel).includes('.tab-btn') ? 550 : 80);
  };
  return { win, doc, q, click, shared };
}

function test(name, fn) { results.push({ name, fn }); }

/* ------------------------------ Pruebas ------------------------------- */

test('la app arranca y se ve el Registro', async () => {
  const { q } = await openApp();
  assert(q('#tab-registro.active'), 'el panel Registro no está activo');
  assert(q('.tab-btn.active[data-tab="registro"]'), 'la pestaña Registro no está marcada');
});

test('al cambiar de pestaña se marca la activa y cada pestaña tiene icono', async () => {
  const { doc, q, click } = await openApp();
  await click('.tab-btn[data-tab="resumen"]');
  assert(q('.tab-btn.active[data-tab="resumen"]'), 'Resumen no queda activa');
  assertEq(doc.querySelectorAll('.tab-btn .tab-icon svg.icon').length, 4, 'iconos SVG en las pestañas');
});

test('ningún texto de la interfaz lleva emojis', async () => {
  const { doc, click } = await openApp();
  for (const tab of ['resumen', 'config', 'historial', 'registro']) await click(`.tab-btn[data-tab="${tab}"]`);
  const clone = doc.body.cloneNode(true);
  clone.querySelectorAll('script, style').forEach((n) => n.remove());
  const found = clone.textContent.match(/\p{Extended_Pictographic}/gu);
  assert(!found, `emojis encontrados: ${found}`);
});

test('todos los botones sin texto tienen nombre accesible', async () => {
  const { doc, click } = await openApp();
  for (const tab of ['resumen', 'config', 'historial', 'registro']) await click(`.tab-btn[data-tab="${tab}"]`);
  const nameless = [...doc.querySelectorAll('button')].filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label'));
  assertEq(nameless.map((b) => b.id || b.dataset.action || b.className), [], 'botones sin nombre');
});

test('modo simplificado: de dos pagos pasa a uno solo en Resumen', async () => {
  const { doc, q, click } = await openApp();
  await click('.tab-btn[data-tab="resumen"]');
  assertEq(doc.querySelectorAll('#summaryContent .debt-item').length, 2, 'filas en persona a persona');
  const select = q('#settleModeSelect');
  select.value = 'simplified';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(60);
  const rows = [...doc.querySelectorAll('#summaryContent .debt-item')];
  assertEq(rows.length, 1, 'filas en simplificado');
  assert(/Marta/.test(rows[0].textContent) && /Ana/.test(rows[0].textContent), 'debería ser Marta → Ana');
});

test('compartir ofrece imagen y texto', async () => {
  const { q, click } = await openApp();
  await click('.tab-btn[data-tab="resumen"]');
  await click('#shareSummaryBtn');
  assert(q('#shareAsImageBtn') && q('#shareAsTextBtn'), 'faltan las dos opciones');
});

test('compartir como texto envía la tabla de deudas y el detalle', async () => {
  const { q, click, shared } = await openApp();
  await click('.tab-btn[data-tab="resumen"]');
  await click('#shareSummaryBtn');
  await click('#shareAsTextBtn');
  assertEq(shared.texts.length, 1, 'veces que se comparte texto');
  const text = shared.texts[0];
  assert(text.includes('Quién paga a quién') && text.includes('Paga'), 'falta la tabla de deudas');
  assert(text.includes('Detalle de trayectos'), 'falta el detalle');
  assert(!/\p{Extended_Pictographic}/u.test(text), 'el texto lleva emojis');
  assert(q('#modalOverlay').classList.contains('hidden'), 'el selector debería cerrarse');
});

test('compartir como imagen envía un PNG', async () => {
  const { click, shared } = await openApp();
  await click('.tab-btn[data-tab="resumen"]');
  await click('#shareSummaryBtn');
  await click('#shareAsImageBtn');
  await sleep(600);
  assertEq(shared.files.length, 1, 'archivos compartidos');
  assertEq(shared.files[0].type, 'image/png');
  assert(shared.files[0].size > 5000, 'la imagen parece vacía');
});

test('un pago parcial muestra cuánto queda pendiente', async () => {
  const { doc, q, click } = await openApp();
  await click('.tab-btn[data-tab="resumen"]');
  await click('[data-action="settle-debt"]');
  const input = q('#settleAmountInput');
  assert(input, 'no se abrió el diálogo de pago');
  assert(/saldada/.test(q('#settleRemaining').textContent), 'con el importe entero debería quedar saldada');
  input.value = '1.00';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  assert(/parcial/i.test(q('#settleRemaining').textContent), 'debería avisar del pago parcial');
  await click('#settleSaveBtn');
  assertEq(doc.defaultView.eval('state').period.settlements.length, 1, 'pagos registrados');
});

test('cerrar periodo guarda en el Historial y se puede deshacer', async () => {
  const { win, q, click, shared } = await openApp({ lastBackupAt: null });
  await click('.tab-btn[data-tab="resumen"]');
  await click('#closePeriodBtn');
  assert(q('#closeBackupToggle').checked, 'la copia debería venir marcada si no hay copia de hoy');
  await click('#closeOkBtn');
  await sleep(200);
  assertEq(win.eval('state').history.length, 1, 'periodos en el historial');
  assertEq(win.eval('state').period.days.length, 0, 'el periodo nuevo debería estar vacío');
  assertEq(shared.files.length, 1, 'copias de seguridad compartidas');
  assert(/^gasolina-backup-.*\.json$/.test(shared.files[0].name), 'nombre de la copia');
  await click('#toastUndoBtn');
  assertEq(win.eval('state').history.length, 0, 'historial tras deshacer');
  assertEq(win.eval('state').period.days.length, 1, 'días del periodo tras deshacer');
  assertEq(win.eval('state').people.length, 3, 'personas tras deshacer');
});

test('cerrar periodo sin copia no comparte ningún archivo', async () => {
  const { click, q, shared } = await openApp();
  await click('.tab-btn[data-tab="resumen"]');
  await click('#closePeriodBtn');
  assert(!q('#closeBackupToggle').checked, 'con copia de hoy no debería venir marcada');
  await click('#closeOkBtn');
  await sleep(100);
  assertEq(shared.files.length, 0);
});

test('Exportar JSON comparte el archivo en vez de descargarlo', async () => {
  const { click, shared } = await openApp();
  await click('.tab-btn[data-tab="config"]');
  await click('#exportDataBtn');
  await sleep(100);
  assertEq(shared.files.length, 1);
  assert(/\.json$/.test(shared.files[0].name), 'debería ser un .json');
});

test('el historial se exporta a CSV', async () => {
  const entry = { id: 'h1', range: '1 sep', startDate: '2026-09-01', endDate: '2026-09-01', closedAt: '2026-09-02', summary: { totalCost: 9, tripCount: 1, totalKm: 100, perCar: [], perPerson: [{ personId: 'ana', name: 'Ana', share: 9 }] } };
  const { q, click, shared } = await openApp({ history: [entry] });
  await click('.tab-btn[data-tab="historial"]');
  assert(!q('#exportHistoryCsvBtn').classList.contains('hidden'), 'el botón CSV debería verse');
  await click('#exportHistoryCsvBtn');
  await sleep(100);
  assertEq(shared.files.length, 1);
  assert(/\.csv$/.test(shared.files[0].name), 'debería ser un .csv');
  const text = await shared.files[0].text();
  assert(text.includes('Ana;9,00'), `contenido inesperado: ${text}`);
});

test('el botón CSV no aparece sin historial', async () => {
  const { q } = await openApp();
  assert(q('#exportHistoryCsvBtn').classList.contains('hidden'));
});

/* ------------------------------ Resultado ----------------------------- */

(async function run() {
  for (const t of results) {
    try { await t.fn(); t.ok = true; } catch (e) { t.ok = false; t.error = e.message; }
  }
  localStorage.removeItem(UI_KEY);
  frame.src = 'about:blank';
  const failed = results.filter((r) => !r.ok);
  const summary = document.getElementById('summary');
  summary.className = failed.length ? 'fail' : 'ok';
  summary.textContent = failed.length
    ? `✗ ${failed.length} de ${results.length} pruebas fallan`
    : `✓ ${results.length} pruebas de interfaz correctas`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  document.getElementById('results').innerHTML = results.map((r) => `
    <li class="${r.ok ? 'ok' : 'fail'}">${r.ok ? '✓' : '✗'} ${esc(r.name)}${r.ok ? '' : `<pre>${esc(r.error)}</pre>`}</li>`).join('');
  window.testResults = { total: results.length, failed: failed.map((r) => `${r.name}: ${r.error}`) };
})();
