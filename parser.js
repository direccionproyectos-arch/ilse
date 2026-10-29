/* Convierte el resultado de Tesseract (líneas con palabras y posiciones) en facturas.
 * Formato esperado de la imagen: bloques con encabezado
 * CLIENTE | CONCEPTO | CANTIDAD | P/U | SUBTOTAL | IVA | NETO, renglón(es) de datos,
 * y un renglón "REFERENCIA: ...   TOTAL  ...". */
(function (root) {
  const IVA = 0.16;
  const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const sinAc = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const cx = w => (w.bbox.x0 + w.bbox.x1) / 2;

  const COLS = [
    ['cliente', /^CLIENT/],
    ['concepto', /^CONCEP/],
    ['cantidad', /^CANT/],
    ['pu', /^P\.?\/?\.?U\.?$|^PU$|^P\/U/],
    ['subtotal', /^SUB/],
    ['iva', /^I\.?V\.?A/],
    ['neto', /^NET/],
  ];
  const ES_NUM = t => /\d/.test(t) && /^[\d$.,\-\s]+$/.test(t.replace(/[Oo]/g, '0'));

  function dinero(t) {
    if (t == null) return null;
    let s = String(t).replace(/[Oo]/g, '0').replace(/[^\d.,-]/g, '');
    if (!/\d/.test(s)) return null;
    // "2,528.28" -> 2528.28 ; "2.528,28" -> 2528.28 ; "40452" -> 404.52 (punto perdido)
    if (/,\d{2}$/.test(s) && !/\.\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    if (!s.includes('.') && s.length >= 3) s = s.slice(0, -2) + '.' + s.slice(-2);
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }
  function cantidad(t) {
    if (t == null) return null;
    const s = String(t).trim();
    if (/^[EIl|!\]\[]$/.test(s)) return 1;           // "1" mal leído
    const n = parseFloat(s.replace(/[Oo]/g, '0').replace(/,/g, '').replace(/[^\d.]/g, ''));
    return isNaN(n) ? null : n;
  }
  const esRuido = t => !/[A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]/.test(t);

  function esEncabezado(linea) {
    const ws = linea.words.map(w => sinAc(w.text));
    return ws.some(w => /^CLIENT/.test(w)) && ws.some(w => /^CONCEP/.test(w));
  }
  function columnasDe(linea) {
    const c = {};
    for (const w of linea.words) {
      const t = sinAc(w.text);
      for (const [k, re] of COLS) if (!c[k] && re.test(t)) c[k] = cx(w);
    }
    return c;
  }

  /** Reparte las palabras de un renglón de datos entre las columnas. */
  function repartir(linea, cols) {
    const centros = Object.entries(cols).sort((a, b) => a[1] - b[1]);
    const out = {};
    const words = linea.words.filter(w => !esRuido(w.text));
    for (const w of words) {
      const x = cx(w);
      let mejor = null, d = Infinity;
      for (const [k, c] of centros) { const dd = Math.abs(c - x); if (dd < d) { d = dd; mejor = k; } }
      // Texto en columnas numéricas cuando no parece número -> se queda en texto (salvo cantidad "E"/"l")
      if (['pu', 'subtotal', 'iva', 'neto'].includes(mejor) && !ES_NUM(w.text)) mejor = x < (cols.concepto || 0) ? 'cliente' : 'concepto';
      (out[mejor] = out[mejor] || []).push(w.text);
    }
    for (const k in out) out[k] = out[k].join(' ');
    return out;
  }

  function cuadrar(c) {
    let { cantidad: q, pu, subtotal: sub, iva, neto } = c;
    const avisos = [];
    if (!(q > 0)) q = (sub && pu) ? Math.round(sub / pu) || 1 : 1;
    if (sub == null && pu != null) sub = r2(pu * q);
    if (sub == null && neto != null) sub = r2(neto / (1 + IVA));
    if (pu == null && sub != null) pu = r2(sub / q);
    // Si el P/U no cuadra con el subtotal pero el neto sí, corrige desde el neto
    if (neto != null && Math.abs(r2(r2(pu * q) * (1 + IVA)) - neto) > 0.02) {
      const subN = r2(neto / (1 + IVA));
      if (sub != null && Math.abs(r2(sub * (1 + IVA)) - neto) <= 0.02) pu = r2(sub / q);
      else { avisos.push('Los importes leídos no cuadran entre sí; revisa P/U.'); pu = r2(subN / q); }
    }
    return { ...c, cantidad: q, pu, avisos };
  }

  /**
   * @param lineas [{text, bbox, words:[{text,bbox}]}] en orden de lectura
   * @returns {facturas:[{numero, receptorTexto, referencia, totalImagen, conceptos:[...] }], tieneEncabezados}
   */
  function parsear(lineas) {
    lineas = lineas.filter(l => l.words && l.words.length).sort((a, b) => a.bbox.y0 - b.bbox.y0);
    const facturas = [];
    let actual = null, cols = null;
    for (const l of lineas) {
      const txt = sinAc(l.words.map(w => w.text).join(' '));
      if (esEncabezado(l)) {
        cols = columnasDe(l);
        const primero = l.words[0].text.replace(/\D/g, '');
        actual = { numero: primero ? +primero : facturas.length + 1, receptorTexto: '', referencia: '', totalImagen: null, conceptos: [] };
        facturas.push(actual);
        continue;
      }
      if (!actual) continue;
      if (/REFERENCIA|^REF\b/.test(txt) || /\bTOTAL\b/.test(txt)) {
        const iTotal = l.words.findIndex(w => /^TOTAL/.test(sinAc(w.text)));
        const iRef = l.words.findIndex(w => /^REF/.test(sinAc(w.text)));
        if (iRef >= 0) {
          const fin = iTotal > iRef ? iTotal : l.words.length;
          actual.referencia = l.words.slice(iRef + 1, fin).map(w => w.text).filter(t => !esRuido(t)).join(' ').replace(/^:\s*/, '').trim();
        }
        if (iTotal >= 0) {
          const n = l.words.slice(iTotal + 1).map(w => dinero(w.text)).find(v => v != null);
          if (n != null) actual.totalImagen = n;
        }
        continue;
      }
      const p = repartir(l, cols);
      const nums = ['pu', 'subtotal', 'iva', 'neto'].some(k => p[k]);
      if (!nums && actual.conceptos.length) {           // renglón de continuación de texto
        const u = actual.conceptos[actual.conceptos.length - 1];
        if (p.concepto) u.concepto = (u.concepto + ' ' + p.concepto).trim();
        if (p.cliente) actual.receptorTexto = (actual.receptorTexto + ' ' + p.cliente).trim();
        continue;
      }
      if (!nums && !p.concepto && !p.cliente) continue;
      if (p.cliente) actual.receptorTexto = (actual.receptorTexto ? actual.receptorTexto + ' ' : '') + p.cliente;
      actual.conceptos.push({
        concepto: (p.concepto || '').trim(),
        cantidad: cantidad(p.cantidad),
        pu: dinero(p.pu), subtotal: dinero(p.subtotal), iva: dinero(p.iva), neto: dinero(p.neto),
      });
    }
    for (const f of facturas) {
      f.receptorTexto = f.receptorTexto.replace(/\s+/g, ' ').trim();
      f.conceptos = f.conceptos.map(cuadrar);
      if (!f.conceptos.length) f.conceptos.push({ concepto: '', cantidad: 1, pu: f.totalImagen ? r2(f.totalImagen / (1 + IVA)) : null, avisos: [] });
    }
    return { facturas, tieneEncabezados: facturas.length > 0 };
  }

  const api = { parsear, dinero, cantidad, r2, IVA };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ParserOCR = api;
})(typeof window !== 'undefined' ? window : globalThis);
