/* Utilidades compartidas: barra superior, login, toasts, modal de empresa, catálogos. */
(function () {
  const UI = {};
  UI.el = function (tag, attrs = {}, ...hijos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'html') e.innerHTML = v;
      else if (k in e && k !== 'list') e[k] = v;
      else e.setAttribute(k, v);
    }
    for (const h of hijos.flat()) if (h != null && h !== false) e.append(h.nodeType ? h : document.createTextNode(h));
    return e;
  };
  UI.dinero = n => (n == null || isNaN(n)) ? '—' : '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  UI.toast = function (msg, ms = 2800) {
    const t = UI.el('div', { class: 'toast' }, msg); document.body.append(t); setTimeout(() => t.remove(), ms);
  };

  UI.topbar = function (activo) {
    const h = document.querySelector('header.topbar');
    h.innerHTML = '';
    h.append(
      UI.el('div', { class: 'titulo' }, UI.el('span', { class: 'logo' }, 'FF'), 'Folios de Facturación'),
      UI.el('nav', {},
        UI.el('a', { href: 'index.html', class: activo === 'generar' ? 'activo' : '' }, '📄 Generar folios'),
        UI.el('a', { href: 'backlog.html', class: activo === 'backlog' ? 'activo' : '' }, '🗂️ Backlog de empresas')),
      UI.el('div', { class: 'usuario', id: 'usuario' }));
    UI.frases();
  };

  /* ---- Frases motivacionales corporativas (rotan cada 12 s) ---- */
  UI.FRASES = [
    'La precisión de hoy es la confianza de nuestros clientes mañana.',
    'Cada folio bien hecho es una promesa cumplida.',
    'Los grandes resultados se construyen con pequeños detalles bien cuidados.',
    'Trabajar en equipo multiplica lo que ninguno lograría solo.',
    'La excelencia no es un acto, es un hábito que se practica a diario.',
    'Hacerlo bien a la primera es la forma más rápida de avanzar.',
    'Nuestro orden interno es el servicio que el cliente no ve, pero siente.',
    'Cada número correcto protege la reputación de toda la empresa.',
    'La mejora continua empieza con una pregunta: ¿cómo lo hago mejor?',
    'El compromiso se nota en lo que entregamos, no en lo que prometemos.',
    'Simplificar procesos es dar tiempo para lo que de verdad importa.',
    'Un buen día de trabajo se mide en problemas resueltos.',
    'La disciplina en lo cotidiano es la base del crecimiento.',
    'Somos tan fuertes como la calidad de nuestro trabajo en conjunto.',
    'Revisar dos veces es respetar el trabajo de todos.',
    'El éxito es la suma de esfuerzos pequeños repetidos todos los días.',
  ];
  UI.frases = function () {
    const main = document.querySelector('main');
    if (!main || document.querySelector('.frases')) return;
    let i = Math.floor(Math.random() * UI.FRASES.length), timer;
    const texto = UI.el('div', { class: 'texto' });
    const relleno = UI.el('div');
    const cont = UI.el('div', { class: 'frases' },
      UI.el('div', { class: 'encabezado' }, UI.el('span', { class: 'dot' }), '💡 Frase del día',
        UI.el('button', { title: 'Otra frase', onclick: () => siguiente() }, 'Siguiente →')),
      texto, UI.el('div', { class: 'barra' }, relleno));
    const animar = () => {
      relleno.style.transition = 'none'; relleno.style.width = '0';
      requestAnimationFrame(() => requestAnimationFrame(() => { relleno.style.transition = 'width 12s linear'; relleno.style.width = '100%'; }));
    };
    const mostrar = () => { texto.textContent = '“' + UI.FRASES[i] + '”'; animar(); };
    const siguiente = () => {
      clearTimeout(timer);
      texto.classList.add('salir');
      setTimeout(() => { i = (i + 1) % UI.FRASES.length; mostrar(); texto.classList.remove('salir'); }, 350);
      timer = setTimeout(siguiente, 12000);
    };
    mostrar(); timer = setTimeout(siguiente, 12000);
    main.prepend(cont);
  };

  /** Muestra login si hace falta. Resuelve cuando hay sesión. */
  UI.requerirSesion = async function () {
    const cont = document.getElementById('usuario');
    const ses = await Datos.sesion();
    if (Datos.modo === 'local') {
      cont.append(UI.el('span', { title: 'Configura Supabase en js/config.js para compartir los datos' }, '💻 Modo local'));
      return;
    }
    if (ses) {
      cont.append(UI.el('span', {}, '👤 ' + ses.user.email), UI.el('button', { onclick: () => Datos.logout() }, 'Salir'));
      return;
    }
    const app = document.getElementById('app'); app.classList.add('oculto');
    await new Promise(resolve => {
      const msg = UI.el('div', { class: 'aviso rojo oculto' });
      const email = UI.el('input', { type: 'email', placeholder: 'correo@empresa.com', autocomplete: 'username' });
      const pass = UI.el('input', { type: 'password', placeholder: 'Contraseña', autocomplete: 'current-password' });
      const card = UI.el('div', { class: 'tarjeta login' },
        UI.el('h2', {}, '🔐 Iniciar sesión'),
        UI.el('p', { class: 'ayuda' }, 'Usa el mismo correo y contraseña de Supabase.'),
        UI.el('label', {}, 'Correo'), email, UI.el('div', { style: 'height:12px' }),
        UI.el('label', {}, 'Contraseña'), pass, msg,
        UI.el('div', { class: 'acciones' }, UI.el('button', {
          class: 'btn grande', onclick: async () => {
            try { await Datos.login(email.value.trim(), pass.value); location.reload(); }
            catch (e) { msg.textContent = '⚠️ ' + e.message; msg.classList.remove('oculto'); }
          }
        }, 'Entrar')));
      pass.addEventListener('keydown', e => { if (e.key === 'Enter') card.querySelector('.btn').click(); });
      app.parentNode.insertBefore(card, app);
    });
  };

  let _cat = null;
  UI.catalogos = async function () {
    if (_cat) return _cat;
    const [ps, un, cat] = await Promise.all(['data/sat_prodserv.json', 'data/sat_unidades.json', 'data/catalogos.json'].map(u => fetch(u).then(r => r.json())));
    _cat = { prodServ: ps, unidades: un, ...cat };
    return _cat;
  };
  UI.nombreUnidad = function (motor, clave) {
    const c = String(clave || '').toUpperCase().trim();
    return window.CONFIG.NOMBRES_UNIDAD[c] || (motor.descUnidad(c) || '').toUpperCase();
  };

  /** Modal con el formulario de una empresa. Resuelve con el objeto guardado o null. */
  UI.formEmpresa = async function (tabla, inicial = {}) {
    const cat = await UI.catalogos();
    const campos = Datos.CAMPOS[tabla];
    return new Promise(resolve => {
      const inputs = {};
      const rej = UI.el('div', { class: 'rejilla' });
      for (const c of campos) {
        let inp;
        if (c.tipo) {
          inp = UI.el('select', {}, UI.el('option', { value: '' }, '— Usar el general —'), ...cat[c.tipo].map(o => UI.el('option', { value: o }, o)));
        } else inp = UI.el('input', { type: 'text' });
        inp.value = inicial[c.k] ?? '';
        inputs[c.k] = inp;
        rej.append(UI.el('div', { class: ['direccion', 'alias'].includes(c.k) ? 'ancho' : '' },
          UI.el('label', {}, c.l, c.req ? ' *' : '', c.nota ? UI.el('span', { class: 'nota' }, `(${c.nota})`) : ''), inp));
      }
      const msg = UI.el('div', { class: 'aviso rojo oculto' });
      const cerrar = v => { fondo.remove(); resolve(v); };
      const guardar = async () => {
        const o = { ...inicial };
        for (const c of campos) o[c.k] = inputs[c.k].value.trim();
        if (o.rfc) o.rfc = o.rfc.toUpperCase();
        const falta = campos.filter(c => c.req && !o[c.k]).map(c => c.l);
        if (falta.length) { msg.textContent = '⚠️ Falta: ' + falta.join(', '); msg.classList.remove('oculto'); return; }
        try { cerrar(await Datos.guardar(tabla, o)); UI.toast('✅ Guardado'); }
        catch (e) { msg.textContent = '⚠️ ' + e.message; msg.classList.remove('oculto'); }
      };
      const titulo = (inicial.id ? '✏️ Editar ' : '➕ Nueva ') + (tabla === 'emisoras' ? 'empresa facturadora (emisora)' : 'empresa cliente (receptora)');
      const fondo = UI.el('div', { class: 'modal-fondo' },
        UI.el('div', { class: 'modal' }, UI.el('h3', {}, titulo), rej, msg,
          UI.el('div', { class: 'acciones' },
            UI.el('button', { class: 'btn', onclick: guardar }, '💾 Guardar'),
            UI.el('button', { class: 'btn sec', onclick: () => cerrar(null) }, 'Cancelar'))));
      document.body.append(fondo);
      setTimeout(() => inputs[campos[0].k].focus(), 30);
    });
  };

  window.UI = UI;
})();
