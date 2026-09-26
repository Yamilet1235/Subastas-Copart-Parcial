const express = require('express');
const { verificarToken } = require('../middleware/auth');
const { listarPujas, crearPuja } = require('../controllers/pujasController');

const router = express.Router();

router.get('/vehiculos/:id/pujas', listarPujas);
router.post('/vehiculos/:id/pujas', verificarToken, crearPuja);

module.exports = router;
