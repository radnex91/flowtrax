// Lecture du journal d'audit : fonctions pures, testables sans navigateur.
// `audit_log` conserve l'instantané complet de la ligne avant et après
// (to_jsonb), pas un diff. On le compare ici, champ par champ.

export const CHAMPS = [
  ['date_service', 'Date de service'],
  ['programme', 'Programme'],
  ['bordereau', 'Bordereau'],
  ['h_depart', 'Heure de départ'],
  ['h_arrivee', 'Heure d\'arrivée'],
  ['eff_arrivee', 'Effectif à l\'arrivée'],
  ['eff_complete', 'Effectif complété'],
  ['places_snapshot', 'Places'],
  ['axe_id', 'Ligne'],
  ['provenance_id', 'Provenance'],
  ['destination_id', 'Destination'],
  ['vehicule_id', 'Véhicule'],
  ['statut', 'Statut'],
  ['motif_annulation', 'Motif d\'annulation'],
];

/** @param {'insert'|'update'|string} action */
export function resumeAction(action, avant, apres) {
  if (String(action).toLowerCase() === 'insert') return 'Déclaration';
  if (apres && apres.statut === 'ANNULE' && (!avant || avant.statut !== 'ANNULE')) return 'Annulation';
  if (avant && apres && avant.statut === 'ANNULE' && apres.statut === 'ACTIF') return 'Réactivation';
  return 'Correction';
}

/**
 * @param {object|null} avant
 * @param {object|null} apres
 * @param {(champ: string, valeur: any) => string} libelle
 */
export function diffChamps(avant, apres, libelle = (c, v) => (v == null || v === '' ? '—' : String(v))) {
  if (!avant || !apres) return [];

  const out = [];
  for (const [champ, label] of CHAMPS) {
    const a = avant[champ] == null ? null : avant[champ];
    const b = apres[champ] == null ? null : apres[champ];

    // jsonb omet les clés nulles : absence et chaîne vide sont la même chose
    if (String(a ?? '') === String(b ?? '')) continue;

    out.push({ champ, label, avant: libelle(champ, a), apres: libelle(champ, b) });
  }
  return out;
}
