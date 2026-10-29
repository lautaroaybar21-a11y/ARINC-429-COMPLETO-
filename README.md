# AeroLink · CRUD de envíos con MySQL

Aplicación local para registrar envíos de instrumentos y administrarlos con operaciones CRUD. Con MySQL, cada fila se guarda en la tabla `arinc429.instrument_shipments`. Si MySQL no está configurado o no se puede conectar, la aplicación inicia en modo local y guarda los registros en `data/instrument_shipments.json`.

## Requisitos

- Node.js 18 o superior
- MySQL 8 o compatible, iniciado localmente

## Preparar MySQL

1. Con una cuenta administradora de MySQL, ejecutar el esquema en `database/schema.sql`. Este crea la base `arinc429` y la tabla `instrument_shipments`. La tabla `shipments` de instalaciones anteriores, si existe, no se modifica.
2. Crear una copia de `.env.example` llamada `.env` y colocar allí el usuario y la contraseña MySQL que tengan permiso sobre esa base. La aplicación no guarda contraseñas en el código.
3. Instalar dependencias e iniciar el servidor:

```sh
npm install
npm start
```

En esta computadora, abrí http://127.0.0.1:3000. Para permitir que otra computadora en la misma red Wi-Fi o LAN también abra la página, iniciá el servidor con `npm start` desde la carpeta del proyecto y compartile este enlace: http://10.15.8.111:3000. Ambas computadoras deben estar conectadas a la misma red y esta computadora debe permanecer encendida con la terminal abierta. Si la IP cambia, reemplazá `10.15.8.111` por la dirección que muestre `hostname -I` en Linux (o `ipconfig` en Windows).

El servidor escucha en todas las interfaces de red (`HOST=0.0.0.0`). Si la otra computadora no puede abrir el enlace, permití conexiones entrantes al puerto TCP 3000 en el firewall y comprobá que la red no tenga aislamiento entre dispositivos. El servidor también crea la tabla al iniciar si el usuario configurado tiene permiso `CREATE`. Sin MySQL, el modo local permite usar el CRUD y persiste los datos en un archivo JSON del repositorio.

## Acceder desde otra computadora en la misma red

El servidor escucha en todas las interfaces de red por defecto (`HOST=0.0.0.0`). Iniciá la aplicación en esta computadora y averiguá su dirección IPv4 local con `hostname -I` (Linux) o `ipconfig` (Windows). Desde la otra computadora, conectada a la misma red Wi-Fi o LAN, abrí `http://DIRECCION-IP:3000`, reemplazando `DIRECCION-IP` por esa dirección (por ejemplo, `http://192.168.1.25:3000`).

Si no conecta, permití conexiones TCP entrantes al puerto 3000 en el firewall de esta computadora y verificá que ambas estén en la misma red y que el router no tenga aislamiento de clientes. No configures reenvío de puertos ni expongas este servidor a Internet: no incluye autenticación y está pensado para una red local confiable. Podés cambiar la interfaz de escucha con la variable `HOST` en `.env`.

Si todavía no existe un usuario de aplicación, el administrador puede concederle acceso con:

```sql
CREATE USER 'arinc429_app'@'localhost' IDENTIFIED BY 'elegir-una-clave-local';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE ON arinc429.* TO 'arinc429_app'@'localhost';
```

Usá en `.env` el mismo usuario y clave. Si MySQL se conecta por TCP en vez de socket local, el administrador puede necesitar autorizar también `arinc429_app` desde `127.0.0.1`.

## CRUD de envíos

- `GET /api/shipments`: listar envíos.
- `GET /api/shipments/:id`: obtener un envío.
- `POST /api/shipments`: crear uno con `{"instrumentId":"altimetro","value":1200}`.
- `PUT /api/shipments/:id`: actualizar instrumento y valor con el mismo JSON.
- `DELETE /api/shipments/:id`: eliminar un envío.
- `GET /api/instruments`: listar instrumentos disponibles.

La interfaz permite editar y eliminar filas desde la tabla. Las rutas antiguas `/api/messages` siguen disponibles como alias para `GET` y `POST`.

## Salida ARINC-429 demostrativa

Al crear o editar un envío, la respuesta del `POST` o `PUT /api/shipments` incluye `arinc429`: palabra BNR de 32 bits con datos firmados en complemento a dos y paridad impar, expresada en hexadecimal y binario, etiqueta octal, escala y tensión equivalente simulada de 0 a 5 V. Los datos se guardan en `instrument_shipments`; cualquier tabla `shipments` preexistente se mantiene intacta. Las etiquetas 001 a 006 y los rangos incluidos en `arinc429.js` son asignaciones locales de demostración, no etiquetas ni escalas certificadas. Los valores fuera de esos rangos se rechazan.

Esto calcula datos; no envía bytes a un puerto serial ni produce tensión física. Un UART común no implementa la capa eléctrica ARINC-429. Para transmitir en un bus real hace falta una interfaz/transceptor ARINC-429 compatible, con niveles diferenciales y temporización de alta o baja velocidad configurados según el sistema. No conectar un puerto UART directamente al bus.

## Entrada de auricular y servo

Arquitectura funcional para una señal analógica de línea/auricular, sujeta a verificar primero la amplitud y forma de onda de la fuente:

```text
Salida de auricular
    │
    ├── resistor serie + protección de entrada
    │
    └── buffer operacional de alta impedancia (entrada >= 100 kΩ)
	    │
	    └── acondicionamiento/bias y filtro antialias
		    │
		    └── ADC de microcontrolador
			    │ mapeo/calibración
			    └── PWM ───────── señal de control del servo

Fuente regulada independiente para el servo ─── alimentación del servo
Masa común solo si el diseño y el aislamiento de la fuente lo permiten
```

El auricular no debe alimentar el servo: la entrada de alta impedancia solo mide la señal, y el microcontrolador convierte el valor interpretado a PWM. Si la salida es audio AC, hay que determinar si se decodifica amplitud, frecuencia o un protocolo antes de fijar el sesgo, filtro y calibración del ADC. Medir con instrumental y diseñar protección/aislamiento para los niveles reales antes de conectar hardware; no usar esta simulación como instrumento aeronáutico.