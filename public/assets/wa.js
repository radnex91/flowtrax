/**
 * Format des messages WhatsApp — Danay Express SARL.
 * Mise en forme professionnelle pour les groupes de planification opérationnelle.
 *
 * Les trois textes vivent en base (migration 0013, table public.messages) : la
 * direction les réécrit depuis Administration → Messages. Ce fichier garde la
 * copie d'origine, qui sert tant que la base n'a pas répondu — et c'est elle
 * que tests/wa.test.mjs fige au caractère près.
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

/* ------------------------------------------------------- gabarits (0013) */

/** Textes d'origine : exactement ce que l'application envoyait avant 0013. */
export const MESSAGES_DEFAUT = {
  DEPART: `🚌 *DÉPART {agence_maj} · {programme_maj}*
━━━━━━━━━━━━━━━━━━━━
📍 *ITINÉRAIRE*
• Axe : {axe}
• Ligne : {ligne}
• Provenance : {provenance}
• Destination : {destination}

🚍 *VÉHICULE & BORDEREAU*
• Véhicule : {immat} ({places} places)
• Bordereau : N° {bordereau}

🕒 *HORAIRES*
• Arrivée : {h_arrivee} · Départ : {h_depart}

👥 *EFFECTIFS & REMPLISSAGE*
• Effectif arrivée : {eff_arrivee} (places dispo : {dispo})
• Effectif complété : {eff_complete} · Total à bord : {total}
• *Taux de remplissage agence : {taux}*
• Passants : {passants}

👨‍✈️ *ÉQUIPAGE*
• Chauffeur : {chauffeur}
• Convoyeur : {convoyeur}
• Chef de piste : {chef_piste}
━━━━━━━━━━━━━━━━━━━━
✨ _Danay Express SARL — Ensemble, vers de nouveaux horizons_`,

  CORRECTION: `🚨 *CORRECTION · DÉPART {agence_maj} · {programme_maj}*
━━━━━━━━━━━━━━━━━━━━
⚠️ _Ce message remplace et annule le précédent pour ce départ._
━━━━━━━━━━━━━━━━━━━━
📍 *ITINÉRAIRE*
• Axe : {axe}
• Ligne : {ligne}
• Provenance : {provenance}
• Destination : {destination}

🚍 *VÉHICULE & BORDEREAU*
• Véhicule : {immat} ({places} places)
• Bordereau : N° {bordereau}

🕒 *HORAIRES*
• Arrivée : {h_arrivee} · Départ : {h_depart}

👥 *EFFECTIFS & REMPLISSAGE*
• Effectif arrivée : {eff_arrivee} (places dispo : {dispo})
• Effectif complété : {eff_complete} · Total à bord : {total}
• *Taux de remplissage agence : {taux}*
• Passants : {passants}

👨‍✈️ *ÉQUIPAGE*
• Chauffeur : {chauffeur}
• Convoyeur : {convoyeur}
• Chef de piste : {chef_piste}
━━━━━━━━━━━━━━━━━━━━
✨ _Danay Express SARL — Ensemble, vers de nouveaux horizons_`,

  ANNULATION: `🚫 *ANNULATION · DÉPART {agence_maj}*
━━━━━━━━━━━━━━━━━━━━
🚍 Véhicule : {immat}
🔖 Bordereau : N° {bordereau}
📍 Destination : {destination}
🕒 Heure de départ : {h_depart}
📋 Programme : {programme}
━━━━━━━━━━━━━━━━━━━━
⚠️ _Ce départ est annulé : ne pas tenir compte du message précédent._`,
};

/** Variables proposées à l'écran, dans l'ordre où il les montre. */
export const VARIABLES = {
  DEPART: [
    ['agence', 'nom de l\'agence qui déclare'],
    ['agence_maj', 'le même nom, en majuscules'],
    ['programme', 'Début de programme, Suite…'],
    ['programme_maj', 'le même libellé, en majuscules'],
    ['axe', 'itinéraire publié (ex. AGENCE CENTRALE - AXE NORD AGENCE SUD)'],
    ['ligne', 'nom de la ligne (ex. NORD 1)'],
    ['provenance', 'agence de départ'],
    ['destination', 'agence d\'arrivée'],
    ['immat', 'immatriculation du véhicule'],
    ['places', 'places assises du véhicule'],
    ['bordereau', 'numéro de bordereau'],
    ['h_arrivee', 'heure d\'arrivée, « — » si l\'agence n\'en déclare pas'],
    ['h_depart', 'heure de départ'],
    ['eff_arrivee', 'effectif déjà à bord à l\'arrivée'],
    ['dispo', 'places encore disponibles'],
    ['eff_complete', 'effectif embarqué dans l\'agence'],
    ['total', 'total à bord'],
    ['taux', 'taux de remplissage de l\'agence (ex. 73 %)'],
    ['passants', 'autres agences et leurs effectifs ; la ligne s\'efface s\'il n\'y en a pas'],
    ['chauffeur', 'nom du chauffeur'],
    ['convoyeur', 'nom du convoyeur'],
    ['chef_piste', 'nom du chef de piste'],
  ],
  ANNULATION: [
    ['agence', 'nom de l\'agence qui annule'],
    ['agence_maj', 'le même nom, en majuscules'],
    ['immat', 'immatriculation du véhicule'],
    ['bordereau', 'numéro de bordereau'],
    ['destination', 'agence d\'arrivée'],
    ['h_depart', 'heure de départ'],
    ['programme', 'libellé du programme ; la ligne s\'efface s\'il est inconnu'],
  ],
};

