const express = require('express');
const { verificarToken, tokenOpcional } = require('../middleware/auth');
const {
  listar,
  obtenerDetalle,
  listarMios,
  crear,
  editar,
} = require('../controllers/vehiculosController');

const router = express.Router();

router.get('/mis-vehiculos', verificarToken, listarMios);
router.get('/vehiculos', listar);
router.get('/vehiculos/:id', tokenOpcional, obtenerDetalle);
router.post('/vehiculos', verificarToken, crear);
router.put('/vehiculos/:id', verificarToken, editar);

module.exports = router;
