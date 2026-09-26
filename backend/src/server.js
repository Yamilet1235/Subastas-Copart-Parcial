const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const variablesRequeridas = ['DB_USER', 'DB_PASSWORD', 'DB_SERVER', 'DB_DATABASE', 'JWT_SECRET'];
const faltantes = variablesRequeridas.filter((nombre) => !process.env[nombre]);
if (faltantes.length) {
  throw new Error(`Faltan variables de entorno obligatorias: ${faltantes.join(', ')}`);
}

const express = require('express');
const cors = require('cors');
const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const authRoutes = require('./routes/authRoutes');
const vehiculosRoutes = require('./routes/vehiculosRoutes');
const pujasRoutes = require('./routes/pujasRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.set('io', io);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
  res.json({ servicio: 'API Copart', estado: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api', vehiculosRoutes);
app.use('/api', pujasRoutes);

app.use((req, res) => {
  res.status(404).json({ mensaje: 'Ruta no encontrada.' });
});

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400) {
    return res.status(400).json({ mensaje: 'El cuerpo JSON no es válido.' });
  }
  console.error('Error no controlado:', error.message);
  return res.status(500).json({ mensaje: 'Error interno del servidor.' });
});

io.on('connection', (socket) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token || !process.env.JWT_SECRET) return;
  try {
    const usuario = jwt.verify(token, process.env.JWT_SECRET);
    socket.join(`usuario:${usuario.id}`);
  } catch (error) {
    // Los visitantes anónimos conservan la conexión para recibir montos públicos.
  }
});

const PORT = Number(process.env.PORT || 3001);
server.listen(PORT, () => {
  console.log(`Servidor Copart iniciado en http://localhost:${PORT}`);
});

module.exports = { app, server };
