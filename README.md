# Plataforma Web de Subastas de Vehículos en Tiempo Real - Caso Copart

MVP académico de una plataforma de publicación y subasta de vehículos con catálogo público, autenticación, reglas de puja aplicadas en servidor y actualizaciones en tiempo real.

## Tecnologías

- Backend: Node.js, Express y JavaScript CommonJS
- Base de datos: SQL Server y `mssql`
- Seguridad: JWT y `bcryptjs`
- Tiempo real: Socket.IO
- Frontend: HTML, CSS y JavaScript sin frameworks
- Configuración: `dotenv` y CORS

## Variables de entorno

Crear o completar `backend/.env` a partir de `backend/.env.example`:

```env
DB_USER=
DB_PASSWORD=
DB_SERVER=
DB_DATABASE=
DB_PORT=1433
PORT=3001
JWT_SECRET=
```

`JWT_SECRET` debe ser una cadena larga y privada. Nunca debe subirse `backend/.env` al repositorio.

## Instalación y base de datos

Desde la raíz del proyecto:

```bash
cd backend
npm install
npm run db:schema
npm run seed
```

`npm run db:schema` ejecuta únicamente `backend/sql/schema.sql` en la base configurada. El script es idempotente y crea las tablas `Copart_Usuarios_14827`, `Copart_Vehiculos_14827`, `Copart_Fotos_14827` y `Copart_Pujas_14827` si aún no existen.

También se puede abrir `backend/sql/schema.sql` en SQL Server Management Studio o Azure Data Studio, seleccionar la base configurada y ejecutar el archivo completo.

## Ejecución

Backend:

```bash
cd backend
npm start
```

La API queda disponible en `http://localhost:3001`.

Frontend, desde otra terminal:

```bash
npx serve frontend -l 5500
```

Abrir `http://localhost:5500`. También puede utilizarse la extensión Live Server de VS Code.

La URL local del backend está en la etiqueta `meta[name="api-base-url"]` de `frontend/index.html`. Para producción debe reemplazarse con la URL pública del backend.

## Usuarios de prueba

Los usuarios se crean al ejecutar `npm run seed`.

| Correo | Contraseña |
| --- | --- |
| `usuario1@copart.test` | `Prueba123!` |
| `usuario2@copart.test` | `Prueba123!` |
| `usuario3@copart.test` | `Prueba123!` |

## Endpoints principales

| Método | Endpoint | Acceso |
| --- | --- | --- |
| POST | `/api/auth/register` | Público |
| POST | `/api/auth/login` | Público |
| GET | `/api/vehiculos` | Público |
| GET | `/api/vehiculos/:id` | Público |
| GET | `/api/mis-vehiculos` | JWT |
| POST | `/api/vehiculos` | JWT |
| PUT | `/api/vehiculos/:id` | JWT y propietario |
| GET | `/api/vehiculos/:id/pujas` | Público |
| POST | `/api/vehiculos/:id/pujas` | JWT |

Filtros disponibles: `/api/vehiculos?anio=&marca=&modelo=&combustible=&danio=`.

Para endpoints protegidos enviar `Authorization: Bearer TOKEN`.

## Publicación

Backend publicado:
PENDIENTE_URL_BACKEND

Frontend publicado:
PENDIENTE_URL_FRONTEND
