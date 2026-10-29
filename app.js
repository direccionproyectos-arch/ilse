/* Página principal: imagen → OCR → revisión → Excel(es). */
(async function () {
  const { el, dinero, toast } = UI;
  const C = window.CONFIG;
  const $ = id => document.getElementById(id);
  const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const hoy = () => new Date().toLocaleDateString('en-CA');
  const abs = p => new URL(p, location.href).href;
  let uidSeq = 0;

  UI.topbar('generar');
  await UI.requerirSesion();

  const G = {
    emisores: [], receptores: [], motor: null, cat: null,
    emisorId: '', tituloOCR: '', fechaFactura: hoy(), fechaOperacion: hoy(), moneda: C.DEFAULTS.moneda,
    facturas: [],
  };

  /* ---------- Carga inicial ---------- */
  async function cargarListas() {
    [G.emisores, G.receptores] = await Promise.all([Datos.listar('emisoras'), Datos.listar('receptoras')]);
    const aprendidos = await Datos.listar('conceptos');
    if (G.motor) G.motor.setAprendidos(aprendidos);
    return aprendidos;
  }
  G.cat = await UI.catalogos();
  G.motor = new SAT.MotorSAT(G.cat.prodServ, G.cat.unidades);
  try { await cargarListas(); } catch (e) { toast('⚠️ No se pudo cargar el backlog: ' + e.message, 6000); }

  /* ---------- Paso 2: datos generales ---------- */
  function pintarEmisores() {
    const s = $('selEmisor'); s.innerHTML = '';
    s.append(el('option', { value: '' }, '— Selecciona la facturadora —'), ...G.emisores.map(e => el('option', { value: e.id }, e.nombre)));
    s.value = G.emisorId || '';
    const nota = $('notaEmisor');
    if (G.tituloOCR) nota.textContent = G.emisorId ? `(leído en la imagen: ${G.tituloOCR})` : `(leído en la imagen: "${G.tituloOCR}" — no está en el backlog, agrégalo con ➕)`;
    else nota.textContent = '';
  }
  $('selEmisor').onchange = e => { G.emisorId = e.target.value; pintarEmisores(); };
  $('btnNuevoEmisor').onclick = async () => {
    const n = await UI.formEmpresa('emisoras', G.tituloOCR ? { nombre: G.tituloOCR, alias: G.tituloOCR } : {});
    if (n) { await cargarListas(); G.emisorId = n.id; pintarEmisores(); }
  };
  ['fechaFactura', 'fechaOperacion', 'moneda'].forEach(k => { $(k).value = G[k]; $(k).oninput = e => { G[k] = e.target.value; }; });

  /* ---------- Reconocimiento SAT por concepto ---------- */
  function reconocer(K, forzar) {
    if (!forzar && (K.estado === 'confirmado')) return;
    if (!K.concepto.trim()) { Object.assign(K, { clave: '', descClave: '', estado: 'vacio', alternativas: [] }); return; }
    const r = G.motor.reconocer(K.concepto, { preferirServicios: C.PREFERIR_SERVICIOS });
    K.alternativas = r.alternativas;
    if (!r.sugerencia) { Object.assign(K, { clave: '', descClave: '', estado: 'vacio' }); return; }
    K.clave = String(r.sugerencia.clave_prod_serv);
    K.descClave = G.motor.descProdServ(K.clave) || r.sugerencia.descripcion_prod_serv || '';
    if (r.fuente === 'aprendido') {
      if (r.sugerencia.clave_unidad) { K.unidad = r.sugerencia.clave_unidad; K.descUnidad = r.sugerencia.descripcion_unidad || UI.nombreUnidad(G.motor, K.unidad); }
      K.estado = r.confianza === 'alta' ? 'aprendido' : 'sugerido';
    } else K.estado = 'sugerido';
  }
  const nuevoConcepto = (o = {}) => {
    const K = { concepto: '', cantidad: 1, pu: null, clave: '', descClave: '', unidad: C.DEFAULTS.claveUnidad, descUnidad: '', estado: 'vacio', alternativas: [], avisos: [], ...o };
    K.descUnidad = K.descUnidad || UI.nombreUnidad(G.motor, K.unidad);
    reconocer(K, true);
    return K;
  };
  function nuevaFactura(o = {}) {
    const F = {
      uid: ++uidSeq, numero: G.facturas.length + 1, receptorId: '', receptorTexto: '', referencia: '', totalImagen: null,
      formaPago: C.DEFAULTS.formaPago, metodoPago: C.DEFAULTS.metodoPago, usoCfdi: C.DEFAULTS.usoCfdi,
      sucursal: '', promotor: '', noCuenta: '', conceptos: [], ...o,
    };
    const m = Datos.buscarEmpresa(G.receptores, F.receptorTexto);
    if (m) aplicarReceptor(F, m);
    if (!F.conceptos.length) F.conceptos.push(nuevoConcepto());
    return F;
  }
  function aplicarReceptor(F, R) {
    F.receptorId = R ? R.id : '';
    if (!R) return;
    if (R.forma_pago) F.formaPago = R.forma_pago;
    if (R.metodo_pago) F.metodoPago = R.metodo_pago;
    if (R.uso_cfdi) F.usoCfdi = R.uso_cfdi;
    F.sucursal = R.sucursal || F.sucursal; F.promotor = R.promotor || F.promotor; F.noCuenta = R.no_cuenta || F.noCuenta;
  }
  const conceptoExcel = (F, K) => {
    const ref = (F.referencia || '').trim();
    let t = ref ? C.PLANTILLA_CONCEPTO.replace('{CONCEPTO}', K.concepto.trim()).replace('{REFERENCIA}', ref) : K.concepto.trim();
    return t.toUpperCase();
  };
  const totalesDe = F => {
    const sub = r2(F.conceptos.reduce((s, K) => s + r2((+K.cantidad || 0) * (+K.pu || 0)), 0));
    const iva = sub * 0.16;
    return { sub, iva, total: sub + iva };
  };

  /* ---------- Combobox de código SAT ---------- */
  function comboSAT(F, K, refrescar) {
    const inp = el('input', { type: 'text', value: K.clave, placeholder: 'Código o palabra', inputmode: 'search' });
    const lista = el('div', { class: 'combo-lista oculto' });
    let items = [], sel = -1;
    const mostrar = arr => {
      items = arr; sel = -1; lista.innerHTML = '';
      if (!arr.length) lista.append(el('div', { class: 'vacio' }, 'Sin resultados. Escribe otra palabra o el código.'));
      arr.forEach((a, i) => lista.append(el('div', { onmousedown: ev => { ev.preventDefault(); elegir(i); } }, el('b', {}, a.clave), a.descripcion)));
      lista.classList.remove('oculto');
    };
    const elegir = i => {
      const a = items[i]; if (!a) return;
      K.clave = a.clave; K.descClave = a.descripcion; K.estado = 'confirmado';
      inp.value = a.clave; lista.classList.add('oculto'); refrescar();
    };
    inp.onfocus = () => mostrar(K.alternativas && K.alternativas.length && inp.value === K.clave ? K.alternativas : G.motor.buscar(inp.value || K.concepto, 25, { preferirServicios: C.PREFERIR_SERVICIOS }));
    inp.oninput = () => mostrar(G.motor.buscar(inp.value, 25, { preferirServicios: C.PREFERIR_SERVICIOS }));
    inp.onkeydown = e => {
      const divs = [...lista.children];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); sel = Math.max(0, Math.min(items.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)));
        divs.forEach((d, i) => d.classList.toggle('sel', i === sel)); divs[sel]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') { e.preventDefault(); elegir(sel >= 0 ? sel : 0); }
      else if (e.key === 'Escape') lista.classList.add('oculto');
    };
    inp.onblur = () => {
      lista.classList.add('oculto');
      const v = inp.value.trim();
      if (v === K.clave) return;
      const d = G.motor.descProdServ(v);
      if (d) { K.clave = v; K.descClave = d; K.estado = 'confirmado'; }
      else { K.clave = v; K.descClave = ''; K.estado = v ? 'error' : 'vacio'; }
      refrescar();
    };
    return el('div', { class: 'combo' }, inp, lista);
  }

  const CHIPS = {
    aprendido: ['aprendido', '✅ Aprendido'],
    sugerido: ['sugerido', '🟡 Sugerido · clic para confirmar'],
    confirmado: ['manual', '✔️ Confirmado'],
    error: ['error', '⚠️ Código no existe'],
    vacio: ['error', '⚠️ Falta código'],
  };

  /* ---------- Tarjeta de factura ---------- */
  function tarjetaFactura(F) {
    const card = el('section', { class: 'tarjeta', id: 'f' + F.uid });
    const pintar = () => { card.replaceWith(tarjetaFactura(F)); actualizarResumen(); };
    const totalEl = el('span', { class: 'der' });
    const totDiv = el('div', { class: 'totales' });
    const avisoTot = el('div');
    const actualizarTot = () => {
      const t = totalesDe(F);
      totalEl.textContent = 'Total ' + dinero(t.total);
      totDiv.innerHTML = '';
      totDiv.append(el('div', {}, el('span', {}, 'Subtotal'), el('b', {}, dinero(t.sub))),
        el('div', {}, el('span', {}, 'IVA 16%'), el('b', {}, dinero(t.iva))),
        el('div', { class: 'total' }, el('span', {}, 'Total'), el('span', {}, dinero(t.total))));
      avisoTot.innerHTML = '';
      if (F.totalImagen != null) {
        const ok = Math.abs(r2(t.total) - F.totalImagen) <= 0.02;
        avisoTot.append(el('div', { class: 'aviso ' + (ok ? 'verde' : 'ambar') },
          ok ? `✅ Coincide con el total de la imagen (${dinero(F.totalImagen)})` : `⚠️ La imagen dice ${dinero(F.totalImagen)} y aquí da ${dinero(t.total)}. Revisa cantidades y precios.`));
      }
      actualizarResumen();
    };

    // Cliente / receptor
    const selR = el('select', {}, el('option', { value: '' }, '— Selecciona el cliente —'), ...G.receptores.map(r => el('option', { value: r.id }, `${r.nombre}  ·  ${r.rfc || 'sin RFC'}`)));
    selR.value = F.receptorId;
    selR.onchange = () => { aplicarReceptor(F, G.receptores.find(r => r.id === selR.value)); pintar(); };
    const notaR = F.receptorTexto ? (F.receptorId ? `(leído: ${F.receptorTexto})` : `(leído: "${F.receptorTexto}" — no está en el backlog, agrégalo con ➕)`) : '';
    const btnNuevoR = el('button', {
      class: 'btn sec', title: 'Agregar al backlog', onclick: async () => {
        const n = await UI.formEmpresa('receptoras', F.receptorTexto ? { nombre: F.receptorTexto, alias: F.receptorTexto } : {});
        if (n) { await cargarListas(); aplicarReceptor(F, n); G.facturas.forEach(o => { if (!o.receptorId && o !== F) { const m = Datos.buscarEmpresa(G.receptores, o.receptorTexto); if (m) aplicarReceptor(o, m); } }); renderFacturas(); }
      }
    }, '➕');

    const selCat = (tipo, k) => { const s = el('select', { onchange: e => { F[k] = e.target.value; } }, ...G.cat[tipo].map(o => el('option', { value: o }, o))); s.value = F[k]; return s; };
    const txt = (k, ph) => el('input', { type: 'text', value: F[k] || '', placeholder: ph || '', oninput: e => { F[k] = e.target.value; if (k === 'referencia') previews(); } });

    // Tabla de conceptos
    const previewEls = [];
    const previews = () => previewEls.forEach(([e, K]) => { e.textContent = `(en el Excel: ${conceptoExcel(F, K)})`; });
    const tbody = el('tbody');
    F.conceptos.forEach((K, i) => {
      const imp = el('div', { class: 'importe' }, dinero(r2((+K.cantidad || 0) * (+K.pu || 0))));
      const recalc = () => { imp.textContent = dinero(r2((+K.cantidad || 0) * (+K.pu || 0))); actualizarTot(); };
      const prev = el('div', { class: 'nota excel-como' }); previewEls.push([prev, K]);
      const descU = el('div', { class: 'desc-sat' }, K.descUnidad || '—');
      const unidadInp = el('input', { type: 'text', value: K.unidad, list: 'unidadesFrec', style: 'text-transform:uppercase', oninput: e => {
        K.unidad = e.target.value.toUpperCase().trim(); K.descUnidad = UI.nombreUnidad(G.motor, K.unidad);
        descU.textContent = K.descUnidad || '⚠️ Unidad no existe';
      } });
      const [chipCls, chipTxt] = CHIPS[K.estado] || CHIPS.vacio;
      const chip = el('span', { class: 'chip ' + chipCls, style: K.estado === 'sugerido' ? 'cursor:pointer' : '', onclick: () => { if (K.estado === 'sugerido') { K.estado = 'confirmado'; pintar(); } } }, chipTxt);
      tbody.append(el('tr', {},
        el('td', { class: 'num', style: 'min-width:80px' }, el('input', { type: 'number', min: '0', step: 'any', value: K.cantidad ?? '', oninput: e => { K.cantidad = parseFloat(e.target.value) || 0; recalc(); } })),
        el('td', { style: 'min-width:250px' },
          el('input', { type: 'text', value: K.concepto, oninput: e => { K.concepto = e.target.value; previews(); }, onchange: () => { reconocer(K); pintar(); } }), prev),
        el('td', { class: 'num', style: 'min-width:130px' }, el('input', { type: 'number', min: '0', step: '0.01', value: K.pu ?? '', oninput: e => { K.pu = parseFloat(e.target.value) || 0; recalc(); } })),
        el('td', { style: 'width:120px' }, imp),
        el('td', { style: 'min-width:140px' }, comboSAT(F, K, pintar), chip),
        el('td', { style: 'min-width:180px' }, el('div', { class: 'desc-sat' }, K.descClave ? K.descClave.toUpperCase() : '—')),
        el('td', { style: 'min-width:95px' }, unidadInp),
        el('td', { style: 'width:120px' }, descU),
        el('td', { style: 'width:40px' }, F.conceptos.length > 1 ? el('button', { class: 'btn peligro', title: 'Quitar concepto', onclick: () => { F.conceptos.splice(i, 1); pintar(); } }, '🗑️') : ''),
      ));
      (K.avisos || []).forEach(a => tbody.append(el('tr', {}, el('td', { colspan: 9 }, el('div', { class: 'aviso ambar' }, '⚠️ ' + a)))));
    });
    previews();

    card.append(
      el('h2', {}, `🧾 Factura ${F.numero}`, totalEl),
      el('div', { class: 'rejilla' },
        el('div', { class: 'ancho' }, el('label', {}, 'Cliente (receptora) ', el('span', { class: 'nota' }, notaR)), el('div', { style: 'display:flex;gap:10px' }, selR, btnNuevoR)),
        el('div', {}, el('label', {}, 'Referencia ', el('span', { class: 'nota' }, '(se agrega al concepto)')), txt('referencia', '16 26 4052')),
        el('div', {}, el('label', {}, 'Forma de pago'), selCat('formaPago', 'formaPago')),
        el('div', {}, el('label', {}, 'Método de pago'), selCat('metodoPago', 'metodoPago')),
        el('div', {}, el('label', {}, 'Uso de CFDI'), selCat('usoCfdi', 'usoCfdi')),
        el('div', {}, el('label', {}, 'Sucursal ', el('span', { class: 'nota' }, '(opcional)')), txt('sucursal')),
        el('div', {}, el('label', {}, 'Promotor ', el('span', { class: 'nota' }, '(opcional)')), txt('promotor')),
        el('div', {}, el('label', {}, 'No. de cuenta ', el('span', { class: 'nota' }, '(opcional)')), txt('noCuenta')),
      ),
      el('h2', { style: 'margin-top:24px;font-size:18px' }, '📦 Conceptos'),
      el('div', { class: 'tabla-wrap' }, el('table', { class: 'conceptos' },
        el('thead', {}, el('tr', {}, ...['Cant.', 'Concepto', 'P/U', 'Importe', 'Código SAT', 'Descripción SAT', 'Unidad', 'Desc. unidad', ''].map(h => el('th', {}, h)))),
        tbody)),
      el('button', { class: 'btn sec', onclick: () => { F.conceptos.push(nuevoConcepto()); pintar(); } }, '➕ Concepto'),
      totDiv, avisoTot,
      el('div', { class: 'acciones' },
        el('button', { class: 'btn', onclick: () => descargar([F]) }, '⬇️ Descargar Excel'),
        el('button', { class: 'btn peligro', onclick: () => { if (confirm(`¿Quitar la factura ${F.numero}?`)) { G.facturas = G.facturas.filter(x => x !== F); renderFacturas(); } } }, '🗑️ Quitar factura')),
    );
    actualizarTot();
    return card;
  }

  function renderFacturas() {
    const cont = $('facturas'); cont.innerHTML = '';
    G.facturas.forEach((F, i) => { F.numero = i + 1; cont.append(tarjetaFactura(F)); });
    const hay = G.facturas.length > 0;
    $('tarjetaGeneral').classList.toggle('oculto', !hay);
    $('barraFinal').classList.toggle('oculto', !hay);
    pintarEmisores();
    actualizarResumen();
  }
  function actualizarResumen() {
    const tot = G.facturas.reduce((s, F) => s + totalesDe(F).total, 0);
    $('resumen').innerHTML = `<b>${G.facturas.length}</b> factura(s) · Total <b>${dinero(tot)}</b>`;
    $('btnZip').textContent = G.facturas.length > 1 ? '⬇️ Descargar todos (ZIP)' : '⬇️ Descargar Excel';
  }
  $('btnAgregarFactura').onclick = () => { G.facturas.push(nuevaFactura()); renderFacturas(); };
  $('btnManual').onclick = () => { if (!G.facturas.length) G.facturas.push(nuevaFactura()); renderFacturas(); $('tarjetaGeneral').scrollIntoView({ behavior: 'smooth' }); };
  $('btnZip').onclick = () => descargar(G.facturas);
  document.body.append(el('datalist', { id: 'unidadesFrec' }, ...C.UNIDADES_FRECUENTES.map(u => el('option', { value: u }, UI.nombreUnidad(G.motor, u)))));

  /* ---------- Validación y descarga ---------- */
  function validar(lista) {
    const errores = []; let sugeridos = 0;
    if (!G.emisorId) errores.push('Selecciona la empresa facturadora (paso 2).');
    if (!G.fechaFactura) errores.push('Falta la fecha de factura.');
    for (const F of lista) {
      const p = `Factura ${F.numero}: `;
      if (!F.receptorId) errores.push(p + 'selecciona el cliente (o agrégalo al backlog con ➕).');
      F.conceptos.forEach((K, i) => {
        const q = `${p}concepto ${i + 1} `;
        if (!K.concepto.trim()) errores.push(q + 'no tiene texto.');
        if (!(K.pu > 0)) errores.push(q + 'no tiene precio unitario.');
        if (!(K.cantidad > 0)) errores.push(q + 'no tiene cantidad.');
        if (!G.motor.descProdServ(K.clave)) errores.push(q + 'no tiene un código SAT válido.');
        if (!G.motor.descUnidad(K.unidad)) errores.push(q + 'no tiene una unidad SAT válida.');
        if (K.estado === 'sugerido') sugeridos++;
      });
    }
    return { errores, sugeridos };
  }
  let plantillaBuf = null;
  async function descargar(lista) {
    if (!lista.length) return;
    const { errores, sugeridos } = validar(lista);
    if (errores.length) { alertaErrores(errores); return; }
    if (sugeridos && !confirm(`Hay ${sugeridos} código(s) SAT sugerido(s) sin confirmar.\n\n¿Usarlos tal cual? Se guardarán como aprendidos para la próxima vez.`)) return;
    const btns = document.querySelectorAll('.btn'); btns.forEach(b => b.disabled = true);
    toast('⏳ Generando Excel…', 2500);
    try {
      if (!plantillaBuf) plantillaBuf = await fetch('plantilla/plantilla.xlsx').then(r => r.arrayBuffer());
      const emisor = G.emisores.find(e => e.id === G.emisorId);
      const archivos = [];
      for (const F of lista) {
        const receptor = G.receptores.find(r => r.id === F.receptorId);
        const res = await GeneradorExcel.generar(JSZip, plantillaBuf.slice(0), {
          emisor, receptor, fechaFactura: G.fechaFactura, fechaOperacion: G.fechaOperacion || G.fechaFactura,
          formaPago: F.formaPago, metodoPago: F.metodoPago, usoCfdi: F.usoCfdi,
          sucursal: F.sucursal, promotor: F.promotor, noCuenta: F.noCuenta, moneda: G.moneda,
          conceptos: F.conceptos.map(K => ({
            cantidad: +K.cantidad, pu: +K.pu, conceptoExcel: conceptoExcel(F, K),
            clave_prod_serv: K.clave, descripcion_prod_serv: K.descClave,
            clave_unidad: K.unidad, descripcion_unidad: K.descUnidad,
          })),
        });
        archivos.push(res);
      }
      // nombres repetidos -> sufijo
      const vistos = {};
      archivos.forEach(a => { if (vistos[a.nombre]) a.nombre = a.nombre.replace(/\.xlsx$/, `_${++vistos[a.nombre]}.xlsx`); else vistos[a.nombre] = 1; });
      if (archivos.length === 1) bajar(new Blob([archivos[0].buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), archivos[0].nombre);
      else {
        const zip = new JSZip();
        archivos.forEach(a => zip.file(a.nombre, a.buffer));
        bajar(await zip.generateAsync({ type: 'blob' }), `FOLIOS_${G.fechaFactura}.zip`);
      }
      // Aprender
      const items = [];
      lista.forEach(F => F.conceptos.forEach(K => {
        items.push({ concepto_normalizado: SAT.normalizarConcepto(K.concepto), concepto_ejemplo: K.concepto.trim().toUpperCase(), clave_prod_serv: K.clave, descripcion_prod_serv: K.descClave, clave_unidad: K.unidad, descripcion_unidad: K.descUnidad });
        if (K.estado !== 'aprendido') K.estado = 'aprendido';
      }));
      try { await Datos.aprender(items); await cargarListas(); } catch (e) { toast('⚠️ El Excel se generó, pero no se guardó el aprendizaje: ' + e.message, 6000); }
      renderFacturas();
      toast(`✅ ${archivos.length} archivo(s) generado(s)`);
    } catch (e) {
      console.error(e); alertaErrores(['Error al generar: ' + e.message]);
    } finally { btns.forEach(b => b.disabled = false); }
  }
  function bajar(blob, nombre) {
    const a = el('a', { href: URL.createObjectURL(blob), download: nombre });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function alertaErrores(errores) {
    const fondo = el('div', { class: 'modal-fondo', onclick: e => { if (e.target === fondo) fondo.remove(); } },
      el('div', { class: 'modal' }, el('h3', {}, '✋ Falta revisar algunas cosas'),
        ...errores.map(e => el('div', { class: 'aviso ambar' }, e)),
        el('div', { class: 'acciones' }, el('button', { class: 'btn', onclick: () => fondo.remove() }, 'Entendido'))));
    document.body.append(fondo);
  }

  /* ---------- Paso 1: imagen y OCR ---------- */
  let worker = null, progresoCb = null;
  async function getWorker() {
    if (!worker) {
      worker = await Tesseract.createWorker('spa', 1, {
        workerPath: abs('vendor/worker.min.js'), corePath: abs('vendor/tesseract-core'), langPath: abs('vendor/lang'), gzip: true,
        logger: m => progresoCb && progresoCb(m),
      });
    }
    return worker;
  }
  function cargarImagen(file) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  }
  function canvasDe(img, escala, recorte) {
    const [sx, sy, sw, sh] = recorte || [0, 0, img.width, img.height];
    const c = document.createElement('canvas'); c.width = Math.round(sw * escala); c.height = Math.round(sh * escala);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.filter = 'grayscale(1) contrast(1.15)'; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c;
  }
  const lineasDe = data => { const out = []; for (const b of data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) out.push(l); return out; };

  async function procesarArchivo(file) {
    if (!file || !file.type.startsWith('image/')) { toast('⚠️ Ese archivo no es una imagen'); return; }
    $('vistaPrevia').classList.remove('oculto');
    $('imgPrevia').src = URL.createObjectURL(file);
    const estado = $('estadoOCR'), barra = $('barraOCR');
    barra.classList.remove('oculto'); barra.firstElementChild.style.width = '0';
    estado.innerHTML = '<div class="aviso violeta">⏳ Leyendo la imagen… (la primera vez tarda unos segundos en preparar el lector)</div>';
    progresoCb = m => { if (m.status === 'recognizing text') barra.firstElementChild.style.width = Math.round(m.progress * 100) + '%'; };
    try {
      const img = await cargarImagen(file);
      const escala = Math.min(3, Math.max(1, 1700 / img.width));
      const w = await getWorker();
      await w.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '3' });
      const { data } = await w.recognize(canvasDe(img, escala), {}, { blocks: true });
      const lineas = lineasDe(data);
      const res = ParserOCR.parsear(lineas);
      // Título (facturadora): texto arriba del primer encabezado
      const enc = lineas.filter(l => /CLIENT/i.test(l.text) && /CONCEP/i.test(l.text)).sort((a, b) => a.bbox.y0 - b.bbox.y0)[0];
      let titulo = '';
      if (enc) {
        const arriba = lineas.filter(l => l.bbox.y1 < enc.bbox.y0 && /[A-Za-z]{3}/.test(l.text));
        if (arriba.length) titulo = arriba.sort((a, b) => b.text.length - a.text.length)[0].text;
        else if (enc.bbox.y0 / escala > 25) {
          await w.setParameters({ tessedit_pageseg_mode: '6' });
          const r = await w.recognize(canvasDe(img, escala, [0, 0, img.width, Math.floor(enc.bbox.y0 / escala) - 2]));
          await w.setParameters({ tessedit_pageseg_mode: '3' });
          titulo = (r.data.text || '').split('\n').map(s => s.trim()).filter(s => /[A-Za-z]{3}/.test(s)).sort((a, b) => b.length - a.length)[0] || '';
        }
      }
      G.tituloOCR = titulo.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9 .,&-]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
      const mE = Datos.buscarEmpresa(G.emisores, G.tituloOCR);
      if (mE) G.emisorId = mE.id;
      barra.firstElementChild.style.width = '100%';
      if (!res.facturas.length) {
        estado.innerHTML = '<div class="aviso ambar">⚠️ No reconocí la tabla en la imagen. Puedes capturar los datos a mano abajo.</div>';
        if (!G.facturas.length) G.facturas.push(nuevaFactura());
      } else {
        G.facturas = res.facturas.map(f => nuevaFactura({
          receptorTexto: f.receptorTexto, referencia: f.referencia, totalImagen: f.totalImagen,
          conceptos: f.conceptos.map(k => nuevoConcepto({ concepto: k.concepto, cantidad: k.cantidad, pu: k.pu, avisos: k.avisos })),
        }));
        const sinCliente = G.facturas.filter(F => !F.receptorId).length;
        estado.innerHTML = `<div class="aviso verde">✅ Encontré <b>${res.facturas.length}</b> factura(s)${G.tituloOCR ? ` de <b>${G.tituloOCR}</b>` : ''}. Revisa los datos abajo antes de descargar.</div>` +
          (sinCliente ? `<div class="aviso ambar">⚠️ ${sinCliente} cliente(s) no están en el backlog: agrégalos con el botón ➕ de cada factura.</div>` : '');
      }
      renderFacturas();
      setTimeout(() => $('tarjetaGeneral').scrollIntoView({ behavior: 'smooth' }), 150);
    } catch (e) {
      console.error(e);
      estado.innerHTML = `<div class="aviso rojo">⚠️ No se pudo leer la imagen: ${e.message}</div>`;
    } finally { setTimeout(() => barra.classList.add('oculto'), 800); }
  }

  const dz = $('dropzone'), fi = $('archivo');
  dz.onclick = () => fi.click();
  fi.onchange = () => { procesarArchivo(fi.files[0]); fi.value = ''; };
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('sobre'); };
  dz.ondragleave = () => dz.classList.remove('sobre');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('sobre'); procesarArchivo(e.dataTransfer.files[0]); };
  document.addEventListener('paste', e => {
    const it = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (it) { e.preventDefault(); procesarArchivo(it.getAsFile()); }
  });

  pintarEmisores();
  window.__G = G; // para depurar
})();
