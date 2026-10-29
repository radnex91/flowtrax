/* FlowTrax — apparence partagée : mode d'affichage, couleur d'accent, logo.
 *
 * Les valeurs vivent dans la table `settings` (theme_accent, theme_mode,
 * logo_data) et chaque navigateur en garde une copie dans localStorage.
 * theme-boot.js applique cette copie avant le premier rendu ; ce module la
 * rafraîchit depuis la base dès qu'une session est ouverte.
 *
 * Aucune dépendance à Supabase ici : le client est passé en argument, sinon
 * supa.js et theme.js s'importeraient mutuellement.
 */

export const CLE_CACHE = 'flowtrax-apparence';
export const LOGO_DEFAUT = 'assets/logo.jpg';
export const LOGO_MAX = 400000;
export const MODES = ['auto', 'light', 'dark'];
export const ACCENTS = ['#C4560B', '#B23A2A', '#1E7A4C', '#14232E', '#6B3FA0', '#0F6E8C'];

let sourceLogo = LOGO_DEFAUT;

export function hexValide(v) {
  return /^#[0-9a-f]{6}$/i.test(String(v == null ? '' : v));
}

/** Luminance relative (WCAG) : sert à choisir une encre lisible sur l'accent. */
export function luminance(hex) {
  const n = String(hex).replace('#', '');
  const c = [0, 2, 4].map((i) => {
    const v = parseInt(n.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function encre(hex) {
  return luminance(hex) > 0.32 ? '#1A120C' : '#FFFFFF';
}

/** Vide accepté (= logo d'origine) ; sinon une image encodée, de taille bornée. */
export function logoAcceptable(v) {
  const s = String(v == null ? '' : v);
  if (s === '') return true;
  return /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(s) && s.length <= LOGO_MAX;
}

export function appliquer(valeurs) {
  const v = valeurs || {};
  const r = document.documentElement;
  const mode = MODES.includes(v.mode) ? v.mode : 'auto';

  if (mode === 'auto') r.removeAttribute('data-theme');
  else r.setAttribute('data-theme', mode);

  const meta = document.querySelector('meta[name="theme-color"]');

  if (hexValide(v.accent)) {
    r.style.setProperty('--accent', v.accent);
    r.style.setProperty('--accent-ink', encre(v.accent));
    if (meta) meta.setAttribute('content', v.accent);
  } else {
    r.style.removeProperty('--accent');
    r.style.removeProperty('--accent-ink');
    if (meta) meta.setAttribute('content', '#C4560B');
  }

  sourceLogo = logoAcceptable(v.logo) && v.logo ? v.logo : LOGO_DEFAUT;
  for (const img of document.querySelectorAll('img.logo')) img.setAttribute('src', sourceLogo);
}

/** Logo en vigueur, pour les écrans qui le posent dans un gabarit (bordereau). */
export function srcLogo() {
  return sourceLogo;
}

function cache() {
  try {
    return JSON.parse(localStorage.getItem(CLE_CACHE) || '{}') || {};
  } catch {
    return {};
  }
}

function retenir(v) {
  try {
    localStorage.setItem(CLE_CACHE, JSON.stringify(v));
  } catch {
    // navigation privée ou quota plein : la page reste utilisable sans cache
  }
}

export async function chargerTheme(client) {
  if (!client) return null;

  const { data, error } = await client
    .from('settings')
    .select('key, value')
    .in('key', ['theme_accent', 'theme_mode', 'logo_data']);

  if (error || !Array.isArray(data)) return cache() || null;

  const v = { accent: '', mode: 'auto', logo: '' };
  for (const ligne of data) {
    if (ligne.key === 'theme_accent') v.accent = ligne.value || '';
    else if (ligne.key === 'theme_mode') v.mode = ligne.value || 'auto';
    else if (ligne.key === 'logo_data') v.logo = ligne.value || '';
  }

  retenir(v);
  appliquer(v);
  return v;
}

/**
 * Réduit l'image choisie dans un formulaire à un data: URL stockable.
 * Le logo s'affiche à 62 px de haut : 320 px de côté suffisent, écran HiDPI
 * compris, et tiennent en quelques dizaines de kilo-octets.
 */
export async function reduireLogo(fichier) {
  if (!fichier || !fichier.type || fichier.type.indexOf('image/') !== 0) {
    throw new Error('Choisissez un fichier image (PNG, JPEG, WebP ou SVG).');
  }
  if (fichier.size > 5 * 1024 * 1024) {
    throw new Error('Image trop lourde : 5 Mo maximum.');
  }

  const lireTexte = (ok, ko) => {
    const l = new FileReader();
    l.onload = () => ok(String(l.result));
    l.onerror = () => ko(new Error('Lecture du fichier impossible.'));
    l.readAsDataURL(fichier);
  };
  const brut = await new Promise(lireTexte);

  // un SVG n'a pas de pixels : le redessiner dans un canvas le perdrait
  if (fichier.type === 'image/svg+xml') {
    if (!logoAcceptable(brut)) throw new Error('Logo SVG trop lourd : réduisez le fichier.');
    return brut;
  }

  const lireImage = (ok, ko) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => ko(new Error('Image illisible : essayez un autre fichier.'));
    i.src = brut;
  };
  const img = await new Promise(lireImage);

  const cote = 320;
  const largeur = img.naturalWidth || cote;
  const hauteur = img.naturalHeight || cote;
  const echelle = Math.min(1, cote / Math.max(largeur, hauteur));

  const toile = document.createElement('canvas');
  toile.width = Math.max(1, Math.round(largeur * echelle));
  toile.height = Math.max(1, Math.round(hauteur * echelle));
  toile.getContext('2d').drawImage(img, 0, 0, toile.width, toile.height);

  // le PNG garde le détourage d'un logo ; le JPEG reste plus léger
  let sortie =
    fichier.type === 'image/jpeg'
      ? toile.toDataURL('image/jpeg', 0.9)
      : toile.toDataURL('image/png');

  if (sortie.length > LOGO_MAX) sortie = toile.toDataURL('image/jpeg', 0.82);
  if (!logoAcceptable(sortie)) {
    throw new Error('Logo encore trop lourd après réduction : essayez une image plus petite.');
  }
  return sortie;
}
