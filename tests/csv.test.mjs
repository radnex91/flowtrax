import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellule, csv, nombre, nomFichier } from '../public/assets/csv.js';

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