/** Les gabarits lus en base, mis de côté par setGabarits(). */
const EN_BASE = {};

/**
 * Remplace les textes d'origine par ceux de la base. Un code absent ou vide
 * reprend son texte d'origine : une base à moitié réglée n'envoie pas de
 * message vide.
 */
export function setGabarits(gabarits) {
  for (const code of Object.keys(MESSAGES_DEFAUT)) {
    const v = gabarits && gabarits[code];
    EN_BASE[code] = typeof v === 'string' && v.trim() ? v : MESSAGES_DEFAUT[code];
  }
}

export function gabarit(code) {
  return EN_BASE[code] || MESSAGES_DEFAUT[code] || '';
}

export function variablesDe(code) {
  return code === 'ANNULATION' ? VARIABLES.ANNULATION : VARIABLES.DEPART;
}

const texte = (v) => (v == null ? '' : String(v));
const connu = (valeurs, j) => Object.prototype.hasOwnProperty.call(valeurs, j);

/**
 * Applique un gabarit aux valeurs d'un départ.
 * Une ligne qui ne porte que des variables vides disparaît : c'est ainsi que
 * « • Passants : … » ou « 📋 Programme : … » s'effacent quand il n'y a rien à
 * dire. Une variable inconnue reste affichée telle quelle — une faute de
 * frappe doit se voir, pas vider la ligne.
 */
export function rendreGabarit(gabarit, valeurs) {
  const v = valeurs || {};

  return String(gabarit == null ? '' : gabarit)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((ligne) => {
      const jetons = [...ligne.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]);
      if (!jetons.length) return true;
      return !jetons.every((j) => connu(v, j) && texte(v[j]) === '');
    })
    .map((ligne) => ligne.replace(/\{([a-z_]+)\}/g, (m, j) => (connu(v, j) ? texte(v[j]) : m)))
    .join('\n');
}

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
 * Les valeurs d'un départ, sous les noms que portent les gabarits. Exportée
 * pour que l'aperçu de l'écran Administration compose exactement comme
 * l'envoi, sans recopier la liste des variables.
 */
export function valeursDepart(d, r) {
  const passants =
    r.passants && r.passants.length
      ? r.passants.map((p) => p.agence + ' (' + p.n + ')').join(' · ')
      : '';

  return {
    agence: d.agence,
    agence_maj: String(d.agence).toUpperCase(),
    programme: r.programme,
    programme_maj: String(r.programme).toUpperCase(),
    axe: r.axePublie || libelleAxe(d.provenance, d.axe, d.destination),
    ligne: d.axe,
    provenance: d.provenance,
    destination: d.destination,
    immat: r.immat,
    places: r.places,
    bordereau: d.bordereau,
    h_arrivee: r.hArr || '—',
    h_depart: d.hDep,
    eff_arrivee: d.effArr,
    dispo: r.dispo,
    eff_complete: d.effComp,
    total: r.total,
    taux: pct(r.taux),
    passants,
    chauffeur: d.chauffeur,
    convoyeur: d.convoyeur,
    chef_piste: d.chefPiste,
  };
}

/**
 * Construit le message WhatsApp professionnel pour un départ.
 * @param {object} d  saisie : agence, axe, provenance, destination, bordereau,
 *                    hDep, effArr, effComp, chauffeur, convoyeur, chefPiste
 * @param {object} r  valeurs calculées : programme, immat, places, dispo, total,
 *                    taux, hArr, passants [{agence, n}], axePublie (optionnel)
 * @param {boolean} corr  message de correction (modification d'un départ existant)
 */
export function waText(d, r, corr) {
  return rendreGabarit(gabarit(corr ? 'CORRECTION' : 'DEPART'), valeursDepart(d, r));
}

export function valeursAnnulation(x, agence) {
  return {
    agence,
    agence_maj: String(agence).toUpperCase(),
    immat: x.immat,
    bordereau: x.bordereau,
    destination: x.destination,
    h_depart: x.hDep,
    programme: x.programme,
  };
}

/**
 * Construit le message WhatsApp d'annulation.
 * @param {object} x  départ annulé : immat, bordereau, destination, hDep, programme (libellé)
 * @param {string} agence  nom de l'agence qui annule
 */
export function waAnnul(x, agence) {
  return rendreGabarit(gabarit('ANNULATION'), valeursAnnulation(x, agence));
}

/** "09:00:00" -> "09:00" (Postgres renvoie les TIME avec les secondes) */
export function hhmm(t) {
  return t == null ? '' : String(t).slice(0, 5);
}
