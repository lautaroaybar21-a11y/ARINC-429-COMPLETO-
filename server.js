const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const { encodeInstrumentValue, getInstrumentScale } = require('./arinc429');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const AUTH_USER = process.env.AUTH_USER || '';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || '';
const PUBLIC_DIR = path.join(__dirname, 'public');
const LOCAL_DATA_FILE = path.join(__dirname, 'data', 'instrument_shipments.json');
let useLocalFileStorage = false;
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'arinc429',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
});

const instruments = [
  { id: 'altimetro', name: 'Altímetro', parameter: 'Altitud', unit: 'ft' },
  { id: 'velocimetro', name: 'Velocímetro', parameter: 'Velocidad', unit: 'kt' },
  { id: 'rumbo', name: 'Indicador de rumbo', parameter: 'Rumbo', unit: '°' },
  { id: 'vario', name: 'Variómetro', parameter: 'Velocidad vertical', unit: 'ft/min' },
  { id: 'temperatura', name: 'Indicador de temperatura', parameter: 'Temperatura', unit: '°C' },
  { id: 'combustible', name: 'Indicador de combustible', parameter: 'Combustible', unit: 'kg' },
];

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Storage-Mode': useLocalFileStorage ? 'local' : 'mysql',
  });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 16_384) {
        reject(Object.assign(new Error('El contenido es demasiado grande.'), { status: 413 }));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error('El cuerpo debe ser JSON válido.'), { status: 400 }));
      }
    });
    request.on('error', reject);
  });
}

function getInstrumentAndValue(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'El cuerpo debe ser un objeto JSON con instrumento y valor.' };
  }
  const instrument = instruments.find((item) => item.id === body.instrumentId);
  const value = Number(body.value);
  if (!instrument) {
    return { error: 'Seleccioná un instrumento válido.' };
  }
  if (body.value === '' || !Number.isFinite(value) || Math.abs(value) > 1_000_000_000) {
    return { error: 'Ingresá un valor numérico válido.' };
  }
  try {
    return { instrument, value, arinc429: encodeInstrumentValue(instrument.id, value) };
  } catch {
    return { error: 'El valor está fuera de la escala demostrativa configurada para ese instrumento.' };
  }
}

async function getShipment(id) {
  if (useLocalFileStorage) {
    const shipments = await readLocalShipments();
    return shipments.find((shipment) => shipment.id === id);
  }
  const [rows] = await pool.execute(
    `SELECT id, instrument_id AS instrumentId, instrument, parameter, value, unit,
            delivery_status AS status, created_at AS createdAt, updated_at AS updatedAt
    FROM instrument_shipments WHERE id = ?`,
    [id],
  );
  return rows[0];
}

