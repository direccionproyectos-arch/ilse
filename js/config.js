/* ====== CONFIGURACIÓN ======
 * 1) Pega aquí la URL y la "anon public key" de tu proyecto de Supabase
 *    (Supabase → Project Settings → API). Puedes usar el mismo proyecto
 *    de tu app de seguimiento de facturas; las tablas de este sistema
 *    empiezan con "folio_" para no mezclarse.
 * 2) Mientras SUPABASE_ANON_KEY esté vacío, la página funciona en
 *    "modo local": los datos se guardan sólo en ese navegador. */
window.CONFIG = {
  SUPABASE_URL: 'https://axhfjxcttpbkocbzkybo.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1ZnFpZWl1dmhoeXZ0ZnhsZ3d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzMTEyNTQsImV4cCI6MjEwODg4NzI1NH0.P6yvatUygQRarBd7ErUN7vX_uJM-UijQvOs-M7fL5IQ',

  // Cómo se escribe el concepto en el Excel. Variables: {CONCEPTO} {REFERENCIA}
  PLANTILLA_CONCEPTO: '{CONCEPTO} REF: {REFERENCIA}',

  // Valores por defecto (deben coincidir con las listas de la plantilla)
  DEFAULTS: {
    formaPago: '03 - Transferencia electrónica de fondos',
    metodoPago: 'PUE - Pago en una sola exhibición',
    usoCfdi: 'G03 - Gastos en general',
    moneda: 'PESOS MEXICANOS',
    claveUnidad: 'E48',
  },

  // Texto que se escribe en "DESCRIPCIÓN UNIDAD MEDIDA SAT" para unidades comunes
  NOMBRES_UNIDAD: { E48: 'SERVICIO', ACT: 'ACTIVIDAD', H87: 'PIEZA', XUN: 'UNIDAD', HUR: 'HORA', DAY: 'DIA', MON: 'MES', KGM: 'KILOGRAMO', LTR: 'LITRO', MTR: 'METRO' },
  UNIDADES_FRECUENTES: ['E48', 'ACT', 'H87', 'XUN', 'HUR', 'DAY', 'MON', 'KGM', 'LTR', 'MTR'],

  // Al sugerir desde el catálogo, dar prioridad a claves de servicios (70xxxxxx–94xxxxxx)
  PREFERIR_SERVICIOS: true,
};
