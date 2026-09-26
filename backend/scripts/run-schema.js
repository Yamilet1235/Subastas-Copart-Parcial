const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sql, getConnection } = require('../src/config/database');

const tablasEsperadas = [
  'Copart_Usuarios_14827',
  'Copart_Vehiculos_14827',
  'Copart_Fotos_14827',
  'Copart_Pujas_14827',
];

async function ejecutar() {
  let pool;
  try {
    pool = await getConnection();
    const schema = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
    await pool.request().batch(schema);
    const verificacion = await pool.request()
      .input('Tabla1', sql.NVarChar(128), tablasEsperadas[0])
      .input('Tabla2', sql.NVarChar(128), tablasEsperadas[1])
      .input('Tabla3', sql.NVarChar(128), tablasEsperadas[2])
      .input('Tabla4', sql.NVarChar(128), tablasEsperadas[3])
      .query(`
        SELECT name FROM sys.tables
        WHERE name IN (@Tabla1, @Tabla2, @Tabla3, @Tabla4)
      `);
    const tablasEncontradas = verificacion.recordset.map((tabla) => tabla.name);
    const faltantes = tablasEsperadas.filter((tabla) => !tablasEncontradas.includes(tabla));
    if (faltantes.length) throw new Error(`No se encontraron las tablas: ${faltantes.join(', ')}`);
    console.log(`Esquema verificado: ${tablasEncontradas.sort().join(', ')}`);
  } catch (error) {
    console.error('No se pudo ejecutar el esquema:', error.message);
    process.exitCode = 1;
  } finally {
    if (pool) await pool.close();
  }
}

ejecutar();
