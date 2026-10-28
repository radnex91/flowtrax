import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

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
  return { session, profile: data || null };
}

/**
 * Garde de page : redirige vers la connexion si la session ne convient pas.
 * @param {{roles?: string[], requireAgence?: boolean}} opts
 */
export async function requireSession({ roles = null, requireAgence = true } = {}) {
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
  if (roles && !roles.includes(p.role)) {
    location.replace('index.html?erreur=role');
    return null;
  }
  if (requireAgence && !p.agence_id) {
    await sb.auth.signOut();
    location.replace('index.html?erreur=agence');
    return null;
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
    return 'Impossible de supprimer : cet élément est utilisé par des départs. Désactivez-le au lieu de le supprimer.';
  }
  if (/permission denied|42501/i.test(msg)) {
    return 'Action réservée à la direction.';
  }
  if (/column .* does not exist/i.test(msg)) {
    return 'Base de données pas à jour : exécutez les migrations les plus récentes dans Supabase.';
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
