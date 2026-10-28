/**
 * Format des messages WhatsApp — repris À L'IDENTIQUE de l'application
 * « Départs Danay Express ». Toute modification ici change ce que lisent
 * les groupes de planification : à ne toucher qu'en connaissance de cause.
 */

export const PROGRAMMES = {
  DEBUT: 'Début de programme',
  SUITE: 'Suite de programme',
  FIN: 'Fin de programme',
  DEBUT_FIN: 'Début et fin de programme',
};

export const PROGRAMMES_COURTS = {
  DEBUT: 'Début',
  SUITE: 'Suite',
  FIN: 'Fin',
  DEBUT_FIN: 'Début et fin',
};

export function pct(x) {
  return x == null || !isFinite(x) ? '–' : Math.round(x * 100) + ' %';
}

export function cls(x) {
  return x == null ? '' : x >= 0.8 ? 'ok' : x >= 0.5 ? 'warn' : 'bad';
}

export function libelleAxe(prov, ligne, dest) {
  const L = String(ligne).toUpperCase();
  const sens = /\bNORD\b/.test(L) ? 'NORD ' : /\bSUD\b/.test(L) ? 'SUD ' : '';
  const type = /\bLOCATION\b/.test(L) ? 'LOCATION ' : 'AXE ';
  return String(prov).toUpperCase() + ' - ' + type + sens + String(dest || '').toUpperCase();
}

/**
 * @param {object} d  saisie : agence, axe, provenance, destination, bordereau,
 *                    hDep, effArr, effComp, chauffeur, convoyeur, chefPiste
 * @param {object} r  valeurs calculées : programme, immat, places, dispo, total,
 *                    taux, hArr, passants [{agence, n}], axePublie (optionnel)
 * @param {boolean} corr  message de correction (modification d'un départ existant)
 */
export function waText(d, r, corr) {
  const lignes = [
    (corr ? '*CORRECTION · ' : '*') +
      'DÉPART ' + String(d.agence).toUpperCase() +
      ' · ' + String(r.programme).toUpperCase() + '*',
  ];

  if (corr) lignes.push('_Ce message remplace le précédent pour ce départ._');

  lignes.push(
    'Axe : ' + (r.axePublie || libelleAxe(d.provenance, d.axe, d.destination)),
    'Axe : ' + d.axe,
    'Véhicule : ' + r.immat + ' (' + r.places + ' places)',
    'Bordereau : ' + d.bordereau,
    'Provenance : ' + d.provenance,
    'Destination finale : ' + d.destination,
    'Arrivée : ' + (r.hArr || '—') + ' · Départ : ' + d.hDep,
    'Effectif à l\'arrivée : ' + d.effArr + ' · Places disponibles : ' + r.dispo,
    'Effectif complété : ' + d.effComp + ' · Total à bord : ' + r.total,
    'Taux de remplissage agence : *' + pct(r.taux) + '*'
  );

  if (r.passants && r.passants.length) {
    lignes.push('Passants : ' + r.passants.map((p) => p.agence + ' ' + p.n).join(' · '));
  }

  lignes.push(
    'Chauffeur : ' + d.chauffeur,
    'Convoyeur : ' + d.convoyeur,
    'Chef de piste : ' + d.chefPiste
  );

  return lignes.join('\n');
}

/**
 * @param {object} x  départ annulé : immat, bordereau, destination, hDep, programme (libellé)
 * @param {string} agence  nom de l'agence qui annule
 */
export function waAnnul(x, agence) {
  return [
    '*ANNULATION · DÉPART ' + String(agence).toUpperCase() + '*',
    'Véhicule : ' + x.immat,
    'Bordereau : ' + x.bordereau,
    'Destination finale : ' + x.destination,
    'Heure de départ : ' + x.hDep,
    x.programme ? 'Programme : ' + x.programme : '',
    '_Ce départ est annulé : ne pas tenir compte du message précédent._',
  ]
    .filter(Boolean)
    .join('\n');
}

/** "09:00:00" -> "09:00" (Postgres renvoie les TIME avec les secondes) */
export function hhmm(t) {
  return t == null ? '' : String(t).slice(0, 5);
}
