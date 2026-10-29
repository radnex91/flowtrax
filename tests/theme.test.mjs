import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOGO_MAX, encre, hexValide, logoAcceptable } from '../public/assets/theme.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const module_ = readFileSync(resolve(root, 'public/assets/theme.js'), 'utf8');
const amorcage = readFileSync(resolve(root, 'public/assets/theme-boot.js'), 'utf8');

test('une couleur d’accent est un hexadécimal complet, jamais un fragment', () => {
  assert.equal(hexValide('#C4560B'), true);
  assert.equal(hexValide('#f28c38'), true);
  assert.equal(hexValide('C4560B'), false, 'le # est obligatoire');
  assert.equal(hexValide('#C4560'), false, 'six chiffres, pas cinq');
  assert.equal(hexValide('#C4560B00'), false, 'pas d’alpha');
  assert.equal(hexValide('#GGGGGG'), false, 'G n’est pas un chiffre hexadécimal');
  assert.equal(hexValide(''), false, 'vide = couleur d’origine, pas une couleur');
});

test('le texte posé sur l’accent reste lisible dans les deux modes', () => {
  assert.equal(encre('#F2B705'), '#1A120C', 'jaune signal : encre sombre');
  assert.equal(encre('#C4560B'), '#FFFFFF', 'orange brûlé : encre blanche');
  assert.equal(encre('#14232E'), '#FFFFFF', 'bleu plaque : encre blanche');
  assert.equal(encre('#F8F4F0'), '#1A120C', 'fond clair : encre sombre');
});

test('l’amorçage calcule l’encre avec le même seuil que le module', () => {
  // theme-boot.js s’exécute avant le premier rendu et ne peut pas importer le
  // module : si les deux formules divergent, l’écran change de couleur au
  // moment où la base répond.
  assert.match(module_, /0\.2126 \* c\[0\]/);
  assert.match(amorcage, /0\.2126 \* c\[0\]/);
  assert.match(module_, /> 0\.32 \?/);
  assert.match(amorcage, /> 0\.32 \?/);
});

test('un logo stocké est une image encodée, jamais une adresse quelconque', () => {
  assert.equal(logoAcceptable(''), true, 'vide = logo d’origine');
  assert.equal(logoAcceptable('data:image/png;base64,iVBORw0KGgo='), true);
  assert.equal(logoAcceptable('data:image/jpeg;base64,/9j/4AAQ'), true);
  assert.equal(logoAcceptable('data:image/svg+xml;base64,PHN2Zz4='), true);

  assert.equal(logoAcceptable('javascript:alert(1)'), false);
  assert.equal(logoAcceptable('https://exemple.test/logo.png'), false);
  assert.equal(logoAcceptable('data:text/html;base64,PHNjcmlwdD4='), false);
  assert.equal(
    logoAcceptable('data:image/png;base64,' + 'A'.repeat(LOGO_MAX)),
    false,
    'au-delà du plafond, la ligne settings refuserait l’écriture : autant le dire ici'
  );
});

test('la réduction du logo borne le côté à 320 px', () => {
  // l’écran affiche le logo à 62 px de haut : sans réduction, une photo de
  // téléphone dépasserait le plafond de la colonne et l’enregistrement serait
  // refusé par la garde SQL.
  assert.match(module_, /const cote = 320/);
  assert.match(module_, /Math\.min\(1, cote \/ Math\.max\(largeur, hauteur\)\)/);
  assert.match(module_, /image\/svg\+xml/);
});
