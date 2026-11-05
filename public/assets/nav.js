/* FlowTrax — la coque de l'application.
 * Navigation principale Danay Express : rail latéral sombre avec identité de marque,
 * menu d'écrans selon rôle, et bloc profil.
 */

const RUBRIQUES = [
  { page: 'dashboard.html', texte: 'Tableau de bord', roles: ['AGENCE', 'REGULATION', 'DIRECTION'] },
  { page: 'depart.html', texte: 'Déclarer un départ', roles: ['AGENCE', 'REGULATION', 'DIRECTION'] },
  { page: 'rapports.html', texte: 'Rapports', roles: ['REGULATION', 'DIRECTION'] },
  { page: 'admin.html', texte: 'Administration', roles: ['DIRECTION'] },
];

const ICONES = {
  'dashboard.html':
    '<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/>' +
    '<rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
  'depart.html':
    '<rect x="3" y="5" width="18" height="12" rx="2.5"/><path d="M3 11h18"/>' +
    '<path d="M7 20h2M15 20h2"/>',
  'rapports.html':
    '<path d="M18 20V10M12 20V4M6 20v-6"/><path d="M3 20h18"/>',
  'admin.html':
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
};

const icone = (page) =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  (ICONES[page] || '') +
  '</svg>';

/** Page courante, robuste aux URL sans nom de fichier. */
function pageCourante() {
  const nom = location.pathname.split('/').pop();
  return (nom || 'dashboard.html').toLowerCase();
}

/**
 * Monte la coque Danay Express.
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
    '<div class="coque-brand">' +
      '<div class="coque-logo-box">' +
        '<div class="coque-logo-arc">' +
          '<svg viewBox="0 0 36 28" width="32" height="26" fill="none">' +
            '<path d="M3 24C6 8 30 8 33 24" stroke="#ED5D0B" stroke-width="3" stroke-linecap="round"/>' +
            '<rect x="9" y="11" width="18" height="11" rx="2" fill="#ED5D0B"/>' +
            '<circle cx="13" cy="22" r="2" fill="#0B132B"/><circle cx="23" cy="22" r="2" fill="#0B132B"/>' +
            '<line x1="9" y1="16" x2="27" y2="16" stroke="#fff" stroke-width="1.2"/>' +
          '</svg>' +
        '</div>' +
        '<div class="coque-brand-text">' +
          '<b class="brand-danay-title">DANAY EXPRESS</b>' +
          '<span class="brand-danay-sub">Voyagez en toute confiance</span>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<p class="coque-titre" hidden>Navigation</p>' +
    '<ul class="coque-links">' +
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
    '</ul>' +
    '<div class="coque-footer">' +
      '<div class="coque-user-pill">' +
        '<div class="user-avatar-circle">' +
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
        '</div>' +
        '<div class="user-info-text">' +
          '<b class="nav-user-nom">Utilisateur</b>' +
          '<span class="nav-user-role">' + (role ? role.toLowerCase() : 'connecté') + '</span>' +
        '</div>' +
        '<div class="user-pill-chevron" aria-hidden="true">▾</div>' +
      '</div>' +
      '<div class="coque-copy">© 2026 Danay Express</div>' +
    '</div>';

  document.body.prepend(nav);
  document.body.classList.add('coque');

  // Synchronisation du nom/rôle utilisateur avec le bloc #who
  const synchroUser = () => {
    const who = document.getElementById('who');
    const txt = who?.textContent?.trim();
    if (!txt) return;
    const parts = txt.split('·').map((s) => s.trim());
    const nom = parts[0];
    const r = parts[1] || (role ? role.toLowerCase() : 'connecté');
    const elNom = nav.querySelector('.nav-user-nom');
    const elRole = nav.querySelector('.nav-user-role');
    if (elNom && nom) elNom.textContent = nom;
    if (elRole && r) elRole.textContent = r;
  };
  synchroUser();
  const whoEl = document.getElementById('who');
  if (whoEl && 'MutationObserver' in window) {
    new window.MutationObserver(synchroUser).observe(whoEl, { childList: true, characterData: true, subtree: true });
  }

  // deux hauteurs mesurées, jamais devinées : --nav-h réserve sous le contenu
  // la place exacte de la barre basse, --top-h cale le rail sous l'en-tête.
  // Une valeur figée laissait le contenu passer sous la barre dès qu'un
  // libellé (« Tableau de bord ») prenait deux lignes sur un écran étroit.
  const mesurer = (el, variable) => {
    const caler = () => {
      document.documentElement.style.setProperty(variable, el.offsetHeight + 'px');
    };
    caler();
    if ('ResizeObserver' in window) new window.ResizeObserver(caler).observe(el);
    else window.addEventListener('resize', caler);
  };
  mesurer(nav, '--nav-h');

  const entete = document.querySelector('header.top');
  if (entete) mesurer(entete, '--top-h');
}
