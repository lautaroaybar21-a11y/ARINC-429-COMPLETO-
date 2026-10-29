const form = document.querySelector('#message-form');
const instrumentSelect = document.querySelector('#instrument');
const valueInput = document.querySelector('#value');
const unitBadge = document.querySelector('#unit-badge');
const feedback = document.querySelector('#form-feedback');
const submitButton = document.querySelector('#submit-button');
const messageList = document.querySelector('#message-list');
const connectionStatus = document.querySelector('#connection-status');
const messageCount = document.querySelector('#message-count');
const historyCount = document.querySelector('#history-count');
const cancelEditButton = document.querySelector('#cancel-edit');
const outputReadout = document.querySelector('#output-readout');

let instruments = [];
let shipments = [];
let editingShipmentId = null;
let storageMode = 'mysql';
const fallbackInstruments = [
  { id: 'altimetro', name: 'Altímetro', parameter: 'Altitud', unit: 'ft', min: -1000, max: 60000, labelOctal: '001' },
  { id: 'velocimetro', name: 'Velocímetro', parameter: 'Velocidad', unit: 'kt', min: 0, max: 600, labelOctal: '002' },
  { id: 'rumbo', name: 'Indicador de rumbo', parameter: 'Rumbo', unit: '°', min: 0, max: 360, labelOctal: '003' },
  { id: 'vario', name: 'Variómetro', parameter: 'Velocidad vertical', unit: 'ft/min', min: -6000, max: 6000, labelOctal: '004' },
  { id: 'temperatura', name: 'Indicador de temperatura', parameter: 'Temperatura', unit: '°C', min: -80, max: 100, labelOctal: '005' },
  { id: 'combustible', name: 'Indicador de combustible', parameter: 'Combustible', unit: 'kg', min: 0, max: 20000, labelOctal: '006' },
];

function showFeedback(message, isSuccess = false) {
  feedback.textContent = message;
  feedback.classList.toggle('success', isSuccess);
}

function renderOutput(output) {
  if (!output) return;
  document.querySelector('#output-word').textContent = output.wordHex;
  document.querySelector('#output-bits').textContent = output.wordBits;
  document.querySelector('#output-label').textContent = output.labelOctal;
  document.querySelector('#output-voltage').textContent = `${output.simulatedVoltageV.toFixed(3)} V`;
  outputReadout.hidden = false;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(value));
}

function renderMessages(records) {
  shipments = records;
  historyCount.textContent = records.length;
  messageCount.textContent = records.length.toString().padStart(2, '0');

  if (records.length === 0) {
    messageList.innerHTML = '<tr class="empty-row"><td colspan="8">Todavía no hay envíos. Creá el primero desde el formulario.</td></tr>';
    return;
  }

  messageList.innerHTML = records.slice(0, 20).map((message) => {
    const instrument = instruments.find((item) => item.id === message.instrumentId);
    const minimum = instrument ? `${Number(instrument.min).toLocaleString('es-AR')} ${escapeHtml(message.unit)}` : '—';
    const maximum = instrument ? `${Number(instrument.max).toLocaleString('es-AR')} ${escapeHtml(message.unit)}` : '—';
    return `
      <tr>
        <td class="instrument-cell">${escapeHtml(message.instrument)}</td>
        <td>${escapeHtml(message.parameter)}</td>
        <td class="value-cell">${Number(message.value).toLocaleString('es-AR')} ${escapeHtml(message.unit)}</td>
        <td>${minimum}</td>
        <td>${maximum}</td>
        <td>${formatDate(message.createdAt)}</td>
        <td><span class="status-pill">${escapeHtml(message.status === 'sent' ? 'Enviado' : message.status)}</span></td>
        <td class="action-cell">
          <button class="row-button" type="button" data-action="edit" data-id="${message.id}">Editar</button>
          <button class="row-button delete-button" type="button" data-action="delete" data-id="${message.id}">Eliminar</button>
        </td>
      </tr>
    `;
  }).join('');
}

function updateStorageLabels() {
  const isLocal = storageMode === 'local';
  const destination = isLocal ? 'Archivo local' : 'Base MySQL';
  const storageDescription = document.querySelector('#storage-description');
  const storageDestination = document.querySelector('#storage-destination');
  const storageHelp = document.querySelector('#storage-help');
  const storageStatCaption = document.querySelector('#storage-stat-caption');
  const historyStorageCaption = document.querySelector('#history-storage-caption');
  const footerStorageCaption = document.querySelector('#footer-storage-caption');

  storageDescription.textContent = isLocal
    ? 'Registrá y administrá mensajes de instrumentos; se guardan en este equipo.'
    : 'Seleccioná un instrumento, ingresá su valor y registrá el envío en MySQL.';
  storageDestination.textContent = `${destination} · codificación de demostración`;
  storageHelp.textContent = `Cada envío queda guardado en ${isLocal ? 'este equipo' : 'la base MySQL'} para consultarlo, editarlo o eliminarlo.`;
  storageStatCaption.textContent = isLocal ? 'envíos guardados en este equipo' : 'en la base MySQL';
  historyStorageCaption.textContent = `Registros guardados en ${isLocal ? 'este equipo' : 'MySQL'}`;
  footerStorageCaption.textContent = isLocal
    ? 'Los envíos quedan guardados en este equipo'
    : 'Los envíos se guardan en MySQL';
}

