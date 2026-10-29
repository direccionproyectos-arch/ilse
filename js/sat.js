/* Motor de reconocimiento de códigos SAT (c_ClaveProdServ) por concepto.
 * 1) Busca en lo aprendido (conceptos ya confirmados por el equipo).
 * 2) Si no hay, sugiere desde el catálogo oficial por similitud de palabras.
 * Funciona en navegador (window.SAT) y en Node (module.exports) para pruebas. */
(function (root) {
  const STOP = new Set(('de del la las el los y e en para por con a al o u sus su un una unos unas otros otras otro otra ' +
    'que se lo mas sin sobre entre tipo no ref referencia folio num numero').split(' '));

  function sinAcentos(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function stem(w) {
    if (w.length > 6 && w.endsWith('ciones')) return w.slice(0, -6) + 'cion';
    if (w.length > 5 && w.endsWith('es')) return w.slice(0, -2);
    if (w.length > 4 && w.endsWith('s')) return w.slice(0, -1);
    return w;
  }
  function tokens(s) {
    return sinAcentos(s).toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').split(/\s+/)
      .filter(w => w && w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w)).map(stem);
  }
  /** Normaliza un concepto para usarlo como llave de aprendizaje:
   *  quita referencias/números, acentos y palabras vacías. */
  function normalizarConcepto(s) {
    let t = sinAcentos(s).toUpperCase();
    t = t.replace(/\bREF(ERENCIA)?\b\s*:?.*$/, ' ');      // todo lo que sigue a REF/REFERENCIA
    t = t.replace(/[0-9]+/g, ' ').replace(/[^A-ZÑ ]+/g, ' ').replace(/\s+/g, ' ').trim();
    return t;
  }

  class MotorSAT {
    constructor(prodServ, unidades) {
      this.ps = prodServ;          // [[clave, descripcion], ...]
      this.unidades = unidades;    // [[clave, nombre], ...]
      this.psMap = new Map(prodServ.map(([c, d]) => [c, d]));
      this.uMap = new Map(unidades.map(([c, d]) => [c, d]));
      this.idx = new Map();        // token -> [indices]
      this.toks = prodServ.map(([, d], i) => {
        const t = [...new Set(tokens(d))];
        t.forEach(w => { if (!this.idx.has(w)) this.idx.set(w, []); this.idx.get(w).push(i); });
        return t;
      });
      this.vocab = [...this.idx.keys()];
      this.aprendidos = [];        // [{concepto_normalizado, clave_prod_serv, ...}]
    }
    setAprendidos(lista) {
      this.aprendidos = (lista || []).map(a => ({ ...a, _t: new Set(tokens(a.concepto_normalizado)) }));
    }
    descProdServ(c) { return this.psMap.get(String(c)) || ''; }
    descUnidad(c) { return this.uMap.get(String(c).toUpperCase()) || ''; }

    /** Devuelve {fuente:'aprendido'|'catalogo'|null, confianza, sugerencia, alternativas[]} */
    reconocer(concepto, opciones = {}) {
      const norm = normalizarConcepto(concepto);
      const exacto = this.aprendidos.find(a => a.concepto_normalizado === norm);
      if (exacto) return { fuente: 'aprendido', confianza: 'alta', sugerencia: exacto, alternativas: this.buscar(concepto, 6, opciones) };
      // aprendido parecido (Jaccard de palabras)
      const qt = new Set(tokens(norm));
      let mejor = null, mejorJ = 0;
      for (const a of this.aprendidos) {
        const inter = [...qt].filter(w => a._t.has(w)).length;
        const j = inter / (new Set([...qt, ...a._t]).size || 1);
        if (j > mejorJ) { mejorJ = j; mejor = a; }
      }
      const alternativas = this.buscar(concepto, 6, opciones);
      if (mejor && mejorJ >= 0.6) return { fuente: 'aprendido', confianza: 'media', sugerencia: mejor, alternativas };
      if (alternativas.length) {
        const a = alternativas[0];
        return { fuente: 'catalogo', confianza: 'baja', sugerencia: { clave_prod_serv: a.clave, descripcion_prod_serv: a.descripcion }, alternativas };
      }
      return { fuente: null, confianza: null, sugerencia: null, alternativas: [] };
    }

    /** Búsqueda libre en el catálogo: por clave (números) o por palabras. */
    buscar(texto, limite = 20, { preferirServicios = true } = {}) {
      const t = String(texto || '').trim();
      if (/^\d{2,8}$/.test(t)) {
        return this.ps.filter(([c]) => c.startsWith(t)).slice(0, limite).map(([c, d]) => ({ clave: c, descripcion: d, score: 1 }));
      }
      const q = [...new Set(tokens(normalizarConcepto(t) || t))];
      if (!q.length) return [];
      const puntos = new Map();
      q.forEach(w => {
        const exact = this.idx.get(w) || [];
        exact.forEach(i => puntos.set(i, (puntos.get(i) || 0) + 1));
        if (w.length >= 5) {
          const pre = w.slice(0, Math.max(5, w.length - 2));
          for (const v of this.vocab) {
            if (v !== w && v.startsWith(pre)) (this.idx.get(v) || []).forEach(i => puntos.set(i, (puntos.get(i) || 0) + 0.6));
          }
        }
      });
      const res = [];
      for (const [i, p] of puntos) {
        const [c, d] = this.ps[i];
        let s = p / q.length - this.toks[i].length * 0.015;
        if (preferirServicios && +c.slice(0, 2) >= 70 && +c.slice(0, 2) <= 94) s += 0.12;
        if (c.endsWith('00')) s += 0.03; // clases genéricas suelen ser más apropiadas
        res.push({ clave: c, descripcion: d, score: s });
      }
      res.sort((a, b) => b.score - a.score);
      return res.slice(0, limite);
    }
  }

  const api = { MotorSAT, normalizarConcepto, tokens };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SAT = api;
})(typeof window !== 'undefined' ? window : globalThis);
