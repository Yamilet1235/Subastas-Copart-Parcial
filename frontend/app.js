const API_URL = localStorage.getItem('copartApiUrl')
  || document.querySelector('meta[name="api-base-url"]').content.replace(/\/$/, '');
const FALLBACK_IMAGE = 'https://placehold.co/900x560/e8f2fa/1769aa?text=Vehiculo';

function leerSesion() {
  try {
    return {
      token: localStorage.getItem('copartToken'),
      usuario: JSON.parse(localStorage.getItem('copartUsuario') || 'null'),
    };
  } catch (error) {
    localStorage.removeItem('copartToken');
    localStorage.removeItem('copartUsuario');
    return { token: null, usuario: null };
  }
}

const sesionInicial = leerSesion();
const state = {
  token: sesionInicial.token,
  usuario: sesionInicial.usuario,
  vehiculoActual: null,
  indiceFoto: 0,
  timer: null,
  socket: null,
};

const app = document.getElementById('app');
const navLinks = document.getElementById('nav-links');
const toast = document.getElementById('toast');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function dinero(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
}

function fecha(value) {
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function fechaInput(value) {
  const date = value ? new Date(value) : new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function notificar(mensaje, tipo = 'ok') {
  toast.textContent = mensaje;
  toast.className = `toast show ${tipo === 'error' ? 'error' : ''}`;
  clearTimeout(notificar.timeout);
  notificar.timeout = setTimeout(() => { toast.className = 'toast'; }, 3500);
}

async function api(ruta, opciones = {}) {
  const headers = { ...(opciones.body ? { 'Content-Type': 'application/json' } : {}), ...opciones.headers };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const respuesta = await fetch(`${API_URL}${ruta}`, { ...opciones, headers });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    if (respuesta.status === 401 && opciones.protegida) cerrarSesion(false);
    throw new Error(datos.mensaje || 'No fue posible completar la solicitud.');
  }
  return datos;
}

function guardarSesion(datos) {
  state.token = datos.token;
  state.usuario = datos.usuario;
  localStorage.setItem('copartToken', datos.token);
  localStorage.setItem('copartUsuario', JSON.stringify(datos.usuario));
  renderNav();
  conectarSocket();
}

function cerrarSesion(redirigir = true) {
  state.token = null;
  state.usuario = null;
  localStorage.removeItem('copartToken');
  localStorage.removeItem('copartUsuario');
  renderNav();
  conectarSocket();
  if (redirigir) navegar('/inicio');
}

function navegar(ruta) {
  window.location.hash = `#${ruta}`;
}

function rutaActual() {
  return window.location.hash.replace(/^#/, '') || '/inicio';
}

function renderNav() {
  const ruta = rutaActual();
  const enlace = (href, texto) => `<a class="nav-link ${ruta.startsWith(href) ? 'active' : ''}" href="#${href}">${texto}</a>`;
  if (state.usuario) {
    navLinks.innerHTML = `
      ${enlace('/inicio', 'Inicio')}
      ${enlace('/publicar', 'Publicar')}
      ${enlace('/mis-publicaciones', 'Mis publicaciones')}
      <span class="user-chip">Hola, ${escapeHtml(state.usuario.nombre)}</span>
      <button class="button danger" data-action="logout">Cerrar sesión</button>
    `;
  } else {
    navLinks.innerHTML = `
      ${enlace('/inicio', 'Inicio')}
      ${enlace('/login', 'Login')}
      ${enlace('/registro', 'Registro')}
    `;
  }
}

function cargando() {
  app.innerHTML = '<section class="loading-page"><div class="spinner"></div><p>Cargando...</p></section>';
}

function cardVehiculo(vehiculo, editable = false) {
  return `
    <article class="vehicle-card">
      <div class="vehicle-image-wrap">
        <img class="vehicle-image" src="${escapeHtml(vehiculo.fotoPrincipal || FALLBACK_IMAGE)}" alt="${escapeHtml(`${vehiculo.marca} ${vehiculo.modelo}`)}">
        <span class="badge ${escapeHtml(vehiculo.nivelDanio)} damage-badge">${escapeHtml(vehiculo.nivelDanio)}</span>
        <span class="badge neutral status-badge">${escapeHtml(vehiculo.estado)}</span>
      </div>
      <div class="vehicle-body">
        <p class="vehicle-meta">${escapeHtml(vehiculo.anio)} · ${escapeHtml(vehiculo.combustible)}</p>
        <h3 class="vehicle-title">${escapeHtml(vehiculo.marca)} ${escapeHtml(vehiculo.modelo)}</h3>
        <div class="prices">
          <div><span class="price-label">Precio base</span><span class="price-value">${dinero(vehiculo.precioBase)}</span></div>
          <div><span class="price-label">Puja actual</span><span class="price-value" data-current-bid="${vehiculo.id}">${vehiculo.pujaActual ? dinero(vehiculo.pujaActual) : 'Sin ofertas'}</span></div>
        </div>
        <div class="vehicle-actions">
          <a class="button" href="#/detalle/${vehiculo.id}">Ver subasta</a>
          ${editable ? `<a class="button secondary" href="#/editar/${vehiculo.id}">Editar</a>` : ''}
        </div>
      </div>
    </article>
  `;
}

async function renderInicio() {
  cargando();
  try {
    const vehiculos = await api('/api/vehiculos');
    app.innerHTML = `
      <div class="page-shell">
        <section class="hero">
          <p class="eyebrow">Subastas en tiempo real</p>
          <h1>Encuentra tu próximo vehículo, oferta con confianza.</h1>
          <p class="hero-copy">Inventario verificado, información clara y pujas actualizadas al instante para tomar mejores decisiones.</p>
          <div class="hero-stats">
            <div class="hero-stat"><strong>${vehiculos.length}</strong><span>vehículos disponibles</span></div>
            <div class="hero-stat"><strong>10%</strong><span>incremento mínimo</span></div>
            <div class="hero-stat"><strong>Live</strong><span>actualización inmediata</span></div>
          </div>
        </section>

        <div class="section-heading">
          <div><h2>Inventario de subastas</h2><p>Combina filtros para encontrar el lote ideal.</p></div>
        </div>
        <form id="filter-form" class="panel filter-grid">
          <div class="field"><label for="f-anio">Año</label><input id="f-anio" name="anio" type="number" placeholder="2022"></div>
          <div class="field"><label for="f-marca">Marca</label><input id="f-marca" name="marca" placeholder="Toyota"></div>
          <div class="field"><label for="f-modelo">Modelo</label><input id="f-modelo" name="modelo" placeholder="Corolla"></div>
          <div class="field"><label for="f-combustible">Combustible</label><select id="f-combustible" name="combustible"><option value="">Todos</option><option>Gasolina</option><option>Diésel</option><option>Híbrido</option><option>Eléctrico</option></select></div>
          <div class="field"><label for="f-danio">Daño</label><select id="f-danio" name="danio"><option value="">Todos</option><option>VERDE</option><option>AMARILLO</option><option>ROJO</option></select></div>
          <button class="button" type="submit">Filtrar</button>
        </form>
        <div class="section-heading"><p id="result-count">${vehiculos.length} resultados</p></div>
        <section id="vehicle-grid" class="vehicle-grid">${renderCards(vehiculos)}</section>
      </div>
    `;

    document.getElementById('filter-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const params = new URLSearchParams();
      new FormData(event.currentTarget).forEach((value, key) => { if (value) params.set(key, value); });
      try {
        const filtrados = await api(`/api/vehiculos?${params}`);
        document.getElementById('vehicle-grid').innerHTML = renderCards(filtrados);
        document.getElementById('result-count').textContent = `${filtrados.length} resultados`;
      } catch (error) {
        notificar(error.message, 'error');
      }
    });
  } catch (error) {
    renderError(error.message);
  }
}

function renderCards(vehiculos, editable = false) {
  if (!vehiculos.length) return '<div class="empty-state"><h3>No hay vehículos</h3><p>Prueba con otros filtros o publica el primer lote.</p></div>';
  return vehiculos.map((vehiculo) => cardVehiculo(vehiculo, editable)).join('');
}

function renderLogin() {
  app.innerHTML = `
    <section class="auth-layout">
      <aside class="auth-aside"><p class="eyebrow">Bienvenido de vuelta</p><h1>Tu próxima oportunidad está esperando.</h1><p>Accede para ofertar y administrar tus publicaciones.</p><ul><li>Pujas protegidas</li><li>Alertas en tiempo real</li><li>Historial transparente</li></ul></aside>
      <form id="login-form" class="auth-form">
        <h1>Iniciar sesión</h1><p class="form-note">Ingresa tus credenciales para continuar.</p>
        <div class="field"><label for="login-correo">Correo</label><input id="login-correo" name="correo" type="email" required autocomplete="email"></div>
        <div class="field"><label for="login-password">Contraseña</label><input id="login-password" name="password" type="password" required autocomplete="current-password"></div>
        <button class="button full" type="submit">Ingresar</button>
        <p class="form-note">¿No tienes cuenta? <a class="inline-link" href="#/registro">Regístrate</a></p>
      </form>
    </section>`;
  document.getElementById('login-form').addEventListener('submit', autenticar);
}

async function autenticar(event) {
  event.preventDefault();
  const boton = event.currentTarget.querySelector('button[type="submit"]');
  boton.disabled = true;
  try {
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const datos = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(body) });
    guardarSesion(datos);
    notificar('Sesión iniciada correctamente.');
    navegar('/inicio');
  } catch (error) {
    notificar(error.message, 'error');
  } finally {
    boton.disabled = false;
  }
}

function renderRegistro() {
  app.innerHTML = `
    <section class="auth-layout">
      <aside class="auth-aside"><p class="eyebrow">Crea tu cuenta</p><h1>Publica y oferta desde un solo lugar.</h1><p>Tu información se usa únicamente para identificar tus operaciones dentro de la plataforma.</p></aside>
      <form id="register-form" class="auth-form">
        <h1>Registro</h1>
        <div class="form-grid">
          <div class="field"><label for="reg-nombre">Nombre</label><input id="reg-nombre" name="nombre" required></div>
          <div class="field"><label for="reg-apellido">Apellido</label><input id="reg-apellido" name="apellido" required></div>
        </div>
        <div class="field"><label for="reg-correo">Correo</label><input id="reg-correo" name="correo" type="email" required></div>
        <div class="field"><label for="reg-telefono">Teléfono</label><input id="reg-telefono" name="telefono" type="tel" required></div>
        <div class="field"><label for="reg-password">Contraseña</label><input id="reg-password" name="password" type="password" minlength="6" required></div>
        <button class="button full" type="submit">Crear cuenta</button>
      </form>
    </section>`;
  document.getElementById('register-form').addEventListener('submit', registrar);
}

async function registrar(event) {
  event.preventDefault();
  const boton = event.currentTarget.querySelector('button[type="submit"]');
  boton.disabled = true;
  try {
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const datos = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(body) });
    guardarSesion(datos);
    notificar('Cuenta creada correctamente.');
    navegar('/inicio');
  } catch (error) {
    notificar(error.message, 'error');
  } finally {
    boton.disabled = false;
  }
}

