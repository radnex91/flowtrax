import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const fonction = readFileSync(
  resolve(root, 'supabase/functions/admin-comptes/index.ts'),
  'utf8'
);
const admin = readFileSync(resolve(root, 'public/assets/admin.js'), 'utf8');

/** Le code publié, commentaires retirés : un `service_role` cité en commentaire
 *  d'avertissement n'est pas une fuite, une clé réelle en est une. */
function sansCommentaires(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test("la fonction revérifie le JWT, même si la passerelle l'a déjà fait", () => {
  // Une fonction déployée sans vérification de JWT ne doit pas devenir une
  // porte ouverte : le contrôle ne peut pas dépendre d'un réglage de déploiement.
  assert.match(
    fonction,
    /client\.auth\.getUser\(jwt\)/,
    "admin-comptes doit appeler auth.getUser(jwt) sur le jeton reçu"
  );
  assert.match(fonction, /if \(eAuth \|\| !qui\?\.user\)[\s\S]{0,80}401/);
  assert.match(fonction, /replace\(\/\^Bearer\\s\+\/i, ''\)/);
});

test('le droit est lu dans la matrice, jamais dans le corps de la requête', () => {
  // 0012 : ce n'est plus le nom du rôle qui autorise, mais la permission
  // « admin.comptes » dans role_permissions. Un rôle créé à l'écran peut donc
  // ouvrir l'écran Comptes sans qu'on redéploie cette fonction.
  const garde = fonction.match(/if \(!droit\)[\s\S]{0,120}403/);
  assert.ok(garde, 'la fonction doit exiger la permission admin.comptes');

  const i = fonction.indexOf(garde.index);
  const avant = fonction.slice(0, i);
  assert.match(avant, /from\('profiles'\)[\s\S]{0,200}?\.eq\('id', qui\.user\.id\)/);
  assert.match(avant, /from\('roles'\)[\s\S]{0,120}?\.eq\('code', profil\.role\)/, 'le rôle doit être lu en base');
  assert.match(
    avant,
    /from\('role_permissions'\)[\s\S]{0,200}?\.eq\('permission', 'admin\.comptes'\)/,
    'le droit doit venir de la matrice'
  );
  assert.match(avant, /createClient\(url, service/, 'la lecture du rôle doit se faire avec le client service');

  // le nom du rôle ne doit plus servir de laissez-passer nulle part
  assert.doesNotMatch(fonction, /role\s*!==\s*'DIRECTION'/, 'la fonction compare encore le nom du rôle');
});

test('on ne peut ni se supprimer soi-même, ni supprimer le dernier gestionnaire des rôles', () => {
  assert.match(
    fonction,
    /if \(id === profil\.id\)[\s\S]{0,200}?supprimer votre propre compte/,
    'auto-suppression non bloquée'
  );

  const i = fonction.indexOf("action === 'supprimer'");
  assert.ok(i > 0);
  const bloc = fonction.slice(i);

  // la cible est jugée sur la matrice, pas sur le nom du rôle
  assert.match(bloc, /\.eq\('permission', 'admin\.roles'\)/, 'les rôles gestionnaires doivent venir de la matrice');
  assert.match(bloc, /rolesGestionnaires\.includes\(String\(cible\.role\)\)/);
  assert.match(bloc, /count: 'exact', head: true/);
  assert.match(bloc, /\.neq\('id', id\)/, 'le compte visé ne doit pas se compter lui-même');
  assert.match(bloc, /\(count \?\? 0\) <= 0/, 'le dernier compte capable de rouvrir la matrice doit être protégé');
});

test('un profil qui échoue laisse le compte de connexion supprimé', () => {
  // Sinon : un compte Auth sans profil, impossible à rattacher depuis l'écran.
  const i = fonction.indexOf("action === 'creer'");
  assert.ok(i > 0);
  // la création valide le rôle et la matrice avant d'ouvrir le compte : la
  // fenêtre suit jusqu'à la branche suivante plutôt qu'une longueur devinée
  const bloc = fonction.slice(i, fonction.indexOf("action === 'identifiant'", i));

  assert.match(bloc, /createUser\(/);
  assert.match(bloc, /from\('profiles'\)\.insert/);
  assert.match(bloc, /deleteUser\(cree\.user\.id\)/, 'rollback manquant après échec du profil');
});

test("l'écran Comptes passe par la fonction, jamais par la clé secrète", () => {
  // Le nom réel de la fonction vit dans config.js : le tableau de bord en
  // génère un au hasard, et c'est ce nom-là qui répond sur l'URL.
  const config = readFileSync(resolve(root, 'public/assets/config.js'), 'utf8');

  assert.match(admin, /import\s*\{\s*FONCTION_COMPTES\s*\}\s*from\s*'\.\/config\.js'/);
  assert.match(admin, /functions\.invoke\(FONCTION_COMPTES/, "admin.js doit appeler la fonction des comptes");
  assert.match(config, /FONCTION_COMPTES\s*=\s*'[a-z0-9][a-z0-9-]*'/, 'nom de fonction absent de config.js');
  assert.doesNotMatch(admin, /auth\.admin/, "le navigateur ne peut pas utiliser l'API d'administration");
  assert.match(admin, /data-suppr=/, 'bouton de suppression des comptes absent');
  assert.match(admin, /data-mdp=/, 'bouton de changement de mot de passe absent');
  assert.match(admin, /data-ident=/, "bouton de changement d'identifiant absent");
});

test('aucune clé service_role dans les fichiers publiés', () => {
  const fichiers = readdirSync(resolve(root, 'public'), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name));

  assert.ok(fichiers.length >= 10, 'fichiers publiés introuvables');

  for (const f of fichiers) {
    const src = sansCommentaires(readFileSync(f, 'utf8'));
    assert.doesNotMatch(
      src,
      /service_role/i,
      `${f} : la clé service_role contourne la RLS, elle ne doit jamais être publiée`
    );
  }
});

test('la longueur minimale du mot de passe est la même des deux côtés', () => {
  const cote = fonction.match(/MOT_DE_PASSE_MIN = (\d+)/);
  const ecran = admin.match(/MOT_DE_PASSE_MIN = (\d+)/);
  assert.ok(cote, 'MOT_DE_PASSE_MIN absent de la fonction');
  assert.ok(ecran, 'MOT_DE_PASSE_MIN absent de admin.js');
  assert.equal(ecran[1], cote[1], 'le navigateur et la fonction doivent refuser la même longueur');
  assert.ok(Number(cote[1]) >= 8);
});