async function refreshShipments() {
  const response = await fetch('/api/shipments');
  if (!response.ok) throw new Error('No se pudo actualizar la lista de envíos.');
  storageMode = response.headers.get('X-Storage-Mode') || 'mysql';
  updateStorageLabels();
  renderMessages(await response.json());
}

function resetEditor() {
  editingShipmentId = null;
  form.reset();
  valueInput.removeAttribute('min');
  valueInput.removeAttribute('max');
  unitBadge.textContent = '—';
  document.querySelector('#instrument-hint').textContent = 'Elegí el instrumento que origina el dato.';
  submitButton.querySelector('span').textContent = 'Crear mensaje';
  cancelEditButton.hidden = true;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

async function loadData() {
  let catalogLoaded = false;
  try {
    const response = await fetch('/api/instruments');
    if (!response.ok) throw new Error('No se pudo consultar el catálogo.');
    const catalog = await response.json();
    if (!Array.isArray(catalog) || catalog.length === 0) throw new Error('El catálogo está vacío.');
    instruments = catalog.map((instrument) => {
      const fallback = fallbackInstruments.find((item) => item.id === instrument.id);
      return fallback ? { ...fallback, ...instrument } : instrument;
    });
    catalogLoaded = true;
  } catch {
    instruments = fallbackInstruments;
  }

  instrumentSelect.innerHTML = '<option value="" disabled selected>Seleccioná un instrumento</option>' +
    instruments.map((instrument) => `<option value="${escapeHtml(instrument.id)}">${escapeHtml(instrument.name)} · ${escapeHtml(instrument.parameter)}</option>`).join('');

  try {
    await refreshShipments();
    connectionStatus.textContent = storageMode === 'local' ? 'Archivo local' : 'Conectado a MySQL';
    if (storageMode === 'local') showFeedback('Los registros se guardan en este equipo y aparecerán en la tabla.', true);
    if (!catalogLoaded) showFeedback('Catálogo local disponible; no se pudo consultar el servidor.');
  } catch {
    connectionStatus.textContent = 'MySQL sin conexión';
    renderMessages([]);
    showFeedback('Podés seleccionar el instrumento e ingresar el valor; MySQL no está disponible para guardar el envío.');
  }
}

instrumentSelect.addEventListener('change', () => {
  const instrument = instruments.find((item) => item.id === instrumentSelect.value);
  unitBadge.textContent = instrument ? instrument.unit : '—';
  if (instrument) {
    valueInput.min = instrument.min;
    valueInput.max = instrument.max;
  } else {
    valueInput.removeAttribute('min');
    valueInput.removeAttribute('max');
  }
  document.querySelector('#instrument-hint').textContent = instrument
    ? `${instrument.parameter} · ${instrument.min} a ${instrument.max} ${instrument.unit} · etiqueta demostrativa ${instrument.labelOctal} (octal)`
    : 'Elegí el instrumento que origina el dato.';
});

cancelEditButton.addEventListener('click', () => {
  resetEditor();
  showFeedback('Edición cancelada.');
});

messageList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const shipment = shipments.find((item) => item.id === Number(button.dataset.id));
  if (!shipment) return;

  if (button.dataset.action === 'edit') {
    outputReadout.hidden = true;
    editingShipmentId = shipment.id;
    instrumentSelect.value = shipment.instrumentId;
    instrumentSelect.dispatchEvent(new Event('change'));
    valueInput.value = shipment.value;
    submitButton.querySelector('span').textContent = 'Guardar cambios';
    cancelEditButton.hidden = false;
    showFeedback(`Editando envío #${shipment.id}.`);
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    valueInput.focus({ preventScroll: true });
    return;
  }

  if (button.dataset.action === 'delete' && window.confirm(`¿Eliminar el envío #${shipment.id}? Esta acción no se puede deshacer.`)) {
    button.disabled = true;
    try {
      const response = await fetch(`/api/shipments/${shipment.id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo eliminar el envío.');
      await refreshShipments();
      showFeedback(`Envío #${shipment.id} eliminado.`, true);
    } catch (error) {
      showFeedback(error.message || 'Error al eliminar el envío.');
      button.disabled = false;
    }
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showFeedback('');
  submitButton.disabled = true;
  const wasEditing = editingShipmentId !== null;

  try {
    const response = await fetch(wasEditing ? `/api/shipments/${editingShipmentId}` : '/api/shipments', {
      method: wasEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instrumentId: instrumentSelect.value, value: valueInput.value }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo crear el mensaje.');

    renderOutput(result.arinc429);
    await refreshShipments();
    resetEditor();
    const destination = storageMode === 'local' ? 'el almacenamiento local' : 'MySQL';
    showFeedback(wasEditing
      ? `Envío actualizado correctamente en ${destination}.`
      : `Envío creado y guardado en ${destination}.`, true);
  } catch (error) {
    showFeedback(error.message || 'Error de conexión. Intentá de nuevo.');
  } finally {
    submitButton.disabled = false;
  }
});

loadData();