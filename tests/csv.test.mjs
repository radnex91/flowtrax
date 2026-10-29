import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellule, csv, nombre, nomFichier, analyserCsv, parcDepuisCsv } from '../public/assets/csv.js';

test('cellule : séparateurs et guillemets protégés', () => {
  assert.equal(cellule(null), '');
  assert.equal(cellule('AG01'), 'AG01');
  assert.equal(cellule('a;b'), '"a;b"');
  assert.equal(cellule('a"b'), '"a""b"');
  assert.equal(cellule('a\nb'), '"a\nb"');
  assert.equal(cellule(30), '30');
});

test('cellule : une formule Excel est désamorcée', () => {
  assert.equal(cellule('=1+1'), "'=1+1");
  assert.equal(cellule('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(cellule('+33 6'), "'+33 6");
});

test('csv : BOM, entête, CRLF, colonnes calculées', () => {
  const texte = csv(
    [{ l: 'Jour', k: 'jour' }, { l: 'Taux', f: (l) => (l.taux == null ? '' : nombre(l.taux * 100, 1)) }],
    [
      { jour: '2026-10-01', taux: 0.8567 },
      { jour: '2026-10-02', taux: null },
    ]
  );

  assert.ok(texte.startsWith('\uFEFF'), 'BOM UTF-8 manquant');
  assert.ok(texte.includes('\r\n'), 'fins de ligne CRLF attendues');
  assert.equal(
    texte,
    '\uFEFF' + 'Jour;Taux' + '\r\n' + '2026-10-01;85,7' + '\r\n' + '2026-10-02;' + '\r\n'
  );
});

test('nombre : virgule décimale, valeur absente vide', () => {
  assert.equal(nombre(85.67, 1), '85,7');
  assert.equal(nombre('0.5', 0), '1');
  assert.equal(nombre(null), '');
  assert.equal(nombre('abc'), '');
});

test('nomFichier : période lisible et triable', () => {
  assert.equal(nomFichier('departs', '2026-10-01', '2026-10-27'), 'departs-2026-10-01_2026-10-27.csv');
});

/* ------------------------------------------------------------------ lecture */

test('analyserCsv : le séparateur se devine sur la première ligne', () => {
  // collé depuis Excel : tabulations
  assert.deepEqual(analyserCsv('LT1\tHiger\tBus 70\t70'), [['LT1', 'Higer', 'Bus 70', '70']]);
  // CSV français : points-virgules
  assert.deepEqual(analyserCsv('LT1;Higer;Bus 70;70'), [['LT1', 'Higer', 'Bus 70', '70']]);
  // CSV anglais : virgules
  assert.deepEqual(analyserCsv('LT1,Higer,Bus 70,70'), [['LT1', 'Higer', 'Bus 70', '70']]);
});

test('analyserCsv : guillemets, retours à la ligne, ligne vide conservée', () => {
  const texte = 'LT1;"Bus; 70 places";70\r\n\r\n"LT2";"Bus\n2 étages";80\r\n';
  assert.deepEqual(analyserCsv(texte), [
    ['LT1', 'Bus; 70 places', '70'],
    [''],
    ['LT2', 'Bus\n2 étages', '80'],
  ]);
  // un guillemet doublé rend un guillemet
  assert.deepEqual(analyserCsv('"a""b";1'), [['a"b', '1']]);
});

test('parcDepuisCsv : immatriculation nettoyée, actif par défaut, entête ignoré', () => {
  const { lignes, refus } = parcDepuisCsv(
    'Immatriculation;Marque;Type;Places;En service\n' +
      'lt 0171 he;Higer;Bus 70 places;70;oui\n' +
      'LT0500HE;Toyota;Coaster;30;non\n' +
      'LT0600HE;Scania;;50\n'
  );

  assert.equal(refus.length, 0);
  assert.deepEqual(lignes, [
    { immat: 'LT0171HE', marque: 'Higer', type: 'Bus 70 places', places: 70, actif: true },
    { immat: 'LT0500HE', marque: 'Toyota', type: 'Coaster', places: 30, actif: false },
    { immat: 'LT0600HE', marque: 'Scania', type: '', places: 50, actif: true },
  ]);
});

test('parcDepuisCsv : une ligne refusée garde son numéro et ne bloque pas les autres', () => {
  const { lignes, refus } = parcDepuisCsv(
    'LT0171HE;Higer;Bus;70\n' +
      '\n' + // ligne vide : elle compte dans le rang, mais n'est ni véhicule ni refus
      ';Toyota;Coaster;30\n' +
      'lt0171he;Higer;Bus;70\n' +
      'LT0600HE;Scania;Bus;70 places\n' +
      'LT0700HE;Isuzu;Bus;0\n' +
      'LT0800HE;Isuzu;Bus;45\n'
  );

  assert.deepEqual(
    lignes.map((l) => l.immat),
    ['LT0171HE', 'LT0800HE']
  );
  assert.deepEqual(refus, [
    { n: 3, motif: 'immatriculation vide' },
    { n: 4, motif: 'LT0171HE déjà citée ligne 1' },
    { n: 5, motif: 'LT0600HE : places assises illisibles (« 70 places »)' },
    { n: 6, motif: 'LT0700HE : places assises illisibles (« 0 »)' },
  ]);
});

test('parcDepuisCsv : un texte vide ne rend ni ligne ni refus', () => {
  assert.deepEqual(parcDepuisCsv(''), { lignes: [], refus: [] });
  assert.deepEqual(parcDepuisCsv('  \n \n'), { lignes: [], refus: [] });
});
