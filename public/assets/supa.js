import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { chargerTheme } from './theme.js';
import { setGabarits } from './wa.js';

export const isConfigured =
  Boolean(SUPABASE_URL) &&
  Boolean(SUPABASE_ANON_KEY) &&
  !SUPABASE_URL.includes('VOTRE-PROJET') &&
  !SUPABASE_ANON_KEY.includes('VOTRE_CLE');

export const sb = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export async function getProfile() {
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) return null;

  const { data, error } = await sb
    .from('profiles')
    .select('id, nom, role, agence_id, actif')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { session, profile: null };

  const permissions = await permissionsCourantes(data.role);

  // le libellé du rôle vit dans public.roles ; tant que 0012 n'est pas passée,
  // la table manque et le code du rôle fait l'affaire
  let libelle = data.role;
  const r = await sb.from('roles').select('libelle').eq('code', data.role).maybeSingle();
  if (!r.error && r.data) libelle = r.data.libelle;

  return { session, profile: { ...data, role_libelle: libelle, permissions } };
}

/* Les droits d'avant 0012, tant que la migration n'est pas passée : sans ce
   repli, un déploiement de l'interface avant le collage du SQL fermerait tous
   les écrans (l'appel à mes_permissions répondrait PGRST202). Dès que la
   fonction existe, c'est elle qui fait foi. */
const PERMS_LEGACY = {
  AGENCE: ['depart.lire', 'depart.declarer', 'depart.modifier', 'depart.annuler'],
  REGULATION: [
    'depart.lire',
    'depart.lire_tout',
    'depart.declarer',
    'depart.declarer_tout',
    'depart.modifier',
    'depart.modifier_tout',
    'depart.annuler',
    'dashboard.lire',
    'rapports.lire',
  ],
  DIRECTION: [
    'depart.lire',
    'depart.lire_tout',
    'depart.declarer',
    'depart.declarer_tout',
    'depart.modifier',
    'depart.modifier_tout',
    'depart.annuler',
    'depart.reactiver',
    'dashboard.lire',
    'rapports.lire',
    'admin.acces',
    'admin.referentiels',
    'admin.comptes',
    'admin.roles',
  ],
};

export async function permissionsCourantes(role) {
  try {
    const { data, error } = await sb.rpc('mes_permissions');
    if (!error && Array.isArray(data)) return data;
  } catch {
    // base injoignable : le repli ci-dessous garde l'écran utilisable
  }
  return PERMS_LEGACY[role] || [];
}

/**
 * Garde de page : redirige vers la connexion si la session ne convient pas.
 * @param {{perm?: string|string[], requireAgence?: boolean}} opts
 *        `perm` : permission exigée ; un tableau signifie « l'une d'elles ».
 */
export async function requireSession({ perm = null, requireAgence = true } = {}) {
  if (!sb) {
    location.replace('index.html?erreur=config');
    return null;
  }

  let ctx;
  try {
    ctx = await getProfile();
  } catch {
    location.replace('index.html?erreur=reseau');
    return null;
  }

  if (!ctx) {
    location.replace('index.html');
    return null;
  }

  const p = ctx.profile;
  if (!p) {
    await sb.auth.signOut();
    location.replace('index.html?erreur=profil');
    return null;
  }
  if (p.actif === false) {
    await sb.auth.signOut();
    location.replace('index.html?erreur=inactif');
    return null;
  }
  const exigees = perm == null ? null : Array.isArray(perm) ? perm : [perm];
  if (exigees && !exigees.some((code) => p.permissions.includes(code))) {
    location.replace('index.html?erreur=role');
    return null;
  }
  if (requireAgence && !p.agence_id) {
    await sb.auth.signOut();
    location.replace('index.html?erreur=agence');
    return null;
  }

  // le bordereau pose son logo dans un gabarit construit plus tard : il faut
  // que l'apparence soit à jour avant que l'écran ne dessine quoi que ce soit
  try {
    await chargerTheme(sb);
  } catch {
    // le cache local fait foi : une base muette ne bloque pas la page
  }

  // les messages partis sur WhatsApp se réécrivent depuis Administration →
  // Messages (0013) : ils sont lus ici, avant qu'un écran n'en compose un. Tant
  // que la migration n'est pas passée, wa.js garde ses textes d'origine.
  try {
    const messages = await sb.from('messages').select('code, gabarit');
    if (!messages.error && Array.isArray(messages.data)) {
      const gabarits = {};
      for (const m of messages.data) gabarits[m.code] = m.gabarit;
      setGabarits(gabarits);
    }
  } catch {
    // base injoignable : les textes d'origine restent en place
  }

  return ctx;
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

/** Traduit les erreurs Postgres/PostgREST en phrases utilisables sur le terrain. */
export function erreurLisible(e) {
  const msg = e && e.message ? String(e.message) : String(e);

  if (/uk_bordereau_jour/i.test(msg)) {
    return 'Ce numéro de bordereau existe déjà pour cette agence aujourd\'hui.';
  }
  if (/duplicate key/i.test(msg)) {
    return 'Cette valeur est déjà utilisée : code, immatriculation ou nom en double.';
  }
  if (/violates foreign key constraint|23503/i.test(msg)) {
    return 'Impossible de supprimer : cet élément est encore utilisé (départs, lignes ou comptes). Désactivez-le au lieu de le supprimer.';
  }
  if (/permission denied|42501/i.test(msg)) {
    return 'Action réservée à la direction.';
  }
  if (/column .* does not exist/i.test(msg)) {
    return 'Base de données pas à jour : exécutez les migrations les plus récentes dans Supabase.';
  }
  if (/PGRST202|Could not find the function/i.test(msg)) {
    return 'Base de données pas à jour : la migration 0012 (rôles et permissions) manque.';
  }
  // PGRST205 couvre deux causes (table absente, ou droits non accordés) : la
  // phrase ne doit pas en désigner une seule, sous peine de faire chercher au
  // mauvais endroit
  if (/PGRST205|Could not find the table/i.test(msg)) {
    return 'Table absente ou non accordée : exécutez les migrations les plus récentes dans Supabase.';
  }
  if (/Délai de modification dépassé/i.test(msg)) {
    return 'Le délai de modification est dépassé pour ce départ.';
  }
  if (/Immatriculation inconnue/i.test(msg)) {
    return 'Immatriculation inconnue dans le parc : vérifiez la saisie.';
  }
  if (/Itinéraire incohérent/i.test(msg)) {
    return 'Itinéraire incohérent : vérifiez la provenance et la destination.';
  }
  if (/Cette agence n''est pas sur la ligne/i.test(msg)) {
    return 'Cette agence n\'est pas sur la ligne choisie.';
  }
  if (/Une ligne doit desservir|apparaître deux fois|Agence inconnue dans l''itinéraire/i.test(msg)) {
    return msg.replace(/^.*?exception:\s*/i, '');
  }
  if (/JWT|not authenticated|invalid claim/i.test(msg)) {
    return 'Session expirée : reconnectez-vous.';
  }
  return msg.replace(/^Exception: /, '').replace(/^Error: /, '');
}
