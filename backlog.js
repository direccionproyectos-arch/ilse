/* Backlog: empresas emisoras, receptoras y códigos SAT aprendidos. */
(async function () {
  const { el, toast } = UI;
  const $ = id => document.getElementById(id);
  UI.topbar('backlog');
  await UI.requerirSesion();

  const cat = await UI.catalogos();
  const motor = new SAT.MotorSAT(cat.prodServ, cat.unidades);
  let tab = new URLSearchParams(location.search).get('t') || 'emisoras';
  let datos = [];

  const INFO = {
    emisoras: ['🏢 Empresas facturadoras (emisoras)', 'Aparecen en el desplegable "Empresa facturadora". En "Otros nombres" pon cómo viene escrita en las imágenes (ej. CORPORATION HOWITZER) para que se seleccione sola.',
      [['nombre', 'Nombre'], ['nombre_archivo', 'Nombre corto'], ['alias', 'Otros nombres']]],
    receptoras: ['👥 Empresas cliente (receptoras)', 'Aparecen en el desplegable "Cliente" de cada factura. Sus datos (RFC, dirección, etc.) llenan el Excel automáticamente.',
      [['nombre', 'Nombre'], ['rfc', 'RFC'], ['ciudad', 'Ciudad'], ['alias', 'Otros nombres'], ['uso_cfdi', 'Uso CFDI']]],
    conceptos: ['🧠 Códigos SAT aprendidos', 'Cada vez que se descarga un Excel, el sistema guarda qué código SAT y unidad se usaron para cada concepto. La próxima vez que aparezca ese concepto lo pone solo. Aquí puedes corregirlos o agregarlos.',
      [['concepto_ejemplo', 'Concepto'], ['clave_prod_serv', 'Código SAT'], ['descripcion_prod_serv', 'Descripción SAT'], ['clave_unidad', 'Unidad'], ['usos', 'Veces usado']]],
  };

  async function cargar() {
    try { datos = await Datos.listar(tab); } catch (e) { datos = []; toast('⚠️ ' + e.message, 6000); }
    pintar();
  }
  function pintar() {
    const [titulo, ayuda, cols] = INFO[tab];
    $('titulo').textContent = titulo; $('ayuda').textContent = ayuda;
    document.querySelectorAll('#pestanas button').forEach(b => b.classList.toggle('activo', b.dataset.t === tab));
    const q = $('buscar').value.trim().toLowerCase();
    const filas = datos.filter(d => !q || JSON.stringify(d).toLowerCase().includes(q));
    const t = $('tabla'); t.innerHTML = '';
    t.append(el('thead', {}, el('tr', {}, ...cols.map(([, l]) => el('th', {}, l)), el('th', {}, ''))));
    const tb = el('tbody');
    if (!filas.length) tb.append(el('tr', {}, el('td', { colspan: cols.length + 1, style: 'color:var(--suave);padding:22px 10px' }, datos.length ? 'Sin resultados.' : 'Todavía no hay registros. Usa ➕ Agregar.')));
    filas.forEach(d => tb.append(el('tr', {},
      ...cols.map(([k]) => el('td', {}, d[k] == null || d[k] === '' ? '—' : String(d[k]))),
      el('td', { style: 'white-space:nowrap;text-align:right' },
        el('button', { class: 'btn sec', style: 'padding:7px 12px', onclick: () => editar(d) }, '✏️ Editar'), ' ',
        el('button', { class: 'btn peligro', onclick: async () => { if (confirm('¿Eliminar este registro?')) { await Datos.borrar(tab, d.id); toast('🗑️ Eliminado'); cargar(); } } }, '🗑️')))));
    t.append(tb);
  }
  async function editar(d = {}) {
    if (tab === 'conceptos') { if (await formConcepto(d)) cargar(); return; }
    if (await UI.formEmpresa(tab, d)) cargar();
  }

  function formConcepto(inicial) {
    return new Promise(resolve => {
      const concepto = el('input', { type: 'text', value: inicial.concepto_ejemplo || '' });
      const clave = el('input', { type: 'text', value: inicial.clave_prod_serv || '' });
      const desc = el('div', { class: 'desc-sat' });
      const unidad = el('input', { type: 'text', value: inicial.clave_unidad || window.CONFIG.DEFAULTS.claveUnidad, style: 'text-transform:uppercase' });
      const descU = el('div', { class: 'desc-sat' });
      const suger = el('div', { class: 'combo-lista oculto', style: 'position:static;width:100%;margin-top:6px' });
      const actualizar = () => {
        desc.textContent = motor.descProdServ(clave.value.trim()).toUpperCase() || '⚠️ Código no existe';
        descU.textContent = UI.nombreUnidad(motor, unidad.value) || '⚠️ Unidad no existe';
      };
      const buscarSug = txt => {
        const r = motor.buscar(txt, 12, { preferirServicios: window.CONFIG.PREFERIR_SERVICIOS });
        suger.innerHTML = ''; suger.classList.toggle('oculto', !r.length);
        r.forEach(a => suger.append(el('div', { onclick: () => { clave.value = a.clave; actualizar(); suger.classList.add('oculto'); } }, el('b', {}, a.clave), a.descripcion)));
      };
      clave.oninput = () => { actualizar(); if (!/^\d{8}$/.test(clave.value.trim())) buscarSug(clave.value); };
      unidad.oninput = actualizar;
      concepto.onchange = () => { if (!clave.value) buscarSug(concepto.value); };
      actualizar();
      const msg = el('div', { class: 'aviso rojo oculto' });
      const cerrar = v => { fondo.remove(); resolve(v); };
      const fondo = el('div', { class: 'modal-fondo' }, el('div', { class: 'modal' },
        el('h3', {}, inicial.id ? '✏️ Editar código aprendido' : '➕ Enseñar un código SAT'),
        el('label', {}, 'Concepto ', el('span', { class: 'nota' }, '(como viene en las imágenes, sin la referencia)')), concepto,
        el('div', { style: 'height:14px' }),
        el('div', { class: 'rejilla' },
          el('div', {}, el('label', {}, 'Código SAT ', el('span', { class: 'nota' }, '(escribe el código o una palabra)')), clave, desc),
          el('div', {}, el('label', {}, 'Unidad SAT'), unidad, descU)),
        suger, msg,
        el('div', { class: 'acciones' },
          el('button', {
            class: 'btn', onclick: async () => {
              const k = clave.value.trim(), u = unidad.value.trim().toUpperCase();
              const err = [];
              if (!concepto.value.trim()) err.push('el concepto');
              if (!motor.descProdServ(k)) err.push('un código SAT válido');
              if (!motor.descUnidad(u)) err.push('una unidad válida');
              if (err.length) { msg.textContent = '⚠️ Falta ' + err.join(', '); msg.classList.remove('oculto'); return; }
              try {
                cerrar(await Datos.guardar('conceptos', {
                  ...inicial, concepto_normalizado: SAT.normalizarConcepto(concepto.value), concepto_ejemplo: concepto.value.trim().toUpperCase(),
                  clave_prod_serv: k, descripcion_prod_serv: motor.descProdServ(k), clave_unidad: u, descripcion_unidad: UI.nombreUnidad(motor, u), usos: inicial.usos || 0,
                }));
                toast('✅ Guardado');
              } catch (e) { msg.textContent = '⚠️ ' + e.message; msg.classList.remove('oculto'); }
            }
          }, '💾 Guardar'),
          el('button', { class: 'btn sec', onclick: () => cerrar(null) }, 'Cancelar'))));
      document.body.append(fondo);
    });
  }

  document.querySelectorAll('#pestanas button').forEach(b => b.onclick = () => { tab = b.dataset.t; $('buscar').value = ''; history.replaceState(null, '', '?t=' + tab); cargar(); });
  $('buscar').oninput = pintar;
  $('btnNuevo').onclick = () => editar({});
  $('btnExportar').onclick = async () => {
    const blob = new Blob([JSON.stringify(await Datos.exportar(), null, 1)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `backlog_folios_${new Date().toLocaleDateString('en-CA')}.json` });
    document.body.append(a); a.click(); a.remove();
  };
  $('btnImportar').onclick = () => $('archivoImportar').click();
  $('archivoImportar').onchange = async e => {
    try { await Datos.importar(JSON.parse(await e.target.files[0].text())); toast('✅ Respaldo importado'); cargar(); }
    catch (er) { toast('⚠️ ' + er.message, 6000); }
    e.target.value = '';
  };
  cargar();
})();
