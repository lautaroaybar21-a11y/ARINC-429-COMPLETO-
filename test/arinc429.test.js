const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeInstrumentValue } = require('../arinc429');

test('genera una palabra de 32 bits con paridad impar', () => {
  const result = encodeInstrumentValue('altimetro', 1250);
  assert.equal(result.wordBits.length, 32);
  assert.equal(Number.parseInt(result.wordHex, 16) >>> 0, Number.parseInt(result.wordBits, 2) >>> 0);
  assert.equal([...result.wordBits].filter((bit) => bit === '1').length % 2, 1);
});

test('mapea los extremos de escala a 0 y 5 V simulados', () => {
  assert.equal(encodeInstrumentValue('rumbo', 0).simulatedVoltageV, 0);
  assert.equal(encodeInstrumentValue('rumbo', 360).simulatedVoltageV, 5);
});

test('codifica BNR negativo en complemento a dos y estado normal', () => {
  const result = encodeInstrumentValue('altimetro', -1000);
  const word = Number.parseInt(result.wordHex, 16) >>> 0;
  assert.equal((word >>> 10) & 0x7ffff, 0x40001);
  assert.equal((word >>> 29) & 0b11, 0);
});

test('rechaza valores fuera de la escala configurada', () => {
  assert.throws(() => encodeInstrumentValue('rumbo', 361), RangeError);
});