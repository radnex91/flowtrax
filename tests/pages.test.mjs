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

test("chaque écran applique l'apparence mémorisée avant son premier rendu", () => {
  // sans l'amorçage, l'écran s'ouvre aux couleurs d'origine puis saute aux
  // vôtres dès la réponse de la base : un clignotement à chaque page
  for (const page of PAGES.filter((p) => !p.endsWith('404.html'))) {
    const html = lire(page);
    const amorcage_ = html.indexOf('assets/theme-boot.js');
    assert.ok(amorcage_ > 0, `${page} ne charge pas theme-boot.js`);
    assert.ok(html.indexOf('assets/app.css') < amorcage_, `${page} : theme-boot.js doit suivre la feuille de style`);
  }

  const sw = lire('public/sw.js');
  assert.ok(sw.includes("'./assets/theme-boot.js'"), 'theme-boot.js absent du cache hors-ligne');
  assert.ok(sw.includes("'./assets/theme.js'"), 'theme.js absent du cache hors-ligne');
});

test("l'apparence s'écrit depuis Administration et se lit jusqu'au bordereau", () => {
  const admin = lire('public/assets/admin.js');
  for (const cle of ['theme_accent', 'theme_mode', 'logo_data']) {
    assert.ok(admin.includes(cle), `admin.js n'écrit pas « ${cle} »`);
  }
  assert.match(admin, /from\('settings'\)\.upsert/, "l'apparence doit être enregistrée par upsert");
  assert.match(admin, /reduireLogo\(/, "l'image importée doit être réduite avant l'envoi");
  assert.match(lire('public/admin.html'), /data-sec="apparence"/, "l'onglet Apparence manque");

  assert.match(lire('public/assets/bordereau.js'), /srcLogo\(\)/, 'le bordereau doit porter le logo en vigueur');
  assert.match(lire('public/assets/supa.js'), /chargerTheme\(sb\)/, "aucun écran connecté ne rafraîchit l'apparence");
  assert.match(lire('public/assets/login.js'), /chargerTheme\(sb\)/, "l'écran de connexion ne lit pas l'apparence");
});

test('le personnel en poste ne s’ouvre qu’au début de programme et part avec le départ', () => {
  // le bloc est fermé dans la page : sans la règle il resterait ouvert sur une
  // suite de programme, où plus personne ne le remplit
  const html = lire('public/depart.html');
  assert.match(html, /<fieldset id="fs-poste" hidden>/, 'le bloc doit être fermé au chargement');

  const js = lire('public/assets/depart.js');
  assert.match(js, /\$\('fs-poste'\)\.hidden = !personnelVisible\(\)/, 'aucune règle n’ouvre le bloc');

  const i = js.indexOf('function personnelVisible');
  assert.ok(i > 0, 'personnelVisible absente');
  const regle = js.slice(i, js.indexOf('}', i));
  assert.match(regle, /'DEBUT'/, 'le début de programme doit ouvrir le bloc');
  assert.match(regle, /'DEBUT_FIN'/, 'début et fin ouvrent aussi la journée');

  // le champ doit être lu à l'envoi **et** atterrir dans l'objet envoyé à la
  // base : un champ affiché mais oublié du payload se perd sans rien dire
  const paires = [
    ['guichetier', 'guichetier', 'poste.guichetier'],
    ['chef-agence', 'chef_agence', 'poste.chefAgence'],
    ['chef-piste-poste', 'chef_piste_poste', 'poste.chefPistePoste'],
    ['porteur-accueil', 'porteur_accueil', 'poste.porteurAccueil'],
    ['chef-piste-logistique', 'chef_piste_logistique', 'poste.chefPisteLogistique'],
  ];

  for (const [id, colonne, valeur] of paires) {
    assert.match(html, new RegExp(`<input id="${id}"`), `champ « ${id} » absent de la page`);
    assert.ok(js.includes(`$('${id}').value.trim()`), `« ${id} » n’est pas lu à l’envoi`);
    assert.ok(js.includes(`${colonne}: ${valeur} || null`), `« ${colonne} » n’est pas écrit dans la ligne`);
  }
});

test("chaque onglet de l'administration a son écran, et le sens vient du référentiel", () => {
  const html = lire('public/admin.html');
  const js = lire('public/assets/admin.js');

  const sections = [...html.matchAll(/data-sec="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(sections.length >= 8, 'onglets introuvables');
  for (const s of sections) {
    // un onglet sans section ouvrirait un écran vide, sans message
    assert.match(js, new RegExp(`\\n  ${s}: \\{`), `aucune section « ${s} » dans admin.js`);
  }

  // le sens d'une ligne ne doit plus avoir sa liste recopiée dans le formulaire :
  // ajouter une direction est un travail de référentiel, pas de code
  assert.match(js, /options: SENS_OPT/, 'le sens d’une ligne doit venir du référentiel');
  assert.doesNotMatch(js, /v: 'NORD', l: 'Nord'/, 'la liste des sens est encore écrite en dur');
  assert.match(js, /table: 'sens'/, "l'onglet Sens doit écrire dans public.sens");
  assert.match(js, /from\('sens'\)\.select/, 'le référentiel des sens doit être lu au chargement');
});

test("l'import du parc n'apparaît que sur l'onglet Parc et met à jour au lieu de dupliquer", () => {
  const js = lire('public/assets/admin.js');

  // la carte existe et porte les deux champs que lisent les écouteurs
  assert.ok(js.includes("'<form class=\"card formedit\" id=\"form-import\">'"), 'carte d’import absente');
  assert.ok(js.includes('id="imp-txt"'), 'zone de collage absente');
  assert.ok(js.includes('id="imp-fichier"'), 'chargement de fichier absent');

  // montée sur le seul onglet qui écrit dans le parc
  assert.match(js, /if \(SECTION === 'vehicules'\) blocs\.push\(carteImportParc\(\)\);/);

  // l'envoi relit le texte collé et s'appuie sur l'unicité de l'immatriculation :
  // sans onConflict, réimporter le parc buterait sur la contrainte unique
  assert.match(js, /parcDepuisCsv\(\$\('imp-txt'\)\.value\)/);
  assert.match(js, /onConflict: 'immat'/);

  // et le formulaire d'import ne se confond pas avec le formulaire d'ajout
  assert.match(js, /\$\('imp-fichier'\)\?\.addEventListener\('change'/);
});

test("la fonction d'un utilisateur vient du référentiel, plus d'une liste écrite dans le module", () => {
  const html = lire('public/admin.html');
  const js = lire('public/assets/admin.js');

  assert.match(html, /data-sec="fonctions"/, 'onglet Fonctions absent de la page');
  assert.match(js, /table: 'fonctions'/, "l'onglet Fonctions doit écrire dans public.fonctions");
  assert.match(js, /from\('fonctions'\)\.select/, 'le référentiel des fonctions doit être lu au chargement');

  // la liste du champ Fonction d'un utilisateur vient du référentiel
  assert.match(js, /options: FONCTIONS_OPT/, 'le champ Fonction doit venir du référentiel');
  assert.ok(
    !/options: \(\) => \[\s*\{ v: 'CHAUFFEUR'/.test(js),
    'la liste des fonctions est encore écrite en dur dans le formulaire'
  );

  // le code se fabrique à partir du libellé, et seulement à la création : sinon
  // renommer « Chef de piste » casserait les listes de l'équipage, qui
  // comparent le code CHAUFFEUR / CONVOYEUR / CHEF_PISTE
  assert.match(js, /if \(!EDITE && o\.libelle\) o\.code = codeDepuisLibelle\(o\.libelle\)/);

  // la colonne du tableau affiche le libellé, jamais le code brut
  assert.match(js, /\{ k: 'fonction', l: 'Fonction', f: \(r\) => esc\(libelleFonction\(r\.fonction\)\) \}/);
});

test('Bootstrap est servi par l’application elle-même, avant la feuille du thème', () => {
  for (const page of PAGES) {
    const html = lire(page);
    const css = html.indexOf('href="vendor/bootstrap/bootstrap.min.css"');
    const app = html.indexOf('href="assets/app.css"');
    assert.ok(css > -1, `${page} ne charge pas Bootstrap`);
    assert.ok(app > -1, `${page} ne charge pas app.css`);
    // app.css pilote les variables de Bootstrap : lue avant, elle serait écrasée
    assert.ok(css < app, `${page} : Bootstrap doit être chargé avant app.css`);

    const module_ = html.indexOf('<script type="module"');
    if (module_ > -1) {
      const bundle = html.indexOf('src="vendor/bootstrap/bootstrap.bundle.min.js"');
      assert.ok(bundle > -1, `${page} ne charge pas le JavaScript de Bootstrap`);
      assert.ok(bundle < module_, `${page} : le bundle doit précéder le module applicatif`);
    }
  }
});

test('le mode et l’accent passent par les variables de Bootstrap', () => {
  const css = lire('public/assets/app.css');
  const module_ = lire('public/assets/theme.js');
  const amorcage = lire('public/assets/theme-boot.js');

  // Bootstrap ne connaît que data-bs-theme : « auto » doit être résolu en amont
  for (const f of [module_, amorcage]) {
    assert.match(f, /data-bs-theme/);
    assert.match(f, /prefers-color-scheme: dark/);
    assert.doesNotMatch(f, /setAttribute\('data-theme'/, 'un data-theme subsiste : il ne colore plus rien');
    assert.match(f, /--bs-primary-rgb/);
  }

  // la feuille de thème doit exister dans les deux modes, sans quoi le mode
  // sombre de Bootstrap afficherait ses gris par défaut
  assert.match(css, /\[data-bs-theme="dark"\]/);
  assert.match(css, /--bs-body-bg/);
});

test('le service worker met Bootstrap en cache et change de version', () => {
  const sw = lire('public/sw.js');
  const n = Number(sw.match(/const CACHE = 'flowtrax-v(\d+)'/)?.[1]);
  assert.ok(n >= 14, `cache encore en v${n} : les pages garderaient l’ancien app.css`);
  assert.match(sw, /'\.\/vendor\/bootstrap\/bootstrap\.min\.css'/);
  assert.match(sw, /'\.\/vendor\/bootstrap\/bootstrap\.bundle\.min\.js'/);
});
