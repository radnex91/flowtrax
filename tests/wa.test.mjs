import { test } from 'node:test';
import assert from 'node:assert/strict';

import { waText, waAnnul, pct, cls, libelleAxe, hhmm } from '../public/assets/wa.js';

const d = {
  agence: 'Agence Centrale',
  axe: 'NORD 1',
  provenance: 'Agence Centrale',
  destination: 'Agence Sud',
  bordereau: '12345',
  hDep: '09:00',
  effArr: 0,
  effComp: 45,
  chauffeur: 'Jean',
  convoyeur: 'Paul',
  chefPiste: 'Marie',
};

const r = {
  programme: 'Début de programme',
  immat: 'LT0171HE',
  places: 62,
  dispo: 62,
  total: 45,
  taux: 0.7258,
  hArr: '',
  passants: [{ agence: 'Agence Nord', n: 20 }],
};

test('pct : arrondi, tiret pour valeur absente, chaîne PostgREST acceptée', () => {
  assert.equal(pct(0.7258), '73 %');
  assert.equal(pct(1), '100 %');
  assert.equal(pct(0), '0 %');
  assert.equal(pct(null), '–');
  assert.equal(pct(undefined), '–');
  assert.equal(pct('0.7258'), '73 %');
});

test('cls : seuils 50 % / 80 %', () => {
  assert.equal(cls(0.8), 'ok');
  assert.equal(cls(0.79), 'warn');
  assert.equal(cls(0.5), 'warn');
  assert.equal(cls(0.49), 'bad');
  assert.equal(cls(null), '');
});

test('libelleAxe : sens, type et majuscules', () => {
  assert.equal(libelleAxe('Agence Centrale', 'NORD 1', 'Agence Sud'), 'AGENCE CENTRALE - AXE NORD AGENCE SUD');
  assert.equal(libelleAxe('Agence Centrale', 'SUD 2', 'Agence Sud'), 'AGENCE CENTRALE - AXE SUD AGENCE SUD');
  assert.equal(libelleAxe('Agence Centrale', 'LOCATION 1', 'Agence Sud'), 'AGENCE CENTRALE - LOCATION AGENCE SUD');
});

test('hhmm : Postgres renvoie les secondes', () => {
  assert.equal(hhmm('09:00:00'), '09:00');
  assert.equal(hhmm(null), '');
});

test('message de départ : mise en forme professionnelle Danay Express', () => {
  const attendu = [
    '🚌 *DÉPART AGENCE CENTRALE · DÉBUT DE PROGRAMME*',
    '━━━━━━━━━━━━━━━━━━━━',
    '📍 *ITINÉRAIRE*',
    '• Axe : AGENCE CENTRALE - AXE NORD AGENCE SUD',
    '• Ligne : NORD 1',
    '• Provenance : Agence Centrale',
    '• Destination : Agence Sud',
    '',
    '🚍 *VÉHICULE & BORDEREAU*',
    '• Véhicule : LT0171HE (62 places)',
    '• Bordereau : N° 12345',
    '',
    '🕒 *HORAIRES*',
    '• Arrivée : — · Départ : 09:00',
    '',
    '👥 *EFFECTIFS & REMPLISSAGE*',
    "• Effectif arrivée : 0 (places dispo : 62)",
    '• Effectif complété : 45 · Total à bord : 45',
    '• *Taux de remplissage agence : 73 %*',
    '• Passants : Agence Nord (20)',
    '',
    '👨‍✈️ *ÉQUIPAGE*',
    '• Chauffeur : Jean',
    '• Convoyeur : Paul',
    '• Chef de piste : Marie',
    '━━━━━━━━━━━━━━━━━━━━',
    '✨ _Danay Express SARL — Ensemble, vers de nouveaux horizons_'
  ].join('\n');

  assert.equal(waText(d, r, false), attendu);
});

test('message de correction : entête et mention de remplacement', () => {
  const t = waText(d, r, true);
  const lignes = t.split('\n');

  assert.equal(lignes[0], '🚨 *CORRECTION · DÉPART AGENCE CENTRALE · DÉBUT DE PROGRAMME*');
  assert.equal(lignes[2], '⚠️ _Ce message remplace et annule le précédent pour ce départ._');
  assert.ok(t.includes('• Axe : AGENCE CENTRALE - AXE NORD AGENCE SUD'));
});

test('sans passants : la ligne disparaît, le reste ne bouge pas', () => {
  const t = waText(d, { ...r, passants: [] }, false);
  assert.ok(!t.includes('Passants :'));
  assert.ok(t.includes('Chef de piste : Marie'));
});

test('heure d\'arrivée vide : tiret cadratin', () => {
  assert.ok(waText(d, r, false).includes('Arrivée : — · Départ : 09:00'));
});

test('message d\'annulation : identique à l\'application actuelle', () => {
  const attendu = [
    '🚫 *ANNULATION · DÉPART AGENCE CENTRALE*',
    '━━━━━━━━━━━━━━━━━━━━',
    '🚍 Véhicule : LT0171HE',
    '🔖 Bordereau : N° 12345',
    '📍 Destination : Agence Sud',
    '🕒 Heure de départ : 09:00',
    '📋 Programme : Début de programme',
    '━━━━━━━━━━━━━━━━━━━━',
    '⚠️ _Ce départ est annulé : ne pas tenir compte du message précédent._',
  ].join('\n');

  assert.equal(
    waAnnul(
      {
        immat: 'LT0171HE',
        bordereau: '12345',
        destination: 'Agence Sud',
        hDep: '09:00',
        programme: 'Début de programme',
      },
      'Agence Centrale'
    ),
    attendu
  );
});
