/* Genera el Excel de folio a partir de la plantilla original (plantilla/plantilla.xlsx),
 * conservando formato, catálogos y listas desplegables. */
(function (root) {
  const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

  function copiarEstilo(ws, desde, hacia) {
    for (const c of COLS) {
      const s = ws.getCell(c + desde), t = ws.getCell(c + hacia);
      t.style = JSON.parse(JSON.stringify(s.style || {}));
    }
    const h = ws.getRow(desde).height;
    if (h) ws.getRow(hacia).height = h;
  }
  function fechaExcel(iso) {
    if (!iso) return null;
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const claveNum = c => (/^[1-9]\d*$/.test(String(c)) ? Number(c) : (c || null));
  const cpNum = c => (/^\d+$/.test(String(c || '').trim()) ? Number(c) : (c || null));
  const limpiarArchivo = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  function nombreArchivo(f) {
    const t = r2(f.total);
    const total = Number.isInteger(t) ? String(t) : t.toFixed(2);
    return `FOLIO_${limpiarArchivo(f.receptor.nombre_archivo || f.receptor.nombre)}_${total}_${limpiarArchivo(f.emisor.nombre_archivo || f.emisor.nombre)}.xlsx`;
  }

  /**
   * @param plantilla ArrayBuffer/Buffer de plantilla.xlsx
   * @param f { emisor, receptor, fechaFactura, fechaOperacion, formaPago, metodoPago, usoCfdi,
   *            sucursal, promotor, noCuenta, moneda, conceptos:[{cantidad, conceptoExcel, clave_prod_serv,
   *            descripcion_prod_serv, clave_unidad, descripcion_unidad, pu}] }
   */
  async function generar(ExcelJS, plantilla, f) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(plantilla);
    const ws = wb.worksheets[0];
    const R = f.receptor;
    const set = (ref, v) => { ws.getCell(ref).value = (v === '' || v === undefined) ? null : v; };

    set('C3', R.nombre); set('C4', R.rfc); set('C5', R.direccion); set('C6', cpNum(R.cp));
    set('C7', R.colonia); set('C8', R.ciudad);
    set('C10', f.emisor.nombre); set('C11', f.sucursal); set('C12', f.promotor);
    set('C13', fechaExcel(f.fechaFactura)); set('C14', fechaExcel(f.fechaOperacion));
    set('C15', f.formaPago); set('C16', f.metodoPago); set('C17', f.noCuenta);
    set('C18', f.moneda || 'PESOS MEXICANOS'); set('C20', f.usoCfdi);

    const n = Math.max(1, f.conceptos.length);
    // Guardar estilos originales de renglones de concepto (23) y totales (24-26)
    const estiloTotales = [24, 25, 26].map(r => ({
      celdas: COLS.map(c => JSON.parse(JSON.stringify(ws.getCell(c + r).style || {}))),
      alto: ws.getRow(r).height, etiqueta: ws.getCell('F' + r).value,
    }));
    if (n > 1) {
      ['F24:H24', 'F25:H25', 'F26:H26'].forEach(m => ws.unMergeCells(m));
      for (let r = 24; r <= 26; r++) for (const c of COLS) ws.getCell(c + r).value = null;
    }
    let subtotal = 0;
    f.conceptos.forEach((k, i) => {
      const r = 23 + i;
      if (i > 0) copiarEstilo(ws, 23, r);
      const imp = r2(k.cantidad * k.pu);
      subtotal += imp;
      set('B' + r, k.cantidad); set('C' + r, k.conceptoExcel); set('D' + r, claveNum(k.clave_prod_serv));
      set('E' + r, (k.descripcion_prod_serv || '').toUpperCase()); set('F' + r, k.clave_unidad);
      set('G' + r, (k.descripcion_unidad || '').toUpperCase()); set('H' + r, k.pu);
      ws.getCell('I' + r).value = { formula: `H${r}*B${r}`, result: imp };
    });
    subtotal = r2(subtotal);
    const t0 = 23 + n;                       // renglón de SUBTOTAL
    if (n > 1) {
      estiloTotales.forEach((e, j) => {
        const r = t0 + j;
        COLS.forEach((c, ci) => { ws.getCell(c + r).style = JSON.parse(JSON.stringify(e.celdas[ci])); });
        if (e.alto) ws.getRow(r).height = e.alto;
        ws.getCell('F' + r).value = e.etiqueta;
        ws.mergeCells(`F${r}:H${r}`);
      });
    }
    const ivaExcel = subtotal * 0.16;          // misma fórmula que la plantilla
    ws.getCell('I' + t0).value = { formula: n === 1 ? 'I23' : `SUM(I23:I${22 + n})`, result: subtotal };
    ws.getCell('I' + (t0 + 1)).value = { formula: `I${t0}*0.16`, result: ivaExcel };
    ws.getCell('I' + (t0 + 2)).value = { formula: `I${t0}+I${t0 + 1}`, result: subtotal + ivaExcel };

    wb.calcProperties = Object.assign(wb.calcProperties || {}, { fullCalcOnLoad: true });
    const buf = await wb.xlsx.writeBuffer();
    return { buffer: buf, nombre: nombreArchivo({ ...f, total: subtotal + ivaExcel }), total: subtotal + ivaExcel };
  }

  const api = { generar, nombreArchivo, limpiarArchivo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GeneradorExcel = api;
})(typeof window !== 'undefined' ? window : globalThis);
