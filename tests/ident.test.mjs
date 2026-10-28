import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DOMAINE,
  versEmail,
  identifiantValide,
  estTechnique,
  depuisEmail,
} from '../public/assets/ident.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fonction = readFileSync(resolve(root, 'supabase/functions/admin-comptes/index.ts'), 'utf8');
const migration = readFileSync(
  resolve(root, 'supabase/migrations/0005_identifiants.sql'),
  'utf8'
);

test('versEmail : un identifiant devient une adresse technique', () => {
  assert.equal(versEmail('ag01'), 'ag01@' + DOMAINE);
  assert.equal(versEmail('  AG01  '), 'ag01@' + DOMAINE);
  assert.equal(versEmail('agence.nord-1'), 'agence.nord-1@' + DOMAINE);
});

test('versEmail : une vraie adresse passe intacte', () => {
  // Les comptes amorcés à la main depuis le tableau de bord gardent leur email.
  assert.equal(versEmail('direction@danay.cd'), 'direction@danay.cd');
  assert.equal(versEmail(''), '');
});

test('identifiantValide : forme acceptée et refusée', () => {
  for (const bon of ['ag01', 'abc', 'agence.nord-1', 'a_b', '123', 'a'.repeat(32)]) {
    assert.ok(identifiantValide(bon), bon + ' devrait être accepté');
  }
  for (const mauvais of ['ab', 'a b', 'ag@01', '-ag01', 'a'.repeat(33), '', 'ag/01']) {
    assert.ok(!identifiantValide(mauvais), mauvais + ' devrait être refusé');
  }
});

test('estTechnique / depuisEmail : distinguer le fabriqué du fourni', () => {
  assert.ok(estTechnique('ag01@' + DOMAINE));
  assert.ok(!estTechnique('direction@danay.cd'));
  assert.equal(depuisEmail('ag01@' + DOMAINE), 'ag01');
  assert.equal(depuisEmail('AG01@' + DOMAINE.toUpperCase()), 'ag01');
});

test('le domaine, la forme et la longueur sont les mêmes dans les trois exemplaires', () => {
  // Trois copies de la règle : navigateur, fonction, contrainte SQL. Un
  // identifiant accepté à l'écran mais refusé en base serait incompréhensible.
  assert.ok(fonction.includes(`const DOMAINE = '${DOMAINE}'`), 'domaine différent dans la fonction');

  const formeFonction = fonction.match(/const IDENT = (\/.*\/);/);
  assert.ok(formeFonction, 'règle de forme absente de la fonction');
  assert.equal(formeFonction[1], '/^[a-z0-9][a-z0-9._-]{2,31}$/');

  assert.ok(
    migration.includes("username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'"),
    'la contrainte SQL doit poser la même forme'
  );
});

test('la connexion convertit l’identifiant, la création aussi', () => {
  const login = readFileSync(resolve(root, 'public/assets/login.js'), 'utf8');
  assert.match(login, /signInWithPassword\(\{[\s\S]{0,60}email: versEmail\(identifiant\)/);
  assert.match(login, /getElementById\('identifiant'\)/);

  const admin = readFileSync(resolve(root, 'public/assets/admin.js'), 'utf8');
  assert.match(admin, /identifiant: \$\('nc-ident'\)/);
  assert.match(admin, /action: 'identifiant'/);
});

test('la page de connexion ne demande plus d’adresse email', () => {
  const page = readFileSync(resolve(root, 'public/index.html'), 'utf8');
  assert.match(page, /<label for="identifiant">Identifiant/);
  assert.doesNotMatch(page, /id="email"/);
  assert.doesNotMatch(page, /type="email"/);
});

test('un échec de connexion sur une base vide ne parle pas de mot de passe', () => {
  // Supabase répond « Invalid login credentials » aussi quand les tables
  // n'existent pas : sans la sonde, l'écran accuserait à tort le mot de passe.
  const login = readFileSync(resolve(root, 'public/assets/login.js'), 'utf8');
  assert.match(login, /from\('settings'\)\.select\('key'\)/);
  assert.match(login, /'PGRST205'/);
  assert.match(login, /ERREURS\.base/);
  assert.match(login, /migrations 0001 → 0005/);
});
