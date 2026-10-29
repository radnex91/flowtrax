import { sb, isConfigured } from './supa.js';
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

  sb.auth.getSession().then(({ data }) => {
    if (data.session) verifierEtRediriger();
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();

    const identifiant = document.getElementById('identifiant').value.trim();
    const password = document.getElementById('password').value;

    if (!identifiant || !password) {
      afficher('Saisissez votre identifiant et votre mot de passe.');
      return;
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

  if (profil.role === 'AGENCE' && !profil.agence_id) {
    await sb.auth.signOut();
    afficher(ERREURS.agence);
    btn.disabled = false;
    btn.textContent = 'Se connecter';
    return;
  }

  location.replace(profil.role === 'AGENCE' ? 'depart.html' : 'dashboard.html');
}
