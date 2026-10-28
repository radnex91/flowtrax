import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dossier = resolve(root, 'supabase/migrations');

const sql = readdirSync(dossier)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(dossier, f), 'utf8'))
  .join('\n');

test('chaque table créée est protégée par RLS', () => {
  const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);
  assert.ok(tables.length >= 10, 'tables introuvables');

  for (const t of tables) {
    const re = new RegExp(`alter table public\\.${t}\\s+enable row level security`, 'i');
    assert.match(sql, re, `${t} : RLS non activée`);
  }
});

test("toute policy d'écriture « for all » de la direction a son GRANT", () => {
  // PostgreSQL vérifie le privilège AVANT la RLS : une policy sans GRANT est
  // inerte et l'écriture échoue en 42501. C'est le piège que 0004 a corrigé.
  const tables = [
    ...sql.matchAll(
      /create policy \w+\s+on\s+public\.(\w+)\s+for all to authenticated[\s\S]{0,200}?my_role\(\) = 'DIRECTION'/gi
    ),
  ].map((m) => m[1]);
  assert.ok(tables.length >= 6, 'aucune policy for all trouvée');

  const grants = [...sql.matchAll(/grant\b[^;]*;/gi)].map((m) => m[0]);
  const ecriture = (t) =>
    grants.some(
      (g) =>
        /\binsert\b/i.test(g) &&
        /\bupdate\b/i.test(g) &&
        /\bdelete\b/i.test(g) &&
        new RegExp(`\\b${t}\\b`).test(g)
    );

  for (const t of new Set(tables)) {
    assert.ok(ecriture(t), `${t} : policy direction sans GRANT insert/update/delete (échec 42501)`);
  }
});

test("l'itinéraire d'une ligne se réécrit sous les droits de l'appelant", () => {
  const i = sql.indexOf('function public.set_axe_itineraire');
  assert.ok(i > 0, 'set_axe_itineraire absente');

  const entete = sql.slice(i, i + 400);
  assert.match(entete, /security invoker/i, 'la fonction ne doit pas contourner la RLS (security definer interdit)');
  assert.match(sql, /grant execute on function public\.set_axe_itineraire/i);
});

test('un compte désactivé ne conserve aucun droit', () => {
  const i = sql.lastIndexOf('create or replace function public.my_role');
  assert.ok(i > 0, 'my_role absente');

  assert.match(sql.slice(i, i + 400), /and actif/i, 'my_role doit ignorer les profils désactivés');
});

test('la direction déclare pour une agence sans perdre les garde-fous', () => {
  // 0002:61-66 n'ouvrait l'insertion qu'au rôle AGENCE. 0007 l'ouvre à la
  // direction et à la régulation ; ce test empêche que l'ouverture emporte
  // avec elle la signature de l'auteur ou la clôture d'une agence chez elle.
  const i = sql.lastIndexOf('create policy dep_insert');
  assert.ok(i > 0, 'dep_insert absente');

  const bloc = sql.slice(i, i + 400);
  assert.match(bloc, /'DIRECTION'/);
  assert.match(bloc, /'REGULATION'/);
  assert.match(bloc, /created_by = auth\.uid\(\)/, "l'auteur doit rester la personne connectée");
  assert.match(
    bloc,
    /my_role\(\) = 'AGENCE' and agence_id = public\.my_agence\(\)/,
    'une agence ne doit écrire que pour elle-même'
  );
});