async function readLocalShipments() {
  try {
    return JSON.parse(await fs.promises.readFile(LOCAL_DATA_FILE, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeLocalShipments(shipments) {
  await fs.promises.mkdir(path.dirname(LOCAL_DATA_FILE), { recursive: true });
  await fs.promises.writeFile(LOCAL_DATA_FILE, `${JSON.stringify(shipments, null, 2)}\n`);
}

function serveStatic(request, response, pathname) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(PUBLIC_DIR, `.${decodeURIComponent(requestedPath)}`);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    response.writeHead(403).end('Prohibido');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('No se encontró el recurso.');
      return;
    }
    const contentTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.svg': 'image/svg+xml',
    };
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  if (IS_PRODUCTION) {
    const authorization = request.headers.authorization || '';
    const supplied = authorization.startsWith('Basic ')
      ? Buffer.from(authorization.slice(6), 'base64').toString('utf8')
      : '';
    const expected = `${AUTH_USER}:${AUTH_PASSWORD}`;
    const suppliedBuffer = Buffer.from(supplied);
    const expectedBuffer = Buffer.from(expected);
    const authorized = suppliedBuffer.length === expectedBuffer.length
      && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
    if (!authorized) {
      response.writeHead(401, {
        'WWW-Authenticate': 'Basic realm="AeroLink", charset="UTF-8"',
        'Cache-Control': 'no-store',
      }).end('Autenticación requerida.');
      return;
    }
  }

  const url = new URL(request.url, `http://${HOST}:${PORT}`);

  if (request.method === 'GET' && url.pathname === '/api/instruments') {
    sendJson(response, 200, instruments.map((instrument) => ({
      ...instrument,
      ...getInstrumentScale(instrument.id),
    })));
    return;
  }

  const shipmentRoute = url.pathname.match(/^\/api\/(?:shipments|messages)(?:\/(\d+))?$/);
  if (shipmentRoute) {
    const shipmentId = shipmentRoute[1] ? Number(shipmentRoute[1]) : null;
    try {
      if (request.method === 'GET' && shipmentId === null) {
        if (useLocalFileStorage) {
          const rows = await readLocalShipments();
          rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
          sendJson(response, 200, rows);
          return;
        }
        const [rows] = await pool.query(
          `SELECT id, instrument_id AS instrumentId, instrument, parameter, value, unit,
                  delivery_status AS status, created_at AS createdAt, updated_at AS updatedAt
           FROM instrument_shipments ORDER BY created_at DESC, id DESC`,
        );
        sendJson(response, 200, rows);
        return;
      }

      if (request.method === 'GET' && shipmentId !== null) {
        const shipment = await getShipment(shipmentId);
        if (!shipment) {
          sendJson(response, 404, { error: 'No se encontró ese envío.' });
          return;
        }
        sendJson(response, 200, shipment);
        return;
      }

      if (request.method === 'POST' && shipmentId === null) {
        const body = await readJson(request);
        const parsed = getInstrumentAndValue(body);
        if (parsed.error) {
          sendJson(response, 400, { error: parsed.error });
          return;
        }
        const { instrument, value, arinc429 } = parsed;
        if (useLocalFileStorage) {
          const rows = await readLocalShipments();
          const now = new Date().toISOString();
          const shipment = {
            id: rows.reduce((maxId, row) => Math.max(maxId, row.id), 0) + 1,
            instrumentId: instrument.id,
            instrument: instrument.name,
            parameter: instrument.parameter,
            value,
            unit: instrument.unit,
            status: 'sent',
            createdAt: now,
            updatedAt: now,
          };
          rows.push(shipment);
          await writeLocalShipments(rows);
          sendJson(response, 201, { ...shipment, arinc429 });
          return;
        }
        const [result] = await pool.execute(
          `INSERT INTO instrument_shipments (instrument_id, instrument, parameter, value, unit, delivery_status)
           VALUES (?, ?, ?, ?, ?, 'sent')`,
          [instrument.id, instrument.name, instrument.parameter, value, instrument.unit],
        );
        sendJson(response, 201, { ...(await getShipment(result.insertId)), arinc429 });
        return;
      }

      if (request.method === 'PUT' && shipmentId !== null) {
        const body = await readJson(request);
        const parsed = getInstrumentAndValue(body);
        if (parsed.error) {
          sendJson(response, 400, { error: parsed.error });
          return;
        }
        const { instrument, value, arinc429 } = parsed;
        if (useLocalFileStorage) {
          const rows = await readLocalShipments();
          const shipment = rows.find((row) => row.id === shipmentId);
          if (!shipment) {
            sendJson(response, 404, { error: 'No se encontró ese envío.' });
            return;
          }
          Object.assign(shipment, {
            instrumentId: instrument.id,
            instrument: instrument.name,
            parameter: instrument.parameter,
            value,
            unit: instrument.unit,
            updatedAt: new Date().toISOString(),
          });
          await writeLocalShipments(rows);
          sendJson(response, 200, { ...shipment, arinc429 });
          return;
        }
        const [result] = await pool.execute(
          `UPDATE instrument_shipments
           SET instrument_id = ?, instrument = ?, parameter = ?, value = ?, unit = ?
           WHERE id = ?`,
          [instrument.id, instrument.name, instrument.parameter, value, instrument.unit, shipmentId],
        );
        if (result.affectedRows === 0 && !(await getShipment(shipmentId))) {
          sendJson(response, 404, { error: 'No se encontró ese envío.' });
          return;
        }
        sendJson(response, 200, { ...(await getShipment(shipmentId)), arinc429 });
        return;
      }

      if (request.method === 'DELETE' && shipmentId !== null) {
        if (useLocalFileStorage) {
          const rows = await readLocalShipments();
          const remaining = rows.filter((shipment) => shipment.id !== shipmentId);
          if (remaining.length === rows.length) {
            sendJson(response, 404, { error: 'No se encontró ese envío.' });
            return;
          }
          await writeLocalShipments(remaining);
          sendJson(response, 200, { id: shipmentId, deleted: true });
          return;
        }
        const [result] = await pool.execute('DELETE FROM instrument_shipments WHERE id = ?', [shipmentId]);
        if (result.affectedRows === 0) {
          sendJson(response, 404, { error: 'No se encontró ese envío.' });
          return;
        }
        sendJson(response, 200, { id: shipmentId, deleted: true });
        return;
      }

      sendJson(response, 405, { error: 'Método no permitido para esta ruta.' });
      return;
    } catch (error) {
      console.error('Error en CRUD de envíos:', error.message);
      sendJson(response, error.status || 500, {
        error: error.code === 'ECONNREFUSED' || error.code?.startsWith('ER_')
          ? 'No se pudo acceder a MySQL. Revisá la configuración de conexión.'
          : error.message || 'No se pudo procesar el envío.',
      });
      return;
    }
  }

  if (request.method === 'GET') {
    try {
      serveStatic(request, response, url.pathname);
    } catch {
      response.writeHead(400).end('Ruta no válida.');
    }
    return;
  }

  sendJson(response, 404, { error: 'Ruta no encontrada.' });
});

