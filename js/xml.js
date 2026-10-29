/* Lectura de CFDI (3.3 y 4.0) para alimentar el backlog:
 * receptor → clientes, emisor → facturadoras, conceptos → códigos SAT aprendidos. */
(function () {
  const attr = (n, k) => (n && (n.getAttribute(k) || n.getAttribute(k.charAt(0).toLowerCase() + k.slice(1)))) || '';
  const porNombre = (doc, local) => [...doc.getElementsByTagName('*')].filter(n => n.localName === local);

  /** @returns {comprobante, emisor, receptor, conceptos[]} o lanza error */
  function leerCFDI(texto, nombreArchivo) {
    const doc = new DOMParser().parseFromString(texto, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error(`${nombreArchivo}: no es un XML válido`);
    const comp = porNombre(doc, 'Comprobante')[0];
    if (!comp) throw new Error(`${nombreArchivo}: no es un CFDI (no tiene Comprobante)`);
    const e = porNombre(doc, 'Emisor')[0], r = porNombre(doc, 'Receptor')[0];
    const uuid = attr(porNombre(doc, 'TimbreFiscalDigital')[0], 'UUID');
    return {
      archivo: nombreArchivo, uuid,
      comprobante: {
        version: attr(comp, 'Version'), fecha: attr(comp, 'Fecha'), formaPago: attr(comp, 'FormaPago'),
        metodoPago: attr(comp, 'MetodoPago'), moneda: attr(comp, 'Moneda'), total: attr(comp, 'Total'), tipo: attr(comp, 'TipoDeComprobante'),
      },
      emisor: { rfc: attr(e, 'Rfc').toUpperCase(), nombre: attr(e, 'Nombre').trim() },
      receptor: {
        rfc: attr(r, 'Rfc').toUpperCase(), nombre: attr(r, 'Nombre').trim(),
        cp: attr(r, 'DomicilioFiscalReceptor'), usoCfdi: attr(r, 'UsoCFDI'),
      },
      conceptos: porNombre(doc, 'Concepto').map(c => ({
        descripcion: attr(c, 'Descripcion').trim(), claveProdServ: attr(c, 'ClaveProdServ'),
        claveUnidad: attr(c, 'ClaveUnidad').toUpperCase(), unidad: attr(c, 'Unidad'),
      })),
    };
  }

  /** Lee archivos .xml y .zip (con XML adentro). */
  async function leerArchivos(files) {
    const textos = [], errores = [];
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) {
        try {
          const zip = await JSZip.loadAsync(f);
          for (const [n, entry] of Object.entries(zip.files)) if (!entry.dir && /\.xml$/i.test(n)) textos.push([n.split('/').pop(), await entry.async('string')]);
        } catch (e) { errores.push(`${f.name}: no se pudo abrir el ZIP`); }
      } else if (/\.xml$/i.test(f.name) || f.type.includes('xml')) textos.push([f.name, await f.text()]);
      else errores.push(`${f.name}: no es XML ni ZIP`);
    }
    const cfdis = [];
    for (const [n, t] of textos) { try { cfdis.push(leerCFDI(t, n)); } catch (e) { errores.push(e.message); } }
    return { cfdis, errores };
  }

  window.LectorXML = { leerCFDI, leerArchivos };
})();
