/* FlowTrax — la coque de l'application.
 *
 * Une seule liste de rubriques, un seul dessin : chaque écran appelle
 * monterNav(role) après requireSession(). Le bordereau imprimé ne l'appelle
 * pas — il reste hors coque, pour l'impression.
 *
 * Le rôle décide de ce qui apparaît : une agence ne voit ni Rapports ni
 * Administration. Les identifiants de page (`depart.html`…) sont ceux des
 * fichiers, sans extension dans le libellé affiché.
 */

const RUBRIQUES = [
  { page: 'depart.html', texte: 'Déclarer', roles: ['AGENCE', 'REGULATION', 'DIRECTION'] },
  { page: 'dashboard.html', texte: 'Tableau de bord', roles: ['AGENCE', 'REGULATION', 'DIRECTION'] },
  { page: 'rapports.html', texte: 'Rapports', roles: ['REGULATION', 'DIRECTION'] },
  { page: 'admin.html', texte: 'Administration', roles: ['DIRECTION'] },
];

const ICONES = {
  'depart.html':
    '<rect x="3" y="5" width="18" height="12" rx="2.5"/><path d="M3 11h18"/>' +
    '<path d="M7 20h2M15 20h2"/>',
  'dashboard.html':
    '<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/>' +
    '<rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
  'rapports.html':
    '<path d="M5 20v-8M11 20V5M17 20v-5"/><path d="M3 20h18"/>',
  'admin.html':
    '<path d="M4 7h7M17 7h3M4 17h3M13 17h7"/><circle cx="13" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
};

const icone = (page) =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  (ICONES[page] || '') +
  '</svg>';

/** Page courante, robuste aux URL sans nom de fichier. */
function pageCourante() {
  const nom = location.pathname.split('/').pop();
  return (nom || 'dashboard.html').toLowerCase();
}

/**
 * Monte la coque. Sans effet si elle est déjà en place, pour que l'appel
 * depuis plusieurs modules d'un même écran ne duplique rien.
 * @param {string} [role] rôle du profil ; absent = toutes les rubriques
 */
export function monterNav(role) {
  if (!document.body || document.querySelector('.coque-nav')) return;

  const ici = pageCourante();
  const vues = RUBRIQUES.filter((r) => !role || r.roles.includes(role));

  const nav = document.createElement('nav');
  nav.className = 'coque-nav';
  nav.setAttribute('aria-label', 'Navigation principale');
  nav.innerHTML =
    '<p class="coque-titre">Départs</p><ul>' +
    vues
      .map(
        (r) =>
          '<li><a href="' +
          r.page +
          '"' +
          (r.page === ici ? ' aria-current="page"' : '') +
          '>' +
          icone(r.page) +
          '<span>' +
          r.texte +
          '</span></a></li>'
      )
      .join('') +
    '</ul>';

  document.body.prepend(nav);
  document.body.classList.add('coque');

  // la hauteur de l'en-tête collant est mesurée, pas devinée : le rail se cale
  // dessous au pixel, y compris quand le nom du profil passe sur deux lignes
  const entete = document.querySelector('header.top');
  if (!entete) return;
  const caler = () => {
    document.documentElement.style.setProperty('--top-h', entete.offsetHeight + 'px');
  };
  caler();
  if ('ResizeObserver' in window) new window.ResizeObserver(caler).observe(entete);
  else window.addEventListener('resize', caler);
}
