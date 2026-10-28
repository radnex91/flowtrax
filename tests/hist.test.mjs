import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffChamps, resumeAction } from '../public/assets/hist.js';

const base = {
  date_service: '2026-10-27',
  programme: 'DEBUT',
  bordereau: 'B-1042',
  h_depart: '08:30:00',
  h_arrivee: null,
  eff_arrivee: 12,
  eff_complete: 30,
  places_snapshot: 62,
  axe_id: 1,
  provenance_id: 2,
  destination_id: 3,
  vehicule_id: 4,
  statut: 'ACTIF',
  motif_annulation: null,
};

test('resumeAction : déclaration, annulation, réactivation, correction', () => {
  assert.equal(resumeAction('insert', null, base), 'Déclaration');
  assert.equal(resumeAction('update', base, { ...base, statut: 'ANNULE' }), 'Annulation');
  assert.equal(resumeAction('update', { ...base, statut: 'ANNULE' }, base), 'Réactivation');
  assert.equal(resumeAction('update', base, { ...base, eff_complete: 31 }), 'Correction');
});

test('diffChamps : seuls les champs réellement modifiés sortent', () => {
  const apres = { ...base, h_depart: '09:00:00', eff_complete: 35 };
  const diff = diffChamps(base, apres, (c, v) => (c === 'h_depart' ? String(v).slice(0, 5) : String(v)));

  assert.equal(diff.length, 2);
  assert.deepEqual(
    diff.map((d) => d.label),
    ['Heure de départ', 'Effectif complété']
  );
  assert.equal(diff[0].avant, '08:30');
  assert.equal(diff[0].apres, '09:00');
});

test('diffChamps : annulation, le motif apparaît', () => {
  const apres = { ...base, statut: 'ANNULE', motif_annulation: 'Panne' };
  const diff = diffChamps(base, apres);

  assert.deepEqual(
    diff.map((d) => d.champ),
    ['statut', 'motif_annulation']
  );
  assert.equal(diff[0].apres, 'ANNULE');
});

test('diffChamps : déclaration (pas d\'avant) et mise à jour technique', () => {
  assert.deepEqual(diffChamps(null, base), []);
  assert.deepEqual(diffChamps(base, { ...base }), []);
});

test('diffChamps : null et chaîne vide sont la même chose', () => {
  const apres = { ...base, motif_annulation: '' };
  assert.deepEqual(diffChamps(base, apres), []);
});
