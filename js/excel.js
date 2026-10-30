/* Genera el Excel de folio editando DIRECTAMENTE la plantilla original (plantilla/plantilla.xlsx).
 * No se reconstruye el archivo: se copian todas sus partes tal cual (estilos, tema, catálogos,
 * listas desplegables, vista) y sólo se cambian los valores de las celdas a llenar. */
(function (root) {
  const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const SHEET = 'xl/worksheets/sheet1.xml';

  const colNum = c => c.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const limpiarArchivo = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  function serialFecha(iso) {
    if (!iso) return null;
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
  }
  function nombreArchivo(f) {
    const t = r2(f.total);
    const total = Number.isInteger(t) ? String(t) : t.toFixed(2);
    return `FOLIO_${limpiarArchivo(f.receptor.nombre_archivo || f.receptor.nombre)}_${total}_${limpiarArchivo(f.emisor.nombre_archivo || f.emisor.nombre)}.xlsx`;
  }

  /* ---------- Edición de renglones como texto XML ---------- */
  class Hoja {
    constructor(xml, hasta) {
      this.xml = xml;
      const i0 = xml.indexOf('<sheetData>') + '<sheetData>'.length;
      let i1 = -1;
      for (let r = hasta + 1; r < hasta + 200 && i1 < 0; r++) i1 = xml.indexOf(`<row r="${r}"`, i0);
      if (i1 < 0) i1 = xml.indexOf('</sheetData>');
      this.pre = xml.slice(0, i0); this.post = xml.slice(i1);
      this.rows = new Map();          // r -> {abre, celdas:[{col, xml}]}
      const re = /<row r="(\d+)"([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g;
      const zona = xml.slice(i0, i1); let m;
      while ((m = re.exec(zona))) {
        const celdas = [];
        if (m[4]) {
          const rc = /<c r="([A-Z]+)\d+"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g; let c;
          while ((c = rc.exec(m[4]))) celdas.push({ col: c[1], xml: c[0] });
        }
        this.rows.set(+m[1], { attrs: m[2], celdas });
      }
    }
    fila(r) {
      if (!this.rows.has(r)) this.rows.set(r, { attrs: '', celdas: [] });
      return this.rows.get(r);
    }
    estilo(ref) {
      const [, col, r] = ref.match(/([A-Z]+)(\d+)/);
      const c = this.fila(+r).celdas.find(x => x.col === col);
      const s = c && c.xml.match(/ s="(\d+)"/);
      return c ? (s ? s[1] : '0') : null;
    }
    poner(ref, contenido, opciones = {}) {
      const [, col, rs] = ref.match(/([A-Z]+)(\d+)/); const r = +rs;
      const fila = this.fila(r);
      const i = fila.celdas.findIndex(x => x.col === col);
      const s = opciones.estilo !== undefined ? opciones.estilo : (i >= 0 ? this.estilo(ref) : null);
      if (opciones.borrar && s == null) { if (i >= 0) fila.celdas.splice(i, 1); return; }
      const sa = s != null && s !== '0' ? ` s="${s}"` : '';
      const xml = contenido ? `<c r="${ref}"${sa}${contenido.t ? ` t="${contenido.t}"` : ''}>${contenido.cuerpo}</c>` : `<c r="${ref}"${sa}/>`;
      if (i >= 0) fila.celdas[i] = { col, xml };
      else {
        const j = fila.celdas.findIndex(x => colNum(x.col) > colNum(col));
        fila.celdas.splice(j < 0 ? fila.celdas.length : j, 0, { col, xml });
      }
    }
    texto(ref, v) {
      if (v == null || v === '') return this.poner(ref, null);
      this.poner(ref, { t: 'inlineStr', cuerpo: `<is><t xml:space="preserve">${esc(v)}</t></is>` });
    }
    numero(ref, v) { if (v == null || v === '' || isNaN(v)) return this.poner(ref, null); this.poner(ref, { cuerpo: `<v>${+v}</v>` }); }
    valor(ref, v) { (typeof v === 'number' || /^[1-9]\d*$/.test(String(v ?? ''))) && v !== '' ? this.numero(ref, Number(v)) : this.texto(ref, v); }
    formula(ref, f, res) { this.poner(ref, { cuerpo: `<f>${esc(f)}</f><v>${res}</v>` }); }
    alto(r, ht) {
      const f = this.fila(r);
      f.attrs = f.attrs.replace(/\s(ht|customHeight)="[^"]*"/g, '') + ` ht="${ht}" customHeight="1"`;
    }
    toString() {
      const filas = [...this.rows.entries()].sort((a, b) => a[0] - b[0]).map(([r, f]) => {
        let attrs = f.attrs;
        if (f.celdas.length && /spans="/.test(attrs)) {
          const cs = f.celdas.map(c => colNum(c.col));
          const [a, b] = attrs.match(/spans="(\d+):(\d+)"/).slice(1).map(Number);
          attrs = attrs.replace(/spans="\d+:\d+"/, `spans="${Math.min(a, ...cs)}:${Math.max(b, ...cs)}"`);
        }
        return f.celdas.length ? `<row r="${r}"${attrs}>${f.celdas.map(c => c.xml).join('')}</row>` : `<row r="${r}"${attrs}/>`;
      });
      return this.pre + filas.join('') + this.post;
    }
  }

  /**
   * @param plantilla ArrayBuffer/Buffer de plantilla.xlsx
   * @param f { emisor, receptor, fechaFactura, fechaOperacion, formaPago, metodoPago, usoCfdi, sucursal, promotor,
   *            noCuenta, moneda, conceptos:[{cantidad, conceptoExcel, clave_prod_serv, descripcion_prod_serv,
   *            clave_unidad, descripcion_unidad, pu}] }
   */
  async function generar(JSZip, plantilla, f) {
    const zip = await JSZip.loadAsync(plantilla);
    const n = Math.max(1, f.conceptos.length);
    const xml = await zip.file(SHEET).async('string');
    const h = new Hoja(xml, Math.max(40, 30 + n));
    const R = f.receptor;

    h.texto('C3', R.nombre); h.texto('C4', R.rfc); h.texto('C5', R.direccion);
    h.valor('C6', /^\d+$/.test(String(R.cp || '').trim()) ? Number(R.cp) : R.cp);
    h.texto('C7', R.colonia); h.texto('C8', R.ciudad);
    h.texto('C10', f.emisor.nombre); h.texto('C11', f.sucursal); h.texto('C12', f.promotor);
    h.numero('C13', serialFecha(f.fechaFactura)); h.numero('C14', serialFecha(f.fechaOperacion));
    h.texto('C15', f.formaPago); h.texto('C16', f.metodoPago); h.texto('C17', f.noCuenta);
    h.texto('C18', f.moneda || 'PESOS MEXICANOS'); h.texto('C20', f.usoCfdi);

    // Estilos originales del renglón de concepto (23) y de totales (24–26)
    const estiloConcepto = COLS.map(c => h.estilo(c + '23'));
    const estiloTot = [24, 25, 26].map(r => COLS.map(c => h.estilo(c + r)));
    const altoConcepto = (h.fila(23).attrs.match(/ht="([^"]+)"/) || [])[1] || '60';
    const altoTot = [24, 25, 26].map(r => (h.fila(r).attrs.match(/ht="([^"]+)"/) || [])[1] || '24.9');

    let subtotal = 0;
    f.conceptos.forEach((k, i) => {
      const r = 23 + i;
      if (i > 0) { COLS.forEach((c, ci) => h.poner(c + r, null, { estilo: estiloConcepto[ci], borrar: true })); h.alto(r, altoConcepto); }
      const imp = r2(k.cantidad * k.pu); subtotal += imp;
      h.numero('B' + r, k.cantidad); h.texto('C' + r, k.conceptoExcel); h.valor('D' + r, k.clave_prod_serv);
      h.texto('E' + r, (k.descripcion_prod_serv || '').toUpperCase()); h.texto('F' + r, k.clave_unidad);
      h.texto('G' + r, (k.descripcion_unidad || '').toUpperCase()); h.numero('H' + r, k.pu);
      h.formula('I' + r, `H${r}*B${r}`, imp);
    });
    subtotal = r2(subtotal);
    const t0 = 23 + n;
    if (n > 1) {
      [0, 1, 2].forEach(j => {
        const r = t0 + j;
        COLS.forEach((c, ci) => h.poner(c + r, null, { estilo: estiloTot[j][ci], borrar: true }));
        h.alto(r, altoTot[j]);
        h.texto('F' + r, ['SUBTOTAL:', 'IVA:', 'TOTAL:'][j]);
      });
    }
    const iva = subtotal * 0.16, total = subtotal + iva;
    h.formula('I' + t0, n === 1 ? 'I23' : `SUM(I23:I${22 + n})`, subtotal);
    h.formula('I' + (t0 + 1), `I${t0}*0.16`, iva);
    h.formula('I' + (t0 + 2), `I${t0}+I${t0 + 1}`, total);

    let out = h.toString();
    if (n > 1) {
      out = out.replace(/<mergeCell ref="F2[456]:H2[456]"\/>/g, '')
        .replace('</mergeCells>', [0, 1, 2].map(j => `<mergeCell ref="F${t0 + j}:H${t0 + j}"/>`).join('') + '</mergeCells>');
      const total = (out.match(/<mergeCell ref=/g) || []).length;
      out = out.replace(/<mergeCells count="\d+">/, `<mergeCells count="${total}">`);
    }
    zip.file(SHEET, out);

    // Excel recalcula al abrir; la cadena de cálculo vieja se elimina para que no haya avisos de reparación
    if (zip.file('xl/calcChain.xml')) {
      zip.remove('xl/calcChain.xml');
      const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
      zip.file('xl/_rels/workbook.xml.rels', rels.replace(/<Relationship [^>]*Target="calcChain\.xml"[^>]*\/>/, ''));
      const ct = await zip.file('[Content_Types].xml').async('string');
      zip.file('[Content_Types].xml', ct.replace(/<Override [^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, ''));
    }
    const wb = await zip.file('xl/workbook.xml').async('string');
    zip.file('xl/workbook.xml', wb.replace(/<calcPr([^>]*?)\s*\/>/, (m, a) => /fullCalcOnLoad/.test(a) ? m : `<calcPr${a} fullCalcOnLoad="1"/>`));

    const buffer = await zip.generateAsync({ type: typeof window === 'undefined' ? 'nodebuffer' : 'arraybuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    return { buffer, nombre: nombreArchivo({ ...f, total }), total };
  }

  const api = { generar, nombreArchivo, limpiarArchivo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GeneradorExcel = api;
})(typeof window !== 'undefined' ? window : globalThis);
