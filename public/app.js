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
    messageList.innerHTML = '<tr class="empty-row"><td colspan="6">Todavía no hay envíos. Creá el primero desde el formulario.</td></tr>';
    return;
  }

  messageList.innerHTML = records.slice(0, 20).map((message) => `
    <tr>
      <td class="instrument-cell">${escapeHtml(message.instrument)}</td>
      <td>${escapeHtml(message.parameter)}</td>
      <td class="value-cell">${Number(message.value).toLocaleString('es-AR')} ${escapeHtml(message.unit)}</td>
      <td>${formatDate(message.createdAt)}</td>
      <td><span class="status-pill">${escapeHtml(message.status === 'sent' ? 'Enviado' : message.status)}</span></td>
      <td class="action-cell">
        <button class="row-button" type="button" data-action="edit" data-id="${message.id}">Editar</button>
        <button class="row-button delete-button" type="button" data-action="delete" data-id="${message.id}">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

async function refreshShipments() {
  const response = await fetch('/api/shipments');
  if (!response.ok) throw new Error('No se pudo actualizar la lista de envíos.');
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
  try {
    const [instrumentResponse, messageResponse] = await Promise.all([
      fetch('/api/instruments'),
      fetch('/api/shipments'),
    ]);
    if (!instrumentResponse.ok || !messageResponse.ok) throw new Error('No se pudo consultar el servidor.');
    instruments = await instrumentResponse.json();
    const messages = await messageResponse.json();

    instrumentSelect.innerHTML = '<option value="" disabled selected>Seleccioná un instrumento</option>' +
      instruments.map((instrument) => `<option value="${escapeHtml(instrument.id)}">${escapeHtml(instrument.name)} · ${escapeHtml(instrument.parameter)}</option>`).join('');
    renderMessages(messages);
    connectionStatus.textContent = 'Conectado';
  } catch (error) {
    connectionStatus.textContent = 'Sin conexión';
    showFeedback('No se pudo conectar con MySQL. Revisá la configuración del servidor.');
    instrumentSelect.innerHTML = '<option value="" disabled selected>Servidor no disponible</option>';
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
    showFeedback(wasEditing ? 'Envío actualizado correctamente.' : 'Envío creado y guardado en MySQL.', true);
  } catch (error) {
    showFeedback(error.message || 'Error de conexión. Intentá de nuevo.');
  } finally {
    submitButton.disabled = false;
  }
});

loadData();