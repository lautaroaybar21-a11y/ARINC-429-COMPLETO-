# AeroLink · CRUD de envíos con MySQL

Aplicación local para registrar envíos de instrumentos y administrarlos con operaciones CRUD. Cada fila se guarda en la tabla `arinc429.shipments`; el historial JSON anterior deja de utilizarse.

## Requisitos

- Node.js 18 o superior
- MySQL 8 o compatible, iniciado localmente

## Preparar MySQL

1. Con una cuenta administradora de MySQL, ejecutar el esquema en `database/schema.sql`. Este crea la base `arinc429` y la tabla `shipments`.
2. Crear una copia de `.env.example` llamada `.env` y colocar allí el usuario y la contraseña MySQL que tengan permiso sobre esa base. La aplicación no guarda contraseñas en el código.
3. Instalar dependencias e iniciar el servidor:

```sh
npm install
npm start
```

Abrir http://127.0.0.1:3000. El servidor también crea la tabla al iniciar si el usuario configurado tiene permiso `CREATE`.

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