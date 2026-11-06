import { sb, isConfigured, permissionsCourantes } from './supa.js';
import { versEmail } from './ident.js';
import { chargerTheme } from './theme.js';

const msgs = document.getElementById('lmsgs');
const form = document.getElementById('flogin');
const btn = document.getElementById('lbtn');

const ERREURS = {
  config: 'L\'application n\'est pas encore configurée : renseignez assets/config.js.',
  profil: 'Ce compte n\'est rattaché à aucun profil. Contactez la direction.',
  inactif: 'Ce compte a été désactivé. Contactez la direction.',
  agence: 'Ce compte n\'est rattaché à aucune agence. Contactez la direction.',
  role: 'Ce compte n\'a pas accès à la saisie des départs.',
  reseau: 'Serveur injoignable. Vérifiez la connexion internet, puis rechargez la page.',
  base:
    'La base n\'est pas encore initialisée : les migrations 0001 → 0005 n\'ont pas été exécutées sur ce projet. ' +
    'Ce n\'est pas votre mot de passe — voir README, étape 1.',
};

function afficher(texte, niveau = 'e') {
  msgs.innerHTML = '<p class="' + niveau + '">' + texte + '</p>';
}

const code = new URLSearchParams(location.search).get('erreur');
if (code && ERREURS[code]) afficher(ERREURS[code]);

if (!isConfigured) {
  afficher(ERREURS.config);
  btn.disabled = true;
} else {
  // pas de session ici : la policy settings_read_public n'ouvre que les trois
  // clés d'apparence, pour que cet écran porte le logo et les couleurs choisis
  chargerTheme(sb);

  const urlParams = new URLSearchParams(location.search);
  const estDeconnexion = urlParams.has('deconnexion') || urlParams.has('logout');

  if (estDeconnexion) {
    try { sb.auth.signOut({ scope: 'local' }).catch(() => {}); } catch {}
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('sb-') || k.includes('auth-token') || k.includes('supabase'))) {
          localStorage.removeItem(k);
        }
      }
    } catch {}
    try { history.replaceState({}, '', location.pathname); } catch {}
  } else {
    sb.auth.getSession().then(({ data }) => {
      if (data && data.session) verifierEtRediriger();
    });
  }

  const togglePwd = document.getElementById('toggle-pwd');
  const pwdInput = document.getElementById('password');
  const eyeIcon = document.getElementById('eye-icon');
  if (togglePwd && pwdInput && eyeIcon) {
    togglePwd.addEventListener('click', () => {
      const isPwd = pwdInput.type === 'password';
      pwdInput.type = isPwd ? 'text' : 'password';
      eyeIcon.innerHTML = isPwd
        ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
        : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    });
  }

  const btnForgot = document.getElementById('btn-forgot');
  if (btnForgot) {
    btnForgot.addEventListener('click', () => {
      afficher('Les mots de passe sont attribués et réinitialisés par la direction. Rapprochez-vous de votre responsable.', 'i');
    });
  }

  const btnGuest = document.getElementById('btn-guest');
  if (btnGuest) {
    btnGuest.addEventListener('click', () => {
      afficher('Connexion invité / test : utilisez « direction » ou « jonas » (mot de passe communiqué par l’administrateur).', 'i');
    });
  }

  try {
    const saved = localStorage.getItem('flowtrax_saved_ident');
    const identInput = document.getElementById('identifiant');
    if (saved && identInput) identInput.value = saved;
  } catch {}

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();

    const identifiant = document.getElementById('identifiant').value.trim();
    const password = document.getElementById('password').value;

    if (!identifiant || !password) {
      afficher('Saisissez votre identifiant et votre mot de passe.');
      return;
    }

    const remember = document.getElementById('remember');
    if (remember && remember.checked) {
      try { localStorage.setItem('flowtrax_saved_ident', identifiant); } catch {}
    } else {
      try { localStorage.removeItem('flowtrax_saved_ident'); } catch {}
    }

    btn.disabled = true;
    btn.textContent = 'Connexion…';
    msgs.innerHTML = '';

    const { error } = await sb.auth.signInWithPassword({
      email: versEmail(identifiant),
      password,
    });

    if (error) {
      btn.disabled = false;
      btn.textContent = 'Se connecter';

      // Supabase répond « Invalid login credentials » aussi bien pour un mot
      // de passe faux que pour un projet dont les tables manquent : sans cette
      // sonde, l'écran envoie chercher une faute de frappe qui n'existe pas.
      const sonde = await sb.from('settings').select('key').limit(1);
      const manquante =
        sonde.error && (sonde.error.code === 'PGRST205' || sonde.error.code === '42P01');

      afficher(
        manquante
          ? ERREURS.base
          : /invalid|credentials/i.test(error.message)
            ? 'Identifiant ou mot de passe incorrect.'
            : 'Connexion impossible : ' + error.message
      );
      return;
    }

    verifierEtRediriger();
  });
}

async function verifierEtRediriger() {
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) return;

  const { data: profil } = await sb
    .from('profiles')
    .select('role, agence_id, actif')
    .eq('id', session.user.id)
    .maybeSingle();

  if (!profil || !profil.actif) {
    await sb.auth.signOut();
    afficher(ERREURS.profil);
    btn.disabled = false;
    btn.textContent = 'Se connecter';
    return;
  }

  const perms = await permissionsCourantes(profil.role);

  // un rôle qui ne travaille que sur son agence a besoin d'un rattachement
  const surUneAgence =
    (perms.includes('depart.lire') || perms.includes('depart.declarer')) &&
    !perms.includes('depart.lire_tout') &&
    !perms.includes('depart.declarer_tout');

  if (surUneAgence && !profil.agence_id) {
    await sb.auth.signOut();
    afficher(ERREURS.agence);
    btn.disabled = false;
    btn.textContent = 'Se connecter';
    return;
  }

  // premier écran que ce profil a le droit d'ouvrir
  const accueil = perms.includes('dashboard.lire')
    ? 'dashboard.html'
    : perms.includes('depart.lire') || perms.includes('depart.declarer')
      ? 'depart.html'
      : perms.includes('admin.acces')
        ? 'admin.html'
        : '';

  if (!accueil) {
    afficher(ERREURS.role);
    btn.disabled = false;
    btn.textContent = 'Se connecter';
    return;
  }

  location.replace(accueil);
}
