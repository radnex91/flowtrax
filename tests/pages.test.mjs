import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pub = resolve(root, 'public');
const lire = (p) => readFileSync(resolve(root, p), 'utf8');

const PAGES = [
  'public/index.html',
  'public/depart.html',
  'public/dashboard.html',
  'public/admin.html',
  'public/rapports.html',
  'public/bordereau.html',
  'public/404.html',
];

test('chaque ressource locale référencée par une page existe', () => {
  for (const page of PAGES) {
    const html = lire(page);
    const refs = [...html.matchAll(/(?:src|href)="((?!https?:|#|data:|mailto:)[^"]+)"/g)].map((m) => m[1]);
    for (const ref of refs) {
      assert.ok(existsSync(resolve(pub, ref)), `${page} référence « ${ref} » qui n'existe pas`);
    }
  }
});

test('le service worker ne met en cache que des fichiers présents', () => {
  const sw = lire('public/sw.js');
  const bloc = sw.slice(sw.indexOf('const SHELL'), sw.indexOf('];', sw.indexOf('const SHELL')));
  const refs = [...bloc.matchAll(/'(\.[^']+)'/g)].map((m) => m[1]);

  assert.ok(refs.length > 5, 'liste SHELL introuvable');
  for (const ref of refs) {
    assert.ok(existsSync(resolve(pub, ref)), `sw.js met en cache « ${ref} » qui n'existe pas`);
  }
});

test('config.js est exclu du cache (les clés doivent toujours être fraîches)', () => {
  const sw = lire('public/sw.js');
  assert.ok(!sw.includes("'./assets/config.js'"), 'config.js ne doit pas être dans SHELL');
  assert.ok(sw.includes('config.js'), 'le fetch doit court-circuiter config.js');
});

function idsDans(html) {
  return new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
}

function idsUtilises(js) {
  return [...new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]))];
}

test('tous les identifiants utilisés par depart.js existent dans depart.html', () => {
  const ids = idsDans(lire('public/depart.html'));
  const manquants = idsUtilises(lire('public/assets/depart.js')).filter((id) => !ids.has(id));
  assert.deepEqual(manquants, []);
});

test('tous les identifiants utilisés par dashboard.js existent dans dashboard.html', () => {
  const ids = idsDans(lire('public/dashboard.html'));
  const manquants = idsUtilises(lire('public/assets/dashboard.js')).filter((id) => !ids.has(id));
  assert.deepEqual(manquants, []);
});

test('tous les identifiants utilisés par admin.js sont déclarés (page ou gabarit du module)', () => {
  // l'écran d'administration construit ses formulaires en JS : un identifiant
  // peut donc être déclaré dans un gabarit du module plutôt que dans la page
  const page = idsDans(lire('public/admin.html'));
  const js = lire('public/assets/admin.js');
  const gabarit = idsDans(js);

  const manquants = idsUtilises(js).filter((id) => !page.has(id) && !gabarit.has(id));
  assert.deepEqual(manquants, []);
});

test('tous les identifiants utilisés par rapports.js et bordereau.js sont déclarés', () => {
  for (const [page, module] of [
    ['public/rapports.html', 'public/assets/rapports.js'],
    ['public/bordereau.html', 'public/assets/bordereau.js'],
  ]) {
    const ids = idsDans(lire(page));
    const js = lire(module);
    const gabarit = idsDans(js);
    const manquants = idsUtilises(js).filter((id) => !ids.has(id) && !gabarit.has(id));
    assert.deepEqual(manquants, [], `${module} référence des identifiants absents de ${page}`);
  }
});

test('chaque écran de travail monte la coque, le bordereau reste dehors', () => {
  // la navigation n'existe qu'une fois : dans nav.js. Un écran qui oublierait
  // l'appel perdrait le rail sans que rien ne le signale à l'écran.
  for (const nom of ['depart', 'dashboard', 'admin', 'rapports']) {
    const js = lire(`public/assets/${nom}.js`);
    assert.match(js, /import \{ monterNav \} from '\.\/nav\.js'/, `${nom}.js n'importe pas nav.js`);
    assert.match(js, /monterNav\(SESSION\.role\)/, `${nom}.js ne monte pas la coque`);
  }
  assert.ok(
    !lire('public/assets/bordereau.js').includes('nav.js'),
    'le bordereau imprimé doit rester hors coque'
  );

  const pages = [...lire('public/assets/nav.js').matchAll(/page: '([\w.-]+)'/g)].map((m) => m[1]);
  assert.equal(pages.length, 4, 'la coque doit déclarer quatre rubriques');
  for (const p of pages) assert.ok(existsSync(resolve(pub, p)), `rubrique « ${p} » sans fichier`);
});

test('aucune clé service_role dans le dossier public', () => {
  // les commentaires ont le droit de nommer la clé pour avertir ; le code, non
  const sansCommentaires = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');

  for (const f of ['public/assets/config.js', 'public/assets/config.example.js']) {
    assert.ok(!/service_role/.test(sansCommentaires(lire(f))), `${f} ne doit jamais contenir service_role`);
  }
});
