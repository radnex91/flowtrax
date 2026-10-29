// Export CSV — fonctions pures, sans DOM, testables seules.
// Format retenu : point-virgule, BOM UTF-8, fins de ligne CRLF.
// C'est ce qu'Excel attend en locale francophone ; la virgule décimale aussi.

const RISQUE = /^[=+\-@\t\r]/;

/** Prépare une valeur : neutralise les formules, protège les séparateurs. */
export function cellule(v) {
  if (v == null) return '';

  let s = String(v);

  // une cellule qui commence par = + - @ est exécutée par Excel : on la
  // désamorce. Le contenu reste lisible, ce n'est pas une donnée perdue.
  if (RISQUE.test(s)) s = "'" + s;

  if (/[";\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * @param {{l: string, k?: string, f?: (ligne: any) => any}[]} colonnes
 * @param {any[]} lignes
 */
export function csv(colonnes, lignes) {
  const entete = colonnes.map((c) => cellule(c.l)).join(';');
  const corps = lignes.map((l) =>
    colonnes.map((c) => cellule(typeof c.f === 'function' ? c.f(l) : l[c.k])).join(';')
  );
  return '\uFEFF' + [entete, ...corps].join('\r\n') + '\r\n';
}

/** Nombre à la française, sans séparateur de milliers (ambigu en CSV). */
export function nombre(v, dec = 0) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(dec).replace('.', ',');
}

export function nomFichier(base, du, au) {
  return base + '-' + du + '_' + au + '.csv';
}

// ---------------------------------------------------------------------------
// Lecture — pour l'import du parc. Un même texte arrive de trois façons :
// collé depuis Excel (tabulations), enregistré en CSV français (points-virgules)
// ou en CSV anglais (virgules). Le séparateur se devine sur la première ligne.
// ---------------------------------------------------------------------------

const SEPARATEURS = ['\t', ';', ','];

function separateur(src) {
  const premiere = (src.split('\n')[0] || '').trimEnd();
  let mieux = ';';
  let parts = 1;
  for (const s of SEPARATEURS) {
    const n = premiere.split(s).length;
    if (n > parts) {
      parts = n;
      mieux = s;
    }
  }
  return mieux;
}

/**
 * Découpe un texte en lignes de cellules. Les guillemets protègent un séparateur
 * ou un retour à la ligne : « Bus ; 70 places » reste une seule cellule.
 * Les lignes vides sont conservées : c'est l'appelant qui décide de les ignorer,
 * mais le rang de chaque ligne reste celui du texte collé.
 */
export function analyserCsv(texte, sep) {
  const src = String(texte == null ? '' : texte).replace(/\r\n?/g, '\n');
  const d = sep || separateur(src);
  const lignes = [];
  let cellules = [];
  let courante = '';
  let entreGuillemets = false;

  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];

    if (entreGuillemets) {
      if (c !== '"') courante += c;
      else if (src[i + 1] === '"') {
        courante += '"';
        i += 1;
      } else entreGuillemets = false;
      continue;
    }

    if (c === '"' && courante === '') entreGuillemets = true;
    else if (c === d) {
      cellules.push(courante);
      courante = '';
    } else if (c === '\n') {
      cellules.push(courante);
      lignes.push(cellules);
      cellules = [];
      courante = '';
    } else courante += c;
  }

  // le saut de ligne final ne crée pas une ligne de plus
  if (courante !== '' || cellules.length) {
    cellules.push(courante);
    lignes.push(cellules);
  }

  return lignes;
}

const INACTIF = /^(n|non|no|0|f|false|inactif|inactive)$/i;
const ENTIER = /^\d+$/;

/**
 * Prépare un import de parc : Immatriculation, Marque, Type, Places assises,
 * En service (facultatif, oui par défaut). Une ligne refusée n'empêche pas les
 * autres — on rend son numéro de ligne tel qu'il apparaît dans le texte collé,
 * et le motif, pour qu'elle se corrige à la source.
 */
export function parcDepuisCsv(texte) {
  const lignes = [];
  const refus = [];
  const dejaVue = new Map();
  let premiere = true;

  analyserCsv(texte).forEach((c, i) => {
    const n = i + 1;
    if (!c.some((x) => x.trim() !== '')) return; // ligne vide : ni véhicule ni refus

    const premier = String(c[0] == null ? '' : c[0]).trim();

    // l'entête d'un fichier exporté n'est pas un véhicule
    if (premiere) {
      premiere = false;
      if (/^(immat|immatriculation|plaque|v[ée]hicule)$/i.test(premier)) return;
    }

    const immat = premier.toUpperCase().replace(/\s+/g, '');
    if (!immat) {
      refus.push({ n, motif: 'immatriculation vide' });
      return;
    }
    if (dejaVue.has(immat)) {
      refus.push({ n, motif: immat + ' déjà citée ligne ' + dejaVue.get(immat) });
      return;
    }

    const places = String(c[3] == null ? '' : c[3]).trim();
    if (!ENTIER.test(places) || Number(places) < 1) {
      refus.push({ n, motif: immat + ' : places assises illisibles (« ' + places + ' »)' });
      return;
    }

    dejaVue.set(immat, n);
    lignes.push({
      immat,
      marque: String(c[1] == null ? '' : c[1]).trim(),
      type: String(c[2] == null ? '' : c[2]).trim(),
      places: Number(places),
      actif: !INACTIF.test(String(c[4] == null ? '' : c[4]).trim()),
    });
  });

  return { lignes, refus };
}