async function renderFormularioVehiculo(id = null) {
  if (!state.token) return navegar('/login');
  cargando();
  let vehiculo = null;
  try {
    if (id) {
      vehiculo = await api(`/api/vehiculos/${id}`);
      if (!vehiculo.esPropietario) return renderError('No puedes editar una publicación de otro usuario.');
    }
  } catch (error) {
    return renderError(error.message);
  }
  const fotos = vehiculo?.fotos?.length ? vehiculo.fotos : ['', '', '', '', ''];
  const inicioDefault = new Date(Date.now() + 60 * 60 * 1000);
  const cierreDefault = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const option = (valor, actual) => `<option ${valor === actual ? 'selected' : ''}>${valor}</option>`;

  app.innerHTML = `
    <div class="page-shell form-page">
      <div class="form-header"><p class="eyebrow">${id ? 'Administrar lote' : 'Nuevo lote'}</p><h1>${id ? 'Editar publicación' : 'Publicar vehículo'}</h1><p>Completa la ficha técnica, el estado y las condiciones de la subasta.</p></div>
      <form id="vehicle-form" data-id="${id || ''}">
        <section class="panel form-section"><h2>Ficha técnica</h2><div class="form-grid three">
          <div class="field"><label>Año</label><input name="anio" type="number" min="1900" max="2100" value="${escapeHtml(vehiculo?.anio || '')}" required></div>
          <div class="field"><label>Tipo de artículo</label><input name="tipoArticulo" value="${escapeHtml(vehiculo?.tipoArticulo || 'Automóvil')}" required></div>
          <div class="field"><label>Marca</label><input name="marca" value="${escapeHtml(vehiculo?.marca || '')}" required></div>
          <div class="field"><label>Modelo</label><input name="modelo" value="${escapeHtml(vehiculo?.modelo || '')}" required></div>
          <div class="field"><label>Motor</label><input name="motor" value="${escapeHtml(vehiculo?.motor || '')}" placeholder="2.0L Turbo" required></div>
          <div class="field"><label>Transmisión</label><input name="transmision" value="${escapeHtml(vehiculo?.transmision || '')}" placeholder="Automática" required></div>
          <div class="field"><label>Combustible</label><select name="combustible" required>${['Gasolina','Diésel','Híbrido','Eléctrico'].map((v) => option(v, vehiculo?.combustible)).join('')}</select></div>
          <div class="field"><label>Tren de manejo</label><select name="trenManejo" required>${['AWD','FWD','RWD','4WD'].map((v) => option(v, vehiculo?.trenManejo)).join('')}</select></div>
          <div class="field"><label>Cilindros</label><input name="cilindros" type="number" min="1" max="24" value="${escapeHtml(vehiculo?.cilindros || 4)}" required></div>
        </div></section>
        <section class="panel form-section"><h2>Daño y subasta</h2><div class="form-grid">
          <div class="field"><label>Nivel de daño</label><select name="nivelDanio" required>${['VERDE','AMARILLO','ROJO'].map((v) => option(v, vehiculo?.nivelDanio)).join('')}</select></div>
          <div class="field"><label>Precio base (USD)</label><input name="precioBase" type="number" min="0.01" step="0.01" value="${escapeHtml(vehiculo?.precioBase || '')}" required></div>
          <div class="field"><label>Fecha y hora de inicio</label><input name="fechaInicio" type="datetime-local" value="${fechaInput(vehiculo?.fechaInicio || inicioDefault)}" required></div>
          <div class="field"><label>Fecha y hora de cierre</label><input name="fechaCierre" type="datetime-local" value="${fechaInput(vehiculo?.fechaCierre || cierreDefault)}" required></div>
        </div></section>
        <section class="panel form-section"><h2>Galería <small class="form-note">(mínimo 5 URLs)</small></h2>
          <div id="photo-list" class="photo-list">${fotos.map((url, i) => campoFoto(url, i)).join('')}</div>
          <button class="button secondary" type="button" data-action="add-photo">Agregar otra foto</button>
        </section>
        <div class="form-actions"><a class="button secondary" href="#/${id ? 'mis-publicaciones' : 'inicio'}">Cancelar</a><button class="button" type="submit">${id ? 'Guardar cambios' : 'Publicar vehículo'}</button></div>
      </form>
    </div>`;
  document.getElementById('vehicle-form').addEventListener('submit', guardarVehiculo);
}

