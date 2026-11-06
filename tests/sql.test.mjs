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

const supa = readFileSync(resolve(root, 'public/assets/supa.js'), 'utf8');

test('chaque table créée est protégée par RLS', () => {
  const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);
  assert.ok(tables.length >= 10, 'tables introuvables');

  for (const t of tables) {
    const re = new RegExp(`alter table public\\.${t}\\s+enable row level security`, 'i');
    assert.match(sql, re, `${t} : RLS non activée`);
  }
});

test("toute policy d'écriture « for all » de l'administration a son GRANT", () => {
  // PostgreSQL vérifie le privilège AVANT la RLS : une policy sans GRANT est
  // inerte et l'écriture échoue en 42501. C'est le piège que 0004 a corrigé.
  // 0012 a remplacé le nom du rôle par une permission : la même règle vaut.
  const tables = [
    ...sql.matchAll(
      /create policy \w+\s+on\s+public\.(\w+)\s+for all to authenticated\s+using \(public\.a_permission\('admin\.(?:referentiels|comptes|roles)'\)\)/gi
    ),
  ].map((m) => m[1]);
  assert.ok(tables.length >= 8, 'aucune policy for all trouvée');

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
    assert.ok(ecriture(t), `${t} : policy d'administration sans GRANT insert/update/delete (échec 42501)`);
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
  // 0002:61-66 n'ouvrait l'insertion qu'au rôle AGENCE. 0007 l'a ouverte à la
  // direction et à la régulation ; 0012 a remplacé le nom du rôle par une
  // permission. Ce test empêche que l'ouverture emporte la signature de
  // l'auteur ou la clôture d'une agence chez elle.
  const i = sql.lastIndexOf('create policy dep_insert');
  assert.ok(i > 0, 'dep_insert absente');

  const bloc = sql.slice(i, i + 500);
  assert.match(bloc, /'depart\.declarer_tout'/, 'le droit de déclarer pour tout le monde manque');
  assert.match(bloc, /created_by = auth\.uid\(\)/, "l'auteur doit rester la personne connectée");
  assert.match(
    bloc,
    /a_permission\('depart\.declarer'\) and agence_id = public\.my_agence\(\)/,
    'une agence ne doit écrire que pour elle-même'
  );
});

test("l'apparence saisie est validée en base, pas seulement à l'écran", () => {
  // une couleur tronquée ou un logo qui n'est pas une image casserait tous les
  // écrans d'un coup : la garde doit refuser l'écriture, comme pour le fuseau
  const i = sql.lastIndexOf('create or replace function public.settings_guard');
  assert.ok(i > 0, 'settings_guard absente');

  const bloc = sql.slice(i, sql.indexOf('$$;', i));

  assert.match(bloc, /new\.key = 'theme_accent'[\s\S]{0,120}?!~\* '\^#\[0-9a-f\]\{6\}\$'/);
  assert.match(bloc, /new\.key = 'theme_mode'[\s\S]{0,80}?not in \('auto', 'light', 'dark'\)/);
  assert.match(bloc, /new\.key = 'logo_data'[\s\S]{0,200}?data:image\/\(png\|jpeg\|webp\|svg\\\+xml\);base64,/);
  assert.match(bloc, /length\(new\.value\) > 400000/, 'le plafond de taille du logo doit exister en base');

  assert.match(sql, /create trigger settings_guard/, 'la garde doit être branchée sur la table settings');
});

test("l'écran de connexion ne lit que les trois clés d'apparence", () => {
  const i = sql.lastIndexOf('policy settings_read_public');
  assert.ok(i > 0, 'settings_read_public absente : le logo ne s’afficherait pas avant connexion');

  const bloc = sql.slice(i, i + 300);
  assert.match(bloc, /for select to anon/);
  assert.match(
    bloc,
    /key in \('theme_accent', 'theme_mode', 'logo_data'\)/,
    'la lecture publique doit être limitée aux clés d’apparence'
  );
  assert.doesNotMatch(bloc, /using \(true\)/, 'une lecture anonyme de toute la table est interdite');
});

