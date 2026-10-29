import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Un module ES est en mode strict : affecter un nom qui n'existe pas lève
   ReferenceError. C'est exactement ce qui est arrivé à « MAIL_ID = null »
   après le renommage en « IDENT_ID » : le clic changeait d'onglet en
   mémoire, la ligne suivante levait, et rendre() n'était jamais appelé —
   l'écran semblait mort. Ce test relit les modules et refuse ces noms. */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dossier = resolve(root, 'public/assets');

const GLOBALES = new Set([
  'location', 'window', 'document', 'self', 'caches', 'navigator', 'history',
  'localStorage', 'sessionStorage', 'console', 'JSON', 'Math', 'Object',
  'Array', 'String', 'Number', 'Boolean', 'Promise', 'Set', 'Map', 'Date',
  'RegExp', 'Error', 'TypeError', 'Intl', 'fetch', 'URL', 'URLSearchParams',
  'TextEncoder', 'TextDecoder', 'structuredClone', 'AbortController',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'queueMicrotask', 'CustomEvent', 'Event', 'Blob',
  'File', 'FileReader', 'Image', 'FormData', 'Headers', 'Request', 'Response', 'getSelection',
  'getComputedStyle',
  'confirm', 'alert', 'prompt', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  // mots-clés : « if (x) return; » ressemble à un appel pour une expression
  // régulière, faute d'accolade.
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'catch', 'return',
  'throw', 'typeof', 'instanceof', 'in', 'of', 'delete', 'void', 'new',
  'await', 'async', 'yield', 'function', 'class', 'super', 'this',
]);

const sansCommentaires = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');

function declares(src) {
  const noms = new Set();

  for (const m of src.matchAll(/\b(?:let|const|var)\s+([^;\n]+)/g)) {
    const liste = m[1].replace(/=/, '\u0000').split('\u0000')[0].replace(/[{}]/g, ' ');
    for (const brut of liste.split(',')) {
      const id = brut.trim().match(/^[A-Za-z_$][\w$]*/);
      if (id) noms.add(id[0]);
    }
  }
  for (const m of src.matchAll(/\b(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) noms.add(m[1]);
  for (const m of src.matchAll(/import\s+\{([^}]+)\}\s+from/g)) {
    for (const brut of m[1].split(',')) {
      const id = brut.trim().split(/\s+as\s+/).pop().trim();
      if (id) noms.add(id);
    }
  }
  for (const m of src.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from/g)) noms.add(m[1]);

  return noms;
}

// paramètres de fonction : « diffChamps(avant, apres, libelle = …) » appelle
// légitimement libelle(), qui n'est déclaré nulle part dans le module.
function parametres(src) {
  const noms = new Set();
  const liste = (txt) => {
    for (const brut of txt.split(',')) {
      const id = brut.trim().replace(/^\.\.\./, '').match(/^[A-Za-z_$][\w$]*/);
      if (id) noms.add(id[0]);
    }
  };
  for (const m of src.matchAll(/function\s*[A-Za-z_$]*\s*\(([^)]*)\)/g)) liste(m[1]);
  for (const m of src.matchAll(/\(([^)]*)\)\s*=>/g)) liste(m[1]);
  for (const m of src.matchAll(/\bcatch\s*\(([^)]*)\)/g)) liste(m[1]);
  return noms;
}

// index de la parenthèse fermante appariée, -1 si déséquilibré
function fermante(src, ouvrante) {
  let d = 0;
  for (let k = ouvrante; k < src.length; k++) {
    if (src[k] === '(') d++;
    else if (src[k] === ')') {
      d--;
      if (d === 0) return k;
    }
  }
  return -1;
}

/* Une fonction appelée mais jamais définie ne lève rien à la lecture : elle
   lève au clic, dans le gestionnaire d'événement, et laisse l'écran muet.
   C'est ce qui est arrivé à enregistrerItin() : bouton « Enregistrer
   l'itinéraire » sans effet, aucune requête, aucun message. */
function appelsManquants(src) {
  const noms = declares(src);
  const params = parametres(src);
  const manquants = new Set();

  for (const m of src.matchAll(/(^|[^.\w$'"])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const nom = m[2];
    if (noms.has(nom) || params.has(nom) || GLOBALES.has(nom)) continue;

    // « get(k, d) { » ou « set(k, v) { » : définition de méthode, pas un appel
    const fin = fermante(src, m.index + m[0].length - 1);
    if (fin > 0 && /^\s*\{/.test(src.slice(fin + 1, fin + 40))) continue;

    manquants.add(nom);
  }

  return [...manquants];
}

test('aucune affectation à un nom non déclaré dans les modules du navigateur', () => {
  const modules = readdirSync(dossier).filter((f) => f.endsWith('.js') && !f.startsWith('config.'));
  const fautes = [];

  for (const f of modules) {
    const src = sansCommentaires(readFileSync(resolve(dossier, f), 'utf8'));
    const noms = declares(src);

    // affectation simple à un nom en majuscules : « MAIL_ID = null »
    for (const m of src.matchAll(/(^|[^.\w$])([A-Z][A-Z0-9_]{2,})\s*=(?!=)/g)) {
      const nom = m[2];
      if (!noms.has(nom) && !GLOBALES.has(nom)) fautes.push(f + ' : ' + nom);
    }
  }

  assert.deepEqual(fautes, [], 'noms affectés sans déclaration (ReferenceError en mode strict)');
});

test('aucun appel à une fonction non déclarée dans les modules du navigateur', () => {
  // le détecteur doit voir une faute, sinon il ne prouve rien
  assert.deepEqual(appelsManquants('function a() { b(); }'), ['b']);

  const modules = readdirSync(dossier).filter((f) => f.endsWith('.js') && !f.startsWith('config.'));
  const fautes = [];

  for (const f of modules) {
    const src = sansCommentaires(readFileSync(resolve(dossier, f), 'utf8'))
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
      .replace(/`(?:[^`\\]|\\.)*`/g, '``');

    for (const nom of appelsManquants(src)) fautes.push(f + ' : ' + nom);
  }

  assert.deepEqual(fautes, [], 'fonctions appelées sans être définies (ReferenceError au clic)');
});