function campoFoto(url = '', indice = document.querySelectorAll('.photo-url').length) {
  return `<div class="field"><label>Foto ${indice + 1}</label><input class="photo-url" type="url" value="${escapeHtml(url)}" placeholder="https://..." required></div>`;
}

async function guardarVehiculo(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.dataset.id;
  const datos = Object.fromEntries(new FormData(form));
  datos.anio = Number(datos.anio);
  datos.cilindros = Number(datos.cilindros);
  datos.precioBase = Number(datos.precioBase);
  datos.fechaInicio = new Date(datos.fechaInicio).toISOString();
  datos.fechaCierre = new Date(datos.fechaCierre).toISOString();
  datos.fotos = [...form.querySelectorAll('.photo-url')].map((input) => input.value.trim()).filter(Boolean);
  const boton = form.querySelector('button[type="submit"]');
  boton.disabled = true;
  try {
    const resultado = await api(id ? `/api/vehiculos/${id}` : '/api/vehiculos', {
      method: id ? 'PUT' : 'POST', body: JSON.stringify(datos), protegida: true,
    });
    notificar(resultado.mensaje);
    navegar(`/detalle/${resultado.id}`);
  } catch (error) {
    notificar(error.message, 'error');
  } finally {
    boton.disabled = false;
  }
}

async function renderMisPublicaciones() {
  if (!state.token) return navegar('/login');
  cargando();
  try {
    const vehiculos = await api('/api/mis-vehiculos', { protegida: true });
    app.innerHTML = `<div class="page-shell"><div class="section-heading"><div><p class="eyebrow">Panel del propietario</p><h1>Mis publicaciones</h1><p>Consulta o edita tus lotes publicados.</p></div><a class="button" href="#/publicar">Nueva publicación</a></div><section class="vehicle-grid">${renderCards(vehiculos, true)}</section></div>`;
  } catch (error) {
    renderError(error.message);
  }
}

async function renderDetalle(id) {
  cargando();
  clearInterval(state.timer);
  try {
    const [vehiculo, pujas] = await Promise.all([
      api(`/api/vehiculos/${id}`),
      api(`/api/vehiculos/${id}/pujas`),
    ]);
    state.vehiculoActual = vehiculo;
    state.indiceFoto = 0;
    const minimo = calcularMinimo(vehiculo);
    app.innerHTML = `
      <div class="page-shell">
        <div class="detail-head"><a class="back-link" href="#/inicio">← Volver al inventario</a><span class="badge neutral">${escapeHtml(vehiculo.estado)}</span></div>
        <div class="detail-grid">
          <div>
            <section class="panel gallery">
              <div class="gallery-main"><img id="gallery-main" src="${escapeHtml(vehiculo.fotos[0] || FALLBACK_IMAGE)}" alt="${escapeHtml(`${vehiculo.marca} ${vehiculo.modelo}`)}"><div class="gallery-nav"><button class="gallery-button" data-action="prev-photo" aria-label="Foto anterior">‹</button><button class="gallery-button" data-action="next-photo" aria-label="Foto siguiente">›</button></div></div>
              <div id="thumbnails" class="thumbnails">${vehiculo.fotos.map((url, i) => `<button class="thumbnail ${i === 0 ? 'active' : ''}" data-photo="${i}"><img src="${escapeHtml(url)}" alt="Vista ${i + 1}"></button>`).join('')}</div>
            </section>
            <section class="panel specs"><h2>Ficha técnica</h2><div class="spec-grid">
              ${spec('Año', vehiculo.anio)}${spec('Tipo', vehiculo.tipoArticulo)}${spec('Marca', vehiculo.marca)}${spec('Modelo', vehiculo.modelo)}
              ${spec('Motor', vehiculo.motor)}${spec('Transmisión', vehiculo.transmision)}${spec('Combustible', vehiculo.combustible)}${spec('Tren', vehiculo.trenManejo)}
              ${spec('Cilindros', vehiculo.cilindros)}${spec('Daño', vehiculo.nivelDanio)}${spec('Inicio', fecha(vehiculo.fechaInicio))}${spec('Cierre', fecha(vehiculo.fechaCierre))}
            </div></section>
            <section class="panel history"><h2>Actividad de pujas</h2><div id="bid-history">${renderHistorial(pujas)}</div></section>
          </div>
          <aside class="panel bid-panel">
            <p class="eyebrow">Lote #${vehiculo.id}</p><h1>${escapeHtml(vehiculo.marca)} ${escapeHtml(vehiculo.modelo)}</h1><p class="lot-line">${vehiculo.anio} · ${escapeHtml(vehiculo.tipoArticulo)} · <span class="badge ${escapeHtml(vehiculo.nivelDanio)}">${escapeHtml(vehiculo.nivelDanio)}</span></p>
            <div class="current-bid"><span>Puja actual</span><strong id="detail-current-bid">${vehiculo.pujaActual ? dinero(vehiculo.pujaActual) : dinero(vehiculo.precioBase)}</strong></div>
            <p class="form-note">Precio base: ${dinero(vehiculo.precioBase)}</p>
            <div id="countdown" class="countdown">Calculando tiempo...</div>
            <div id="live-status">${vehiculo.miOfertaEsLider ? '<div class="live-message win">¡Vas ganando esta subasta!</div>' : ''}</div>
            ${renderOferta(vehiculo, minimo)}
          </aside>
        </div>
      </div>`;
    const form = document.getElementById('bid-form');
    if (form) form.addEventListener('submit', ofertar);
    iniciarTemporizador();
  } catch (error) {
    renderError(error.message);
  }
}