test('le personnel en poste est écrit sur la même ligne que le départ', () => {
  // sans ces colonnes, l'envoi d'un départ en début de programme échoue en
  // PGRST204 (colonne inconnue) et l'agence ne peut plus déclarer du tout
  const colonnes = [
    'guichetier',
    'chef_agence',
    'chef_piste_poste',
    'porteur_accueil',
    'chef_piste_logistique',
  ];

  const i = sql.lastIndexOf('create or replace view public.v_departures');
  assert.ok(i > 0, 'v_departures absente');
  const vue = sql.slice(i, sql.indexOf('from public.departures d', i));

  for (const c of colonnes) {
    assert.match(sql, new RegExp(`add column if not exists ${c}\\s+text`), `${c} absente de departures`);
    assert.match(vue, new RegExp(`d\\.${c}\\b`), `la vue n'expose pas ${c} : l'écran ne pourrait pas le relire`);
  }
});

test("le sens d'une ligne est un référentiel, plus une liste écrite dans une contrainte", () => {
  // 0001 fermait sens à trois valeurs : ajouter une direction demandait une
  // migration. 0010 le sort dans public.sens, et axes.sens y renvoie.
  const i = sql.lastIndexOf('create table if not exists public.sens');
  assert.ok(i > 0, 'public.sens absente');

  const bloc = sql.slice(i, sql.indexOf('create policy sens_read', i));
  assert.match(bloc, /nom\s+text not null unique/, 'deux sens ne peuvent pas porter le même nom');

  // les trois valeurs d'hier doivent survivre : la clé étrangère les exige
  for (const v of ['NORD', 'SUD', 'AUCUN']) {
    assert.ok(bloc.includes(`('${v}')`), `« ${v} » non semé : les lignes existantes perdraient leur sens`);
  }

  // la table peut déjà exister d'un premier passage interrompu (42P07) : le
  // fichier doit se rejouer, sinon on ne peut plus jamais finir la migration
  assert.match(sql, /drop policy if exists sens_read on public\.sens/);
  assert.match(sql, /drop policy if exists sens_write on public\.sens/);

  // la liste fermée doit tomber, sinon un sens ajouté à l'écran est refusé à l'écriture
  assert.match(sql, /drop constraint %I/, 'la contrainte de liste fermée doit être retirée');
  assert.match(
    sql,
    /foreign key \(sens\)\s+references public\.sens \(nom\) on update cascade on delete restrict/,
    'axes.sens doit renvoyer au référentiel ; une suppression ne doit pas emporter les lignes'
  );

  // la séquence du serial n'est pas couverte par le « on all sequences » de 0002
  assert.match(sql, /grant usage, select on all sequences/i, 'la séquence de public.sens doit être accordée');
});

test('la fonction d’un utilisateur est un référentiel, et son code ne bouge plus', () => {
  // 0001 fermait fonction à trois valeurs : déclarer un guichetier demandait une
  // migration. 0011 la sort dans public.fonctions, et agents.fonction y renvoie.
  const i = sql.lastIndexOf('create table if not exists public.fonctions');
  assert.ok(i > 0, 'public.fonctions absente');

  const bloc = sql.slice(i, sql.indexOf('create policy fonctions_read', i));

  // le code est la clé : c'est lui que depart.js compare pour remplir l'équipage
  assert.match(bloc, /code\s+text primary key/, 'le code doit être la clé de la table');
  assert.match(bloc, /libelle text not null/, 'le libellé affiché manque');

  for (const c of ['CHAUFFEUR', 'CONVOYEUR', 'CHEF_PISTE']) {
    assert.ok(bloc.includes(`('${c}', `), `« ${c} » non semée : les utilisateurs existants perdraient leur fonction`);
  }

  // même leçon que 0010 : une table déjà créée par un passage interrompu (42P07)
  // ne doit pas empêcher de finir la migration
  assert.match(sql, /drop policy if exists fonctions_read on public\.fonctions/);
  assert.match(sql, /drop policy if exists fonctions_write on public\.fonctions/);

  // la liste fermée doit tomber, sinon une fonction ajoutée à l'écran est refusée
  assert.match(sql, /drop constraint %I/, 'la contrainte de liste fermée doit être retirée');
  assert.match(
    sql,
    /foreign key \(fonction\)\s+references public\.fonctions \(code\) on update cascade on delete restrict/,
    'agents.fonction doit renvoyer au référentiel ; supprimer une fonction portée doit être refusé'
  );

  // clé textuelle : aucune séquence à accorder, donc aucun 42501 possible ici
  assert.ok(!/id\s+serial primary key[\s\S]{0,40}libelle/.test(bloc), 'public.fonctions ne doit pas avoir de serial');
});

