/* Capa de datos: Supabase (compartido) o localStorage (modo local). */
(function () {
  const C = window.CONFIG;
  const T = { emisoras: 'folio_emisoras', receptoras: 'folio_receptoras', conceptos: 'folio_conceptos_sat' };
  const usarSupabase = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY && window.supabase);
  const sb = usarSupabase ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;

  const lsKey = t => 'folios_' + t;
  const lsGet = t => { try { return JSON.parse(localStorage.getItem(lsKey(t)) || '[]'); } catch { return []; } };
  const lsSet = (t, v) => localStorage.setItem(lsKey(t), JSON.stringify(v));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));

  function err(e) { if (e) throw new Error(e.message || String(e)); }

  const Datos = {
    modo: usarSupabase ? 'supabase' : 'local',
    T,
    async sesion() {
      if (!sb) return { user: { email: 'modo local' } };
      const { data } = await sb.auth.getSession();
      return data.session;
    },
    async login(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password }); err(error);
    },
    async logout() { if (sb) await sb.auth.signOut(); location.reload(); },

    async listar(tabla) {
      if (!sb) return lsGet(tabla).sort((a, b) => String(a.nombre || a.concepto_normalizado).localeCompare(b.nombre || b.concepto_normalizado));
      const orden = tabla === 'conceptos' ? 'concepto_normalizado' : 'nombre';
      const { data, error } = await sb.from(T[tabla]).select('*').order(orden); err(error);
      return data;
    },
    async guardar(tabla, obj) {
      const o = { ...obj };
      Object.keys(o).forEach(k => { if (k.startsWith('_')) delete o[k]; });
      if (!sb) {
        const l = lsGet(tabla);
        if (!o.id) { o.id = uuid(); l.push(o); } else { const i = l.findIndex(x => x.id === o.id); if (i >= 0) l[i] = o; else l.push(o); }
        lsSet(tabla, l); return o;
      }
      if (!o.id) delete o.id;
      o.updated_at = new Date().toISOString();
      const { data, error } = await sb.from(T[tabla]).upsert(o).select().single(); err(error);
      return data;
    },
    async borrar(tabla, id) {
      if (!sb) { lsSet(tabla, lsGet(tabla).filter(x => x.id !== id)); return; }
      const { error } = await sb.from(T[tabla]).delete().eq('id', id); err(error);
    },
    /** Registra/actualiza los códigos SAT confirmados para cada concepto. */
    async aprender(items) {
      const porClave = new Map();
      items.forEach(i => { if (i.concepto_normalizado && i.clave_prod_serv) porClave.set(i.concepto_normalizado, i); });
      if (!porClave.size) return;
      const existentes = await Datos.listar('conceptos');
      for (const [k, i] of porClave) {
        const prev = existentes.find(e => e.concepto_normalizado === k);
        const reg = {
          ...(prev ? { id: prev.id } : {}),
          concepto_normalizado: k,
          concepto_ejemplo: i.concepto_ejemplo,
          clave_prod_serv: i.clave_prod_serv,
          descripcion_prod_serv: i.descripcion_prod_serv,
          clave_unidad: i.clave_unidad,
          descripcion_unidad: i.descripcion_unidad,
          usos: (prev?.usos || 0) + 1,
        };
        await Datos.guardar('conceptos', reg);
      }
    },
    async exportar() {
      return { emisoras: await Datos.listar('emisoras'), receptoras: await Datos.listar('receptoras'), conceptos: await Datos.listar('conceptos') };
    },
    async importar(json) {
      for (const t of ['emisoras', 'receptoras', 'conceptos']) for (const o of (json[t] || [])) await Datos.guardar(t, o);
    },
  };

  /* ---- Coincidencia de nombres leídos en la imagen contra el backlog ---- */
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/\b(S\.?\s?A\.?|DE|C\.?\s?V\.?|S\.?\s?C\.?|R\.?\s?L\.?|S\.?\s?A\.?\s?P\.?\s?I\.?)\b/g, ' ')
    .replace(/[^A-Z0-9Ñ]+/g, ' ').replace(/\s+/g, ' ').trim();
  function dice(a, b) {
    a = norm(a); b = norm(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const bi = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
    const A = bi(a), B = bi(b); let inter = 0;
    for (const [g, n] of A) inter += Math.min(n, B.get(g) || 0);
    return (2 * inter) / (a.length - 1 + b.length - 1);
  }
  Datos.buscarEmpresa = function (lista, texto) {
    if (!texto) return null;
    let mejor = null, p = 0;
    for (const e of lista) {
      const nombres = [e.nombre, e.nombre_archivo, ...String(e.alias || '').split(',')].filter(Boolean);
      for (const n of nombres) { const s = dice(texto, n); if (s > p) { p = s; mejor = e; } }
    }
    return p >= 0.72 ? mejor : null;
  };

  /* ---- Campos de cada tipo de empresa (se usan en backlog y en el alta rápida) ---- */
  Datos.CAMPOS = {
    emisoras: [
      { k: 'nombre', l: 'Nombre de la facturadora', nota: 'como debe salir en el Excel', req: true },
      { k: 'rfc', l: 'RFC', nota: 'opcional' },
      { k: 'nombre_archivo', l: 'Nombre corto', nota: 'para el nombre del archivo, ej. PUMAPONGO' },
      { k: 'alias', l: 'Otros nombres', nota: 'cómo aparece en las imágenes, separados por coma' },
    ],
    receptoras: [
      { k: 'nombre', l: 'Nombre del cliente', nota: 'como debe salir en el Excel', req: true },
      { k: 'rfc', l: 'RFC', req: true },
      { k: 'direccion', l: 'Dirección' },
      { k: 'cp', l: 'C.P.' },
      { k: 'colonia', l: 'Colonia' },
      { k: 'ciudad', l: 'Ciudad' },
      { k: 'nombre_archivo', l: 'Nombre corto', nota: 'para el nombre del archivo' },
      { k: 'alias', l: 'Otros nombres', nota: 'cómo aparece en las imágenes, separados por coma' },
      { k: 'sucursal', l: 'Sucursal', nota: 'opcional, valor por defecto' },
      { k: 'promotor', l: 'Promotor', nota: 'opcional, valor por defecto' },
      { k: 'no_cuenta', l: 'No. de cuenta', nota: 'opcional' },
      { k: 'forma_pago', l: 'Forma de pago', tipo: 'formaPago', nota: 'por defecto' },
      { k: 'metodo_pago', l: 'Método de pago', tipo: 'metodoPago', nota: 'por defecto' },
      { k: 'uso_cfdi', l: 'Uso de CFDI', tipo: 'usoCfdi', nota: 'por defecto' },
    ],
  };

  window.Datos = Datos;
})();
