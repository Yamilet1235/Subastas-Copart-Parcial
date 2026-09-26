const jwt = require('jsonwebtoken');

function getToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function verificarToken(req, res, next) {
  const token = getToken(req);
  if (!token) {
    return res.status(401).json({ mensaje: 'Debes iniciar sesión.' });
  }

  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch (error) {
    return res.status(401).json({ mensaje: 'Token inválido o vencido.' });
  }
}

function tokenOpcional(req, res, next) {
  const token = getToken(req);
  if (!token) return next();

  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    req.usuario = null;
  }
  return next();
}

module.exports = { verificarToken, tokenOpcional };