test('un rôle et une permission sont des référentiels, pas une liste de noms', () => {
  // 0001 figeait trois rôles dans une contrainte : ouvrir un « guichet »
  // demandait une migration. 0012 sort les deux dans des tables.
  const i = sql.indexOf('create table if not exists public.roles');
  assert.ok(i > 0, 'public.roles absente');

  const bloc = sql.slice(i, sql.indexOf('create table if not exists public.permissions', i));
  assert.match(bloc, /code\s+text primary key/, 'le code doit être la clé du rôle');
  assert.match(bloc, /libelle\s+text not null/, 'le libellé affiché manque');
  assert.match(bloc, /systeme\s+boolean/, 'le rôle Direction doit pouvoir être protégé');

  // les trois rôles d'hier restent semés : les comptes existants les portent
  for (const code of ['AGENCE', 'REGULATION', 'DIRECTION']) {
    assert.ok(bloc.includes(`('${code}',`), `« ${code} » non semé : les comptes existants n'auraient plus de rôle`);
  }

  // la contrainte de liste fermée tombe au profit d'une clé étrangère
  assert.match(sql, /drop constraint %I/, 'la contrainte de liste fermée doit être retirée');
  assert.match(
    sql,
    /foreign key \(role\)\s+references public\.roles \(code\) on update cascade on delete restrict/,
    'profiles.role doit renvoyer à public.roles, et supprimer un rôle porté doit être refusé'
  );

  // même leçon que 0010/0011 : un passage interrompu (42P07) ne doit pas
  // empêcher de finir la migration
  assert.match(sql, /drop policy if exists roles_read on public\.roles/);
  assert.match(sql, /drop policy if exists role_permissions_write on public\.role_permissions/);

  // un second passage ne doit pas rétablir une matrice réglée à la main
  assert.match(
    sql,
    /where not exists \(\s*select 1 from public\.role_permissions rp where rp\.role = v\.role/,
    'les droits par défaut doivent être semés une seule fois par rôle'
  );

  // la matrice est lue par une fonction, et n'est jamais réécrite en aveugle
  const j = sql.lastIndexOf('create or replace function public.set_role_permissions');
  assert.ok(j > 0, 'set_role_permissions absente');
  assert.match(sql.slice(j, j + 300), /security invoker/i, 'la matrice doit s’écrire sous les droits de l’appelant');
  assert.match(sql, /grant execute on function public\.set_role_permissions\(text, text\[\]\)/);
  assert.match(sql, /permission <> all/, 'la fonction ne doit retirer que les droits décochés');
});

test('les droits par défaut du SQL et le repli du navigateur disent la même chose', () => {
  // supa.js retombe sur une table en dur tant que 0012 n'est pas passée : si
  // les deux divergent, un écran s'ouvre avant la migration et se ferme après.
  const debutSql = sql.indexOf('insert into public.role_permissions (role, permission)');
  const blocSql = sql.slice(debutSql, sql.indexOf(') as v(role, permission)', debutSql));

  const depuisSql = {};
  for (const [, role, permission] of blocSql.matchAll(/\('([A-Z_]+)',\s*'([a-z._]+)'\)/g)) {
    (depuisSql[role] ||= new Set()).add(permission);
  }

  const debutJs = supa.indexOf('const PERMS_LEGACY = {');
  assert.ok(debutJs > 0, 'PERMS_LEGACY absente de supa.js');
  const blocJs = supa.slice(debutJs, supa.indexOf('};', debutJs));

  const depuisJs = {};
  for (const [, role, contenu] of blocJs.matchAll(/([A-Z_]+): \[([\s\S]*?)\],/g)) {
    depuisJs[role] = new Set([...contenu.matchAll(/'([a-z._]+)'/g)].map((m) => m[1]));
  }

  assert.deepEqual(Object.keys(depuisSql).sort(), ['AGENCE', 'DIRECTION', 'REGULATION']);
  for (const role of Object.keys(depuisSql)) {
    assert.ok(depuisJs[role], `« ${role} » manque au repli du navigateur`);
    assert.deepEqual(
      [...depuisSql[role]].sort(),
      [...depuisJs[role]].sort(),
      `« ${role} » : le repli du navigateur ne reproduit pas les droits de 0012`
    );
  }
});

test('les permissions sont lues en base et un compte désactivé n’en garde aucune', () => {
  const i = sql.lastIndexOf('create or replace function public.mes_permissions');
  assert.ok(i > 0, 'mes_permissions absente');

  const bloc = sql.slice(i, sql.indexOf('$$;', i));
  assert.match(bloc, /security definer/i, 'la lecture des droits doit éviter la récursion RLS');
  assert.match(bloc, /p\.actif/, 'un compte désactivé doit perdre ses droits');
  assert.match(bloc, /r\.actif/, 'un rôle désactivé doit perdre ses droits');
  assert.match(bloc, /join public\.role_permissions/);
  assert.match(sql, /grant execute on function public\.a_permission\(text\)/);
});

test('on ne peut pas se couper du droit de rouvrir la matrice', () => {
  // retirer « admin.roles » à la direction, ou désactiver son dernier compte,
  // laisserait l'application sans aucun chemin vers cet écran.
  assert.match(
    sql,
    /if old\.role = 'DIRECTION' and old\.permission = 'admin\.roles' then/,
    'la matrice peut retirer admin.roles à la direction'
  );
  assert.match(sql, /if old\.code = 'DIRECTION' then/, 'le rôle Direction peut être supprimé ou désactivé');
  assert.match(sql, /dernier compte qui peut gérer les rôles/, 'le dernier gestionnaire des rôles n’est pas protégé');
});

test('les gardes des départs lisent la matrice, plus le nom du rôle', () => {
  const i = sql.lastIndexOf('create or replace function public.departures_guard');
  assert.ok(i > 0, 'departures_guard absente');
  const bloc = sql.slice(i, sql.indexOf('$$;', i));

  assert.match(bloc, /a_permission\('depart\.annuler'\)/, 'annuler n’a pas sa permission');
  assert.match(bloc, /a_permission\('depart\.reactiver'\)/, 'réactiver n’a pas sa permission');
  assert.match(bloc, /a_permission\('depart\.modifier_tout'\)/, 'le dépassement de délai n’a pas sa permission');
  assert.match(bloc, /v_edit := v_champs - array\['statut', 'motif_annulation'\]/, 'les colonnes modifiées ne sont pas distinguées de l’annulation');
  assert.doesNotMatch(bloc, /my_role\(\)/, 'le trigger compare encore le nom du rôle');

  const j = sql.lastIndexOf('create or replace function public.departures_before_insert');
  assert.ok(j > 0, 'departures_before_insert absente');
  const insertion = sql.slice(j, sql.indexOf('$$;', j));
  assert.match(insertion, /a_permission\('depart\.declarer_tout'\)/);
  assert.match(insertion, /a_permission\('depart\.declarer'\) and new\.agence_id = public\.my_agence\(\)/);
  assert.doesNotMatch(insertion, /my_role\(\)/, 'la déclaration compare encore le nom du rôle');
});