async function start() {
  if (IS_PRODUCTION) {
    const missing = ['AUTH_USER', 'AUTH_PASSWORD', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
      .filter((name) => !process.env[name]);
    if (missing.length) {
      throw new Error(`Faltan variables obligatorias para producción: ${missing.join(', ')}`);
    }
  }

  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS instrument_shipments (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        instrument_id VARCHAR(40) NOT NULL,
        instrument VARCHAR(120) NOT NULL,
        parameter VARCHAR(120) NOT NULL,
        value DECIMAL(20, 6) NOT NULL,
        unit VARCHAR(20) NOT NULL,
        delivery_status VARCHAR(20) NOT NULL DEFAULT 'sent',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_shipments_created_at (created_at),
        INDEX idx_shipments_instrument_id (instrument_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (error) {
    if (IS_PRODUCTION) throw error;
    useLocalFileStorage = true;
    console.warn('MySQL no está disponible; se usará almacenamiento local en data/instrument_shipments.json.');
    console.warn(`${error.code || 'ERROR'}: ${error.message}`);
  }

  server.listen(PORT, HOST, () => {
    console.log(`Servidor disponible en el puerto ${PORT} (interfaz: ${HOST}).`);
    console.log(`En esta computadora: http://127.0.0.1:${PORT}`);
    console.log(useLocalFileStorage
      ? 'Los registros se guardan localmente en un archivo JSON.'
      : `Base de datos conectada: ${process.env.DB_NAME || 'arinc429'}`);
  });
}

start().catch((error) => {
  console.error('No se pudo iniciar la aplicación.');
  console.error(`${error.code || 'ERROR'}: ${error.message}`);
  console.error('Revisá las variables de entorno y la disponibilidad de la base de datos.');
  process.exitCode = 1;
});