'use strict';

/* Pestaña Resumen: totales, deudas, pagos registrados y compartir. */

/* =====================================================================
   RENDER: RESUMEN
   ===================================================================== */

function renderSummaryBlocksHTML(summary, opts) {
  const interactive = !!(opts && opts.interactive);
  const personBars = !!(opts && opts.personBars);

  if (summary.tripCount === 0) {
    return `<p class="empty-state">Este periodo todavía no tiene trayectos registrados.</p>`;
  }

  // La etiqueta "de baja" solo en el periodo actual: en el Historial los
  // periodos cerrados son una foto fija y no dependen de quién siga activo.
  const personTag = (id) => (interactive ? archivedTagHTML(state.people, id) : '');
  const carTag = (id) => (interactive ? archivedTagHTML(state.cars, id) : '');

  const carsHTML = summary.perCar.map((c) => `
    <div class="summary-item">
      <div>
        <div class="summary-item-name">🚗 ${esc(c.name)}${carTag(c.carId)}</div>
        <div class="summary-item-sub">Conduce ${esc(c.driverName)} · ${esc(formatKm(c.totalKm))} · ${c.tripCount} trayecto(s)</div>
      </div>
      <div class="summary-item-value">${esc(formatEUR(c.totalCost))}</div>
    </div>`).join('');

  // En el acumulado de Historial mostramos además una barra de progreso bajo
  // cada persona, para ver de un vistazo quién ha gastado más a lo largo del
  // tiempo (no solo el número).
  const maxShare = Math.max(...summary.perPerson.map((p) => p.share), 0.01);
  const peopleHTML = summary.perPerson.map((p) => `
    <div class="summary-item ${personBars ? 'summary-item-bar' : ''}">
      <div class="summary-item-row">
        <div class="summary-item-name">${esc(p.name)}${personTag(p.personId)}</div>
        <div class="summary-item-value">${esc(formatEUR(p.share))}</div>
      </div>
      ${personBars ? `<div class="person-bar-track"><div class="person-bar-fill" style="width:${Math.max(4, Math.round(p.share / maxShare * 100))}%;"></div></div>` : ''}
    </div>`).join('');

  // El botón para marcar una deuda como pagada solo tiene sentido en el
  // periodo actual (con ids de personas vivos): en Historial las deudas son
  // una foto fija de periodos ya cerrados.
  const debtRowHTML = (d) => `
    <div class="debt-item">
      <span>${esc(d.from)}${personTag(d.fromId)}</span>
      <span class="debt-arrow">→</span>
      <span>${esc(d.to)}${personTag(d.toId)}</span>
      <span class="debt-amount">${esc(formatEUR(d.amount))}</span>
      ${interactive ? `<button type="button" class="icon-btn settle-btn" data-action="remind-debt" data-from-name="${esc(d.from)}" data-to-name="${esc(d.to)}" data-amount="${d.amount}" title="Recordar la deuda (WhatsApp…)">💬</button>` : ''}
      ${interactive ? `<button type="button" class="icon-btn settle-btn" data-action="settle-debt" data-from-id="${esc(d.fromId)}" data-to-id="${esc(d.toId)}" data-from-name="${esc(d.from)}" data-to-name="${esc(d.to)}" data-amount="${d.amount}" title="Marcar como pagada">✓</button>` : ''}
    </div>`;

  const pairwiseHTML = (summary.pairwiseDebts || []).length
    ? summary.pairwiseDebts.map(debtRowHTML).join('')
    : `<p class="empty-state">Nadie debe nada a nadie 🎉</p>`;

  return `
    <div class="card">
      <h2>Gasto por coche</h2>
      <div class="summary-list">${carsHTML}</div>
    </div>
    <div class="card">
      <h2>Consumo por persona</h2>
      <div class="summary-list">${peopleHTML}</div>
    </div>
    <div class="card">
      <h2>Deudas</h2>
      <p class="hint" style="margin:0 0 10px;">Quién le debe a quién, persona a persona.${interactive ? ' Toca ✓ si ya se ha pagado fuera de la app.' : ''}</p>
      <div class="summary-list">${pairwiseHTML}</div>
    </div>`;
}

function openSettleModal(fromId, toId, fromName, toName, maxAmount) {
  const html = `
    <p class="hint" style="margin:0 0 12px;">Registra que ${esc(fromName)} ya le ha pagado a ${esc(toName)} fuera de la app. Se restará de la deuda pendiente.</p>
    <label class="field">
      <span>Importe pagado (€)</span>
      <input type="number" id="settleAmountInput" class="input" inputmode="decimal" step="0.01" min="0.01" value="${maxAmount.toFixed(2)}">
    </label>
    <button type="button" class="btn btn-primary btn-block" id="settleSaveBtn">Marcar como pagada</button>
  `;
  openModal('Registrar pago', html);
  qs('#settleSaveBtn').addEventListener('click', (e) => {
    const amount = parseFloat(qs('#settleAmountInput').value);
    if (!amount || amount <= 0) { showToast('Introduce un importe válido'); return; }
    if (amount > maxAmount + 0.01) { showToast('No puede ser más que la deuda actual'); return; }
    // Solo se deshabilita una vez pasa la validación: si se deshabilitara
    // antes, un intento fallido dejaría el botón inutilizable para reintentar.
    e.target.disabled = true;
    closeModal();
    settleDebt(fromId, toId, amount);
  });
}

function settleDebt(fromId, toId, amount) {
  if (!Array.isArray(state.period.settlements)) state.period.settlements = [];
  const record = { id: uid(), fromId, toId, amount, date: todayISO() };
  state.period.settlements.push(record);
  saveState();
  renderResumen();
  renderRegistroDashboard();
  showUndoToast('Pago registrado', () => {
    state.period.settlements = state.period.settlements.filter((s) => s.id !== record.id);
    saveState();
    renderResumen();
    renderRegistroDashboard();
  });
}

// Pagos marcados con ✓ en este periodo: se pueden revisar y borrar en
// cualquier momento (no solo durante los segundos del "Deshacer").
function renderSettlementsHTML() {
  const settlements = state.period.settlements || [];
  if (settlements.length === 0) return '';
  const name = (id) => esc((state.people.find((p) => p.id === id) || {}).name || '?') + archivedTagHTML(state.people, id);
  return `
    <div class="card">
      <h2>Pagos registrados</h2>
      <p class="hint" style="margin:0 0 10px;">Ya descontados de las deudas de arriba. Bórralo si te equivocaste al marcarlo.</p>
      <div class="item-list">
        ${settlements.map((s) => `
          <div class="item-row" data-settlement-id="${s.id}">
            <div class="item-row-main">
              <div class="item-row-title">${name(s.fromId)} → ${name(s.toId)} · ${esc(formatEUR(s.amount))}</div>
              ${s.date ? `<div class="item-row-sub">Marcado el ${esc(formatDateShort(s.date))}</div>` : ''}
            </div>
            <div class="item-row-actions">
              <button type="button" class="icon-btn danger" data-action="delete-settlement" title="Borrar pago">🗑</button>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function deleteSettlement(id) {
  const list = state.period.settlements || [];
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return;
  const [removed] = list.splice(idx, 1);
  saveState();
  renderResumen();
  renderRegistroDashboard();
  showUndoToast('Pago borrado', () => {
    list.splice(idx, 0, removed);
    saveState();
    renderResumen();
    renderRegistroDashboard();
  });
}

function currentPeriodRange() {
  const days = getSortedDays(state.period);
  return days.length ? (days[0].date === days[days.length - 1].date
    ? formatDateShort(days[0].date)
    : `${formatDateShort(days[0].date)} - ${formatDateShort(days[days.length - 1].date)}`) : 'sin días';
}

function renderResumen() {
  const summary = computePeriodSummary(state.period);
  const range = currentPeriodRange();

  const hero = `
    <div class="summary-hero">
      <div class="summary-hero-label">TOTAL DEL PERIODO (${esc(range)})</div>
      <div class="summary-hero-value">${esc(formatEUR(summary.totalCost))}</div>
      <div class="summary-hero-sub">${summary.dayCount} día(s) con trayectos · ${summary.tripCount} trayecto(s)</div>
    </div>`;

  const actions = `
    <div class="summary-actions">
      <button type="button" class="btn btn-primary" id="shareSummaryBtn">📤 Compartir resumen</button>
      <button type="button" class="btn btn-secondary" id="closePeriodBtn">✅ Cerrar periodo y empezar uno nuevo</button>
    </div>`;

  qs('#summaryContent').innerHTML = hero + renderSummaryBlocksHTML(summary, { interactive: true }) + renderSettlementsHTML() + actions;

  qs('#shareSummaryBtn').addEventListener('click', () => shareSummary(summary, range));
  qs('#closePeriodBtn').addEventListener('click', () => closePeriod(summary, range));
}

// Delegado sobre el contenedor fijo (no se recrea en cada render, a
// diferencia de los botones de dentro) para no acumular listeners cada vez
// que se visita la pestaña Resumen.
qs('#summaryContent').addEventListener('click', (e) => {
  const deleteBtn = e.target.closest('[data-action="delete-settlement"]');
  if (deleteBtn) {
    deleteSettlement(deleteBtn.closest('[data-settlement-id]').dataset.settlementId);
    return;
  }
  const remindBtn = e.target.closest('[data-action="remind-debt"]');
  if (remindBtn) {
    remindDebt(remindBtn.dataset.fromName, remindBtn.dataset.toName, parseFloat(remindBtn.dataset.amount));
    return;
  }
  const btn = e.target.closest('[data-action="settle-debt"]');
  if (!btn) return;
  openSettleModal(btn.dataset.fromId, btn.dataset.toId, btn.dataset.fromName, btn.dataset.toName, parseFloat(btn.dataset.amount));
});

// Recordatorio amable de una deuda: por la bandeja de compartir del móvil
// si existe (WhatsApp, Telegram…), y si no, abriendo WhatsApp Web.
async function remindDebt(fromName, toName, amount) {
  const text = `Hola ${fromName} 👋 Según Gastos Coche, del periodo ${currentPeriodRange()} le debes ${formatEUR(amount)} a ${toName} por la gasolina. ¡Gracias!`;
  if (await tryShareText(text)) return;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

function buildShareText(summary, range) {
  const lines = [];
  lines.push(`⛽ Gastos Coche — Periodo ${range}`);
  lines.push('');
  lines.push(`Total: ${formatEUR(summary.totalCost)}`);
  if (summary.perCar.length) {
    lines.push('');
    lines.push('Por coche:');
    summary.perCar.forEach((c) => lines.push(`- ${c.name} (${c.driverName}): ${formatEUR(c.totalCost)}`));
  }
  if (summary.perPerson.length) {
    lines.push('');
    lines.push('Consumo por persona:');
    summary.perPerson.forEach((p) => lines.push(`- ${p.name}: ${formatEUR(p.share)}`));
  }
  lines.push('');
  if ((summary.pairwiseDebts || []).length) {
    lines.push('Deudas:');
    summary.pairwiseDebts.forEach((d) => lines.push(`- ${d.from} debe ${formatEUR(d.amount)} a ${d.to}`));
  } else {
    lines.push('No hay deudas pendientes.');
  }
  return lines.join('\n');
}

/* -------- Compartir el resumen como imagen (canvas, sin librerías) -------- */

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function buildShareImageBlob(summary, range) {
  const W = 900;
  const PAD = 56;
  const ROW_H = 62;
  const ROW_GAP = 12;
  const debtRows = Math.max(1, (summary.pairwiseDebts || []).length);
  const H = 430 + summary.perPerson.length * (ROW_H + ROW_GAP) + debtRows * (ROW_H + ROW_GAP) + 100;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const FONT = '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  // Mismo degradado fijo que .summary-hero en la app: independiente del
  // tema, para que la imagen se lea bien la comparta quien la comparta.
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#1e40af');
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const rowBg = () => { ctx.fillStyle = 'rgba(255,255,255,0.12)'; };
  const drawRow = (y, leftText, rightText, leftFont, rightFont) => {
    drawRoundedRect(ctx, PAD, y, W - PAD * 2, ROW_H, 14);
    rowBg();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.font = leftFont;
    ctx.fillText(leftText, PAD + 22, y + ROW_H / 2 + 7, W - PAD * 2 - 160);
    ctx.textAlign = 'right';
    ctx.font = rightFont;
    ctx.fillText(rightText, W - PAD - 22, y + ROW_H / 2 + 7);
    ctx.textAlign = 'left';
  };

  let y = PAD;
  ctx.fillStyle = '#fff';
  ctx.font = `700 32px ${FONT}`;
  ctx.fillText('⛽ Gastos Coche', PAD, y + 32);
  y += 50;
  ctx.font = `500 19px ${FONT}`;
  ctx.globalAlpha = 0.85;
  ctx.fillText(`Periodo ${range}`, PAD, y + 19);
  ctx.globalAlpha = 1;
  y += 64;

  ctx.font = `800 68px ${FONT}`;
  ctx.fillText(formatEUR(summary.totalCost), PAD, y + 68);
  y += 92;
  ctx.font = `400 17px ${FONT}`;
  ctx.globalAlpha = 0.85;
  ctx.fillText(`${summary.dayCount} día(s) · ${summary.tripCount} trayecto(s)`, PAD, y + 17);
  ctx.globalAlpha = 1;
  y += 56;

  ctx.font = `700 22px ${FONT}`;
  ctx.fillText('Consumo por persona', PAD, y + 22);
  y += 42;
  summary.perPerson.forEach((p) => {
    drawRow(y, p.name, formatEUR(p.share), `600 20px ${FONT}`, `700 20px ${FONT}`);
    y += ROW_H + ROW_GAP;
  });
  y += 18;

  ctx.font = `700 22px ${FONT}`;
  ctx.fillText('Deudas', PAD, y + 22);
  y += 42;
  if ((summary.pairwiseDebts || []).length) {
    summary.pairwiseDebts.forEach((d) => {
      drawRow(y, `${d.from} → ${d.to}`, formatEUR(d.amount), `600 18px ${FONT}`, `700 20px ${FONT}`);
      y += ROW_H + ROW_GAP;
    });
  } else {
    drawRoundedRect(ctx, PAD, y, W - PAD * 2, ROW_H, 14);
    rowBg();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `600 18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('Nadie debe nada a nadie 🎉', W / 2, y + ROW_H / 2 + 6);
    ctx.textAlign = 'left';
  }

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// Comparte un archivo con la Web Share API; devuelve true tanto si se
// compartió como si el usuario simplemente cerró la bandeja de compartir
// (en ambos casos ya "gestionamos" el intento y no hay que seguir probando
// otros métodos, o el usuario vería un doble comportamiento raro).
async function tryShareFile(file) {
  if (!file || !navigator.canShare || !navigator.canShare({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title: 'Gastos Coche' });
    return true;
  } catch (e) {
    return e && e.name === 'AbortError';
  }
}

async function tryShareText(text) {
  if (!navigator.share) return false;
  try {
    await navigator.share({ title: 'Gastos Coche', text });
    return true;
  } catch (e) {
    return e && e.name === 'AbortError';
  }
}

async function shareSummary(summary, range) {
  if (summary.tripCount === 0) { showToast('No hay nada que compartir todavía'); return; }

  let blob = null;
  try { blob = await buildShareImageBlob(summary, range); } catch (e) { console.warn('No se pudo generar la imagen para compartir', e); }
  const fileName = `gastos-coche-${range.replace(/[^\p{L}\p{N}]+/gu, '-')}.png`;
  const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;

  if (await tryShareFile(file)) return;
  if (await tryShareText(buildShareText(summary, range))) return;

  if (file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Imagen descargada');
    return;
  }

  const text = buildShareText(summary, range);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try { await navigator.clipboard.writeText(text); showToast('Resumen copiado al portapapeles'); return; } catch (e) { /* sigue al prompt */ }
  }
  window.prompt('Copia el resumen:', text);
}

function closePeriod(summary, range) {
  const doClose = () => {
    state.history.unshift({
      id: uid(),
      closedAt: todayISO(),
      range,
      startDate: getSortedDays(state.period)[0]?.date || null,
      endDate: getSortedDays(state.period).slice(-1)[0]?.date || null,
      summary
    });
    state.period = { id: uid(), createdAt: todayISO(), days: [] };
    // El periodo nuevo empieza vacío: a las personas y coches archivados ya
    // no los referencia nada fuera del Historial, que guarda sus nombres.
    // Los repostajes de un coche que se borra ya no sirven de nada (su precio
    // ya se aplicó) y dejarían referencias a un coche inexistente.
    state.people = activePeople();
    state.cars = activeCars();
    state.refuels = state.refuels.filter((r) => state.cars.some((c) => c.id === r.carId));
    state.closeReminderSnoozedUntil = null;
    saveState();
    renderRoster();
    updatePeriodBadge();
    switchTab('registro');
    showToast('Periodo cerrado y guardado en el historial');
  };

  confirmModal({
    title: 'Cerrar periodo',
    message: summary.tripCount === 0
      ? 'El periodo está vacío. ¿Cerrarlo igualmente y empezar uno nuevo?'
      : `¿Cerrar el periodo (${range}) y guardarlo en el historial? Empezarás uno nuevo vacío.`,
    confirmLabel: 'Cerrar periodo',
    onConfirm: doClose
  });
}

