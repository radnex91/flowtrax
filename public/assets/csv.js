// Export CSV — fonctions pures, sans DOM, testables seules.
// Format retenu : point-virgule, BOM UTF-8, fins de ligne CRLF.
// C'est ce qu'Excel attend en locale francophone ; la virgule décimale aussi.

const RISQUE = /^[=+\-@\t\r]/;

/** Prépare une valeur : neutralise les formules, protège les séparateurs. */
export function cellule(v) {
  if (v == null) return '';

  let s = String(v);

  // une cellule qui commence par = + - @ est exécutée par Excel : on la
  // désamorce. Le contenu reste lisible, ce n'est pas une donnée perdue.
  if (RISQUE.test(s)) s = "'" + s;

  if (/[";\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * @param {{l: string, k?: string, f?: (ligne: any) => any}[]} colonnes
 * @param {any[]} lignes
 */
export function csv(colonnes, lignes) {
  const entete = colonnes.map((c) => cellule(c.l)).join(';');
  const corps = lignes.map((l) =>
    colonnes.map((c) => cellule(typeof c.f === 'function' ? c.f(l) : l[c.k])).join(';')
  );
  return '\uFEFF' + [entete, ...corps].join('\r\n') + '\r\n';
}

/** Nombre à la française, sans séparateur de milliers (ambigu en CSV). */
export function nombre(v, dec = 0) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(dec).replace('.', ',');
}

export function nomFichier(base, du, au) {
  return base + '-' + du + '_' + au + '.csv';
}
