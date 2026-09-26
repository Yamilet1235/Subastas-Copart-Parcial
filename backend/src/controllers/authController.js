const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql, getConnection } = require('../config/database');

function crearToken(usuario) {
  return jwt.sign(
    { id: usuario.UsuarioID, correo: usuario.Correo, nombre: usuario.Nombre },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
}

async function register(req, res) {
  const { nombre, apellido, correo, telefono, password } = req.body || {};
  if (![nombre, apellido, correo, telefono, password].every((value) => String(value || '').trim())) {
    return res.status(400).json({ mensaje: 'Todos los campos son obligatorios.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ mensaje: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const pool = await getConnection();
    const correoNormalizado = String(correo).trim().toLowerCase();
    const existe = await pool.request()
      .input('Correo', sql.NVarChar(255), correoNormalizado)
      .query('SELECT UsuarioID FROM dbo.Copart_Usuarios_14827 WHERE Correo = @Correo');

    if (existe.recordset.length) {
      return res.status(409).json({ mensaje: 'El correo ya está registrado.' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const resultado = await pool.request()
      .input('Nombre', sql.NVarChar(100), String(nombre).trim())
      .input('Apellido', sql.NVarChar(100), String(apellido).trim())
      .input('Correo', sql.NVarChar(255), correoNormalizado)
      .input('Telefono', sql.NVarChar(30), String(telefono).trim())
      .input('PasswordHash', sql.NVarChar(255), passwordHash)
      .query(`
        INSERT INTO dbo.Copart_Usuarios_14827 (Nombre, Apellido, Correo, Telefono, PasswordHash)
        OUTPUT INSERTED.UsuarioID, INSERTED.Nombre, INSERTED.Apellido, INSERTED.Correo, INSERTED.Telefono
        VALUES (@Nombre, @Apellido, @Correo, @Telefono, @PasswordHash)
      `);

    const usuarioDb = resultado.recordset[0];
    const usuario = {
      id: usuarioDb.UsuarioID,
      nombre: usuarioDb.Nombre,
      apellido: usuarioDb.Apellido,
      correo: usuarioDb.Correo,
      telefono: usuarioDb.Telefono,
    };
    return res.status(201).json({ token: crearToken(usuarioDb), usuario });
  } catch (error) {
    if (error.number === 2627 || error.number === 2601) {
      return res.status(409).json({ mensaje: 'El correo ya está registrado.' });
    }
    console.error('Error al registrar usuario:', error.message);
    return res.status(500).json({ mensaje: 'No se pudo registrar el usuario.' });
  }
}

async function login(req, res) {
  const body = req.body || {};
  const correo = String(body.correo || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!correo || !password) {
    return res.status(400).json({ mensaje: 'Correo y contraseña son obligatorios.' });
  }

  try {
    const pool = await getConnection();
    const resultado = await pool.request()
      .input('Correo', sql.NVarChar(255), correo)
      .query(`
        SELECT UsuarioID, Nombre, Apellido, Correo, Telefono, PasswordHash
        FROM dbo.Copart_Usuarios_14827
        WHERE Correo = @Correo
      `);
    const usuarioDb = resultado.recordset[0];
    if (!usuarioDb || !(await bcrypt.compare(password, usuarioDb.PasswordHash))) {
      return res.status(401).json({ mensaje: 'Correo o contraseña incorrectos.' });
    }

    const usuario = {
      id: usuarioDb.UsuarioID,
      nombre: usuarioDb.Nombre,
      apellido: usuarioDb.Apellido,
      correo: usuarioDb.Correo,
      telefono: usuarioDb.Telefono,
    };
    return res.json({ token: crearToken(usuarioDb), usuario });
  } catch (error) {
    console.error('Error al iniciar sesión:', error.message);
    return res.status(500).json({ mensaje: 'No se pudo iniciar sesión.' });
  }
}

module.exports = { register, login };
