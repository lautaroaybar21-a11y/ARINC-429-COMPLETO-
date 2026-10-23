const instrumentScales = {
  altimetro: { label: 1, min: -1000, max: 60000 },
  velocimetro: { label: 2, min: 0, max: 600 },
  rumbo: { label: 3, min: 0, max: 360 },
  vario: { label: 4, min: -6000, max: 6000 },
  temperatura: { label: 5, min: -80, max: 100 },
  combustible: { label: 6, min: 0, max: 20000 },
};

function reverseByte(value) {
  let reversed = 0;
  for (let bit = 0; bit < 8; bit += 1) {
    reversed = (reversed << 1) | ((value >> bit) & 1);
  }
  return reversed;
}

function getInstrumentScale(instrumentId) {
  const scale = instrumentScales[instrumentId];
  return scale ? { ...scale, labelOctal: scale.label.toString(8).padStart(3, '0') } : null;
}

function encodeInstrumentValue(instrumentId, value) {
  const scale = instrumentScales[instrumentId];
  if (!scale || !Number.isFinite(value) || value < scale.min || value > scale.max) {
    throw new RangeError('El instrumento o el valor está fuera de la escala demostrativa configurada.');
  }

  const normalized = value < 0
    ? -Math.round((Math.abs(value) / Math.abs(scale.min)) * 0x3ffff)
    : Math.round((value / scale.max) * 0x3ffff);
  const data = normalized < 0 ? (0x80000 + normalized) : normalized;
  const label = reverseByte(scale.label);
  let word = (data << 10) | label;
  const parity = (word.toString(2).match(/1/g) || []).length % 2 === 0 ? 1 : 0;
  word = (word | (parity << 31)) >>> 0;

  return {
    wordHex: `0x${word.toString(16).toUpperCase().padStart(8, '0')}`,
    wordBits: word.toString(2).padStart(32, '0'),
    labelOctal: scale.label.toString(8).padStart(3, '0'),
    simulatedVoltageV: Number((((value - scale.min) / (scale.max - scale.min)) * 5).toFixed(3)),
    scale: { min: scale.min, max: scale.max },
  };
}

module.exports = { encodeInstrumentValue, getInstrumentScale };