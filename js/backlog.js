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
      [['nombre', 'Nombre'], ['rfc', 'RFC'], ['nombre_archivo', 'Nombre corto'], ['alias', 'Otros nombres']]],
    receptoras: ['👥 Empresas cliente (receptoras)', 'Aparecen en el desplegable "Cliente" de cada factura. Sus datos (RFC, dirección, etc.) llenan el Excel automáticamente.',
      [['nombre', 'Nombre'], ['rfc', 'RFC'], ['ciudad', 'Ciudad'], ['alias', 'Otros nombres'], ['uso_cfdi', 'Uso CFDI']]],
    conceptos: ['🧠 Códigos SAT aprendidos', 'Cada vez que se descarga un Excel, el sistema guarda qué código SAT y unidad se usaron para cada concepto. La próxima vez que aparezca ese concepto lo pone solo. Aquí puedes corregirlos o agregarlos.',
      [['concepto_ejemplo', 'Concepto'], ['clave_prod_serv', 'Código SAT'], ['descripcion_prod_serv', 'Descripción SAT'], ['clave_unidad', 'Unidad'], ['usos', 'Veces usado']]],
  };

  async function cargar() {
    const esXml = tab === 'xml';
    $('tarjetaXml').classList.toggle('oculto', !esXml);
    $('tarjetaLista').classList.toggle('oculto', esXml);
    document.querySelectorAll('#pestanas button').forEach(b => b.classList.toggle('activo', b.dataset.t === tab));
    if (esXml) return;
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
  /* ================= Importar desde XML ================= */
  const ETIQ = { nombre: 'nombre', rfc: 'RFC', cp: 'C.P.', uso_cfdi: 'uso de CFDI', forma_pago: 'forma de pago', metodo_pago: 'método de pago' };
  const sinRef = t => String(t).replace(/\s*\bREF(ERENCIA)?\b\s*:?.*$/i, '').trim() || String(t);
  const opcionDe = (lista, clave) => clave ? (lista.find(o => o.startsWith(clave + ' - ')) || '') : '';
  const dz = $('dropXml'), fx = $('archivoXml');
  dz.onclick = () => fx.click();
  fx.onchange = () => { procesarXml([...fx.files]); fx.value = ''; };
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('sobre'); };
  dz.ondragleave = () => dz.classList.remove('sobre');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('sobre'); procesarXml([...e.dataTransfer.files]); };

  async function procesarXml(files) {
    const res = $('resultadoXml');
    if (!files.length) return;
    res.innerHTML = ''; res.append(el('div', { class: 'aviso violeta' }, `⏳ Leyendo ${files.length} archivo(s)…`));
    const { cfdis, errores } = await LectorXML.leerArchivos(files);
    const [emisoras, receptoras, conceptos] = await Promise.all(['emisoras', 'receptoras', 'conceptos'].map(t => Datos.listar(t).catch(() => [])));
    // Del más reciente al más antiguo: los datos más nuevos ganan
    cfdis.sort((a, b) => String(b.comprobante.fecha).localeCompare(String(a.comprobante.fecha)));

    // ---- Clientes (receptores)
    const cli = new Map();
    for (const c of cfdis) {
      const r = c.receptor; if (!r.rfc) continue;
      if (!cli.has(r.rfc)) cli.set(r.rfc, {
        datos: { nombre: r.nombre.toUpperCase(), rfc: r.rfc, cp: r.cp,
          uso_cfdi: opcionDe(cat.usoCfdi, r.usoCfdi), forma_pago: opcionDe(cat.formaPago, c.comprobante.formaPago),
          metodo_pago: opcionDe(cat.metodoPago, c.comprobante.metodoPago) },
        n: 0,
      });
      cli.get(r.rfc).n++;
    }
    const filasCli = [...cli.values()].map(({ datos, n }) => {
      const prev = receptoras.find(x => (x.rfc || '').toUpperCase() === datos.rfc) || Datos.buscarEmpresa(receptoras, datos.nombre);
      if (!prev) return { datos, n, prev: null, estado: '🆕 Nuevo', marcado: true };
      const nuevos = Object.keys(datos).filter(k => datos[k] && !prev[k]);
      return nuevos.length
        ? { datos, n, prev, nuevos, estado: '➕ Completar: ' + nuevos.map(k => ETIQ[k] || k).join(', '), marcado: true }
        : { datos, n, prev, estado: '✔️ Ya existe', marcado: false };
    });

    // ---- Facturadoras (emisores)
    const emi = new Map();
    for (const c of cfdis) { const e = c.emisor; if (e.rfc && !emi.has(e.rfc)) emi.set(e.rfc, { datos: { nombre: e.nombre.toUpperCase(), rfc: e.rfc }, n: 0 }); if (e.rfc) emi.get(e.rfc).n++; }
    const filasEmi = [...emi.values()].map(({ datos, n }) => {
      const prev = emisoras.find(x => (x.rfc || '').toUpperCase() === datos.rfc) || Datos.buscarEmpresa(emisoras, datos.nombre);
      if (!prev) return { datos, n, prev: null, estado: '🆕 Nueva', marcado: false };
      return prev.rfc ? { datos, n, prev, estado: '✔️ Ya existe', marcado: false } : { datos, n, prev, nuevos: ['rfc'], estado: '➕ Completar: rfc', marcado: true };
    });

    // ---- Conceptos → códigos SAT
    const con = new Map();
    for (const c of cfdis) for (const k of c.conceptos) {
      const norm = SAT.normalizarConcepto(k.descripcion);
      if (!norm || !k.claveProdServ) continue;
      if (!con.has(norm)) con.set(norm, { norm, ejemplo: sinRef(k.descripcion.toUpperCase()), votos: new Map() });
      const key = k.claveProdServ + '|' + (k.claveUnidad || '');
      const g = con.get(norm); g.votos.set(key, (g.votos.get(key) || 0) + 1);
    }
    const filasCon = [...con.values()].map(g => {
      const [key, n] = [...g.votos.entries()].sort((a, b) => b[1] - a[1])[0];
      const total = [...g.votos.values()].reduce((a, b) => a + b, 0);
      const [clave, unidad] = key.split('|');
      const datos = {
        concepto_normalizado: g.norm, concepto_ejemplo: g.ejemplo.replace(/\s+/g, ' ').trim(),
        clave_prod_serv: clave, descripcion_prod_serv: motor.descProdServ(clave),
        clave_unidad: unidad || window.CONFIG.DEFAULTS.claveUnidad, descripcion_unidad: UI.nombreUnidad(motor, unidad || window.CONFIG.DEFAULTS.claveUnidad),
      };
      const prev = conceptos.find(x => x.concepto_normalizado === g.norm);
      const varios = g.votos.size > 1 ? ` · ${g.votos.size} códigos distintos en los XML, se toma el más usado (${n} de ${total})` : '';
      if (!datos.descripcion_prod_serv) return { datos, n: total, prev, estado: '⚠️ Código no está en el catálogo', marcado: false };
      if (!prev) return { datos, n: total, prev, estado: '🆕 Nuevo' + varios, marcado: true };
      if (prev.clave_prod_serv === clave && prev.clave_unidad === datos.clave_unidad) return { datos, n: total, prev, estado: '✔️ Ya aprendido igual', marcado: false };
      return { datos, n: total, prev, estado: `🔁 Antes: ${prev.clave_prod_serv} / ${prev.clave_unidad || '—'} (marca para reemplazar)` + varios, marcado: false };
    });

    pintarXml({ cfdis, errores, filasCli, filasEmi, filasCon });
  }

  function pintarXml({ cfdis, errores, filasCli, filasEmi, filasCon }) {
    const res = $('resultadoXml'); res.innerHTML = '';
    res.append(el('div', { class: 'aviso ' + (cfdis.length ? 'verde' : 'ambar') }, `📄 Leí ${cfdis.length} factura(s): ${filasCli.length} cliente(s), ${filasEmi.length} facturadora(s) y ${filasCon.length} concepto(s) distintos.`));
    errores.forEach(e => res.append(el('div', { class: 'aviso ambar' }, '⚠️ ' + e)));
    if (!cfdis.length) return;

    const contador = el('span');
    const total = () => [...filasCli, ...filasEmi, ...filasCon].filter(f => f.marcado).length;
    const refrescar = () => { contador.textContent = total(); btn.disabled = !total(); };
    const seccion = (titulo, nota, filas, cols) => {
      if (!filas.length) return null;
      const todos = el('input', { type: 'checkbox', style: 'width:auto', checked: filas.every(f => f.marcado), onchange: e => { filas.forEach(f => f.marcado = e.target.checked); tb.querySelectorAll('input').forEach(i => i.checked = e.target.checked); refrescar(); } });
      const tb = el('tbody');
      filas.forEach(f => tb.append(el('tr', {},
        el('td', {}, el('input', { type: 'checkbox', style: 'width:auto', checked: f.marcado, onchange: e => { f.marcado = e.target.checked; refrescar(); } })),
        ...cols.map(c => el('td', {}, c(f))),
        el('td', {}, el('span', { class: 'nota' }, f.estado)))));
      return el('div', { style: 'margin-top:22px' },
        el('h3', { style: 'margin:0 0 4px;font-size:18px' }, titulo), el('p', { class: 'ayuda', style: 'margin:0 0 8px' }, nota),
        el('div', { class: 'tabla-wrap' }, el('table', { class: 'lista' },
          el('thead', {}, el('tr', {}, el('th', { style: 'width:36px' }, todos), ...cols.map(c => el('th', {}, c.titulo)), el('th', {}, 'Qué pasará'))), tb)));
    };
    const col = (titulo, fn) => Object.assign(fn, { titulo });
    const mono = t => el('span', { style: 'font-family:var(--mono)' }, t || '—');

    const btn = el('button', { class: 'btn grande', onclick: () => guardarXml({ filasCli, filasEmi, filasCon }, btn) }, '💾 Guardar seleccionados: ', contador);
    res.append(
      seccion('👥 Clientes (receptoras)', 'Del XML salen nombre, RFC, C.P., uso de CFDI, forma y método de pago. La dirección, colonia y ciudad no vienen en el XML: complétalas después en la pestaña Clientes. Si el cliente ya existe sólo se llenan los campos vacíos.', filasCli, [
        col('Nombre', f => f.datos.nombre), col('RFC', f => mono(f.datos.rfc)), col('C.P.', f => mono(f.datos.cp)), col('Uso CFDI', f => f.datos.uso_cfdi || '—'), col('Facturas', f => mono(String(f.n)))]),
      seccion('🏢 Facturadoras (emisoras)', 'Vienen sin marcar: agrégalas sólo si también son facturadoras que usas en los folios.', filasEmi, [
        col('Nombre', f => f.datos.nombre), col('RFC', f => mono(f.datos.rfc)), col('Facturas', f => mono(String(f.n)))]),
      seccion('🧠 Códigos SAT por concepto', 'Se aprenden para que, cuando ese concepto aparezca en una imagen, el código y la unidad salgan solos.', filasCon, [
        col('Concepto', f => f.datos.concepto_ejemplo), col('Código SAT', f => el('div', {}, mono(f.datos.clave_prod_serv), el('div', { class: 'desc-sat' }, (f.datos.descripcion_prod_serv || '').toUpperCase()))),
        col('Unidad', f => el('div', {}, mono(f.datos.clave_unidad), el('div', { class: 'desc-sat' }, f.datos.descripcion_unidad))), col('Veces', f => mono(String(f.n)))]),
      el('div', { class: 'acciones' }, btn));
    refrescar();
  }

  async function guardarXml({ filasCli, filasEmi, filasCon }, btn) {
    btn.disabled = true;
    let ok = 0; const fallas = [];
    const guardar = async (tabla, f, obj) => { try { await Datos.guardar(tabla, obj); ok++; f.marcado = false; } catch (e) { fallas.push(`${obj.nombre || obj.concepto_ejemplo}: ${e.message}`); } };
    for (const f of filasCli.filter(f => f.marcado)) {
      if (!f.prev) await guardar('receptoras', f, f.datos);
      else { const o = { ...f.prev }; f.nuevos.forEach(k => o[k] = f.datos[k]); await guardar('receptoras', f, o); }
    }
    for (const f of filasEmi.filter(f => f.marcado)) {
      if (!f.prev) await guardar('emisoras', f, { ...f.datos, alias: f.datos.nombre });
      else await guardar('emisoras', f, { ...f.prev, rfc: f.datos.rfc });
    }
    for (const f of filasCon.filter(f => f.marcado)) {
      await guardar('conceptos', f, { ...(f.prev ? { id: f.prev.id } : {}), ...f.datos, usos: (f.prev?.usos || 0) + f.n });
    }
    const res = $('resultadoXml');
    res.innerHTML = '';
    res.append(el('div', { class: 'aviso ' + (fallas.length ? 'ambar' : 'verde') }, `✅ Se guardaron ${ok} registro(s).` + (fallas.length ? ` ${fallas.length} no se pudieron guardar.` : '')));
    fallas.forEach(e => res.append(el('div', { class: 'aviso rojo' }, '⚠️ ' + e)));
    if (filasCli.some(f => !f.prev)) res.append(el('div', { class: 'aviso violeta' }, '📝 Recuerda completar dirección, colonia y ciudad de los clientes nuevos en la pestaña 👥 Clientes; el XML no las trae.'));
    toast('✅ Backlog actualizado');
  }

  cargar();
})();