function spec(etiqueta, valor) {
  return `<div class="spec"><span>${etiqueta}</span><strong>${escapeHtml(valor)}</strong></div>`;
}

function calcularMinimo(vehiculo) {
  if (!vehiculo.pujaActual) return (Math.round(Number(vehiculo.precioBase) * 100) + 1) / 100;
  const actualCentavos = Math.round(Number(vehiculo.pujaActual) * 100);
  return Math.ceil((actualCentavos * 110) / 100) / 100;
}

function renderOferta(vehiculo, minimo) {
  if (vehiculo.estado === 'FINALIZADA' || vehiculo.estado === 'DESIERTA') return '<div class="live-message lose">Subasta cerrada</div>';
  if (vehiculo.estado === 'PROGRAMADA') return `<p class="form-note">La subasta aún no ha iniciado. Regresa el ${fecha(vehiculo.fechaInicio)}.</p>`;
  if (!state.token) return '<p class="form-note">Debes <a class="inline-link" href="#/login">iniciar sesión</a> para ofertar.</p>';
  if (vehiculo.esPropietario) return '<p class="form-note">Eres el propietario de este lote y no puedes ofertar en él.</p>';
  return `<form id="bid-form" class="bid-form"><input id="bid-amount" name="monto" type="number" min="${minimo.toFixed(2)}" step="0.01" value="${minimo.toFixed(2)}" required><button class="button" type="submit">Ofertar</button></form><p id="minimum-label" class="minimum">Oferta mínima: ${dinero(minimo)}</p>`;
}

function renderHistorial(pujas) {
  if (!pujas.length) return '<p class="form-note">Aún no hay ofertas.</p>';
  return pujas.slice(0, 8).map((puja) => `<div class="history-row"><strong>${dinero(puja.monto)}</strong><span>${fecha(puja.fecha)}</span></div>`).join('');
}

async function ofertar(event) {
  event.preventDefault();
  const boton = event.currentTarget.querySelector('button');
  boton.disabled = true;
  try {
    const monto = Number(new FormData(event.currentTarget).get('monto'));
    const resultado = await api(`/api/vehiculos/${state.vehiculoActual.id}/pujas`, {
      method: 'POST', body: JSON.stringify({ monto }), protegida: true,
    });
    actualizarPujaEnDetalle(resultado.montoActual);
    mostrarEstadoPuja('GANANDO');
    notificar('Oferta registrada correctamente.');
    const pujas = await api(`/api/vehiculos/${state.vehiculoActual.id}/pujas`);
    document.getElementById('bid-history').innerHTML = renderHistorial(pujas);
  } catch (error) {
    notificar(error.message, 'error');
  } finally {
    boton.disabled = false;
  }
}

function actualizarPujaEnDetalle(monto) {
  if (!state.vehiculoActual) return;
  state.vehiculoActual.pujaActual = Number(monto);
  const actual = document.getElementById('detail-current-bid');
  if (actual) actual.textContent = dinero(monto);
  const minimo = calcularMinimo(state.vehiculoActual);
  const input = document.getElementById('bid-amount');
  const label = document.getElementById('minimum-label');
  if (input) { input.min = minimo.toFixed(2); input.value = minimo.toFixed(2); }
  if (label) label.textContent = `Oferta mínima: ${dinero(minimo)}`;
}

function mostrarEstadoPuja(indicador) {
  const contenedor = document.getElementById('live-status');
  if (!contenedor) return;
  contenedor.innerHTML = indicador === 'GANANDO'
    ? '<div class="live-message win">¡Vas ganando esta subasta!</div>'
    : '<div class="live-message lose">Tu oferta ha sido superada. ¡Haz tu oferta ahora antes de que termine el tiempo!</div>';
}

function iniciarTemporizador() {
  clearInterval(state.timer);
  const actualizar = () => {
    const contenedor = document.getElementById('countdown');
    if (!contenedor || !state.vehiculoActual) return;
    const ahora = Date.now();
    const inicio = new Date(state.vehiculoActual.fechaInicio).getTime();
    const cierre = new Date(state.vehiculoActual.fechaCierre).getTime();
    const objetivo = ahora < inicio ? inicio : cierre;
    const diferencia = objetivo - ahora;
    if (diferencia <= 0 && ahora >= cierre) {
      contenedor.textContent = 'Subasta cerrada';
      const form = document.getElementById('bid-form');
      if (form) form.querySelectorAll('input, button').forEach((elemento) => { elemento.disabled = true; });
      clearInterval(state.timer);
      return;
    }
    if (diferencia <= 0) return renderDetalle(state.vehiculoActual.id);
    const dias = Math.floor(diferencia / 86400000);
    const horas = Math.floor((diferencia % 86400000) / 3600000);
    const minutos = Math.floor((diferencia % 3600000) / 60000);
    const segundos = Math.floor((diferencia % 60000) / 1000);
    contenedor.textContent = `${ahora < inicio ? 'Inicia en' : 'Termina en'} ${dias}d ${horas}h ${minutos}m ${segundos}s`;
  };
  actualizar();
  state.timer = setInterval(actualizar, 1000);
}

function cambiarFoto(direccion, absoluta = false) {
  const fotos = state.vehiculoActual?.fotos || [];
  if (!fotos.length) return;
  if (absoluta) state.indiceFoto = direccion;
  else state.indiceFoto = (state.indiceFoto + direccion + fotos.length) % fotos.length;
  const principal = document.getElementById('gallery-main');
  if (principal) principal.src = fotos[state.indiceFoto];
  document.querySelectorAll('.thumbnail').forEach((item, index) => item.classList.toggle('active', index === state.indiceFoto));
}

function renderError(mensaje) {
  app.innerHTML = `<div class="page-shell"><div class="empty-state"><h3>No pudimos cargar esta sección</h3><p>${escapeHtml(mensaje)}</p><a class="button" href="#/inicio">Volver al inicio</a></div></div>`;
}

function conectarSocket() {
  if (state.socket) state.socket.disconnect();
  if (typeof io === 'undefined') return;
  state.socket = io(API_URL, { auth: { token: state.token } });
  state.socket.on('puja-actualizada', (evento) => {
    document.querySelectorAll(`[data-current-bid="${evento.vehicleId}"]`).forEach((elemento) => { elemento.textContent = dinero(evento.montoActual); });
    if (state.vehiculoActual?.id === Number(evento.vehicleId)) actualizarPujaEnDetalle(evento.montoActual);
  });
  state.socket.on('estado-puja', (evento) => {
    if (state.vehiculoActual?.id === Number(evento.vehicleId)) mostrarEstadoPuja(evento.indicador);
  });
}

async function renderRuta() {
  renderNav();
  navLinks.classList.remove('open');
  document.getElementById('menu-button').setAttribute('aria-expanded', 'false');
  clearInterval(state.timer);
  const ruta = rutaActual();
  if (ruta === '/inicio' || ruta === '/') return renderInicio();
  if (ruta === '/login') return state.token ? navegar('/inicio') : renderLogin();
  if (ruta === '/registro') return state.token ? navegar('/inicio') : renderRegistro();
  if (ruta === '/publicar') return renderFormularioVehiculo();
  if (ruta === '/mis-publicaciones') return renderMisPublicaciones();
  if (ruta.startsWith('/detalle/')) return renderDetalle(ruta.split('/')[2]);
  if (ruta.startsWith('/editar/')) return renderFormularioVehiculo(ruta.split('/')[2]);
  return renderError('La página solicitada no existe.');
}

document.addEventListener('click', (event) => {
  const logout = event.target.closest('[data-action="logout"]');
  if (logout) cerrarSesion();
  const menu = event.target.closest('#menu-button');
  if (menu) {
    navLinks.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(navLinks.classList.contains('open')));
  }
  if (event.target.closest('[data-action="add-photo"]')) {
    document.getElementById('photo-list').insertAdjacentHTML('beforeend', campoFoto());
  }
  if (event.target.closest('[data-action="prev-photo"]')) cambiarFoto(-1);
  if (event.target.closest('[data-action="next-photo"]')) cambiarFoto(1);
  const miniatura = event.target.closest('[data-photo]');
  if (miniatura) cambiarFoto(Number(miniatura.dataset.photo), true);
});

document.addEventListener('error', (event) => {
  if (event.target.tagName === 'IMG' && event.target.src !== FALLBACK_IMAGE) event.target.src = FALLBACK_IMAGE;
}, true);

window.addEventListener('hashchange', renderRuta);
renderNav();
conectarSocket();
renderRuta();
