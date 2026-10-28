// FlowTrax — comptes et mots de passe — Supabase Edge Function (Deno).
//
// Appelée par public/assets/admin.js avec le JWT de l'utilisateur connecté :
//   POST /functions/v1/admin-comptes   { action: 'creer' | 'email' | 'motdepasse' | 'supprimer', ... }
//
// Pourquoi une fonction et pas le navigateur : créer un compte de connexion
// exige la clé `service_role`, qui contourne toute la RLS. Elle ne doit donc
// vivre que dans les secrets de Supabase, jamais dans un fichier publié.
//
// Déploiement :  supabase functions deploy admin-comptes
// Secrets : ceux du projet (SUPABASE_URL, SUPABASE_ANON_KEY,
//           SUPABASE_SERVICE_ROLE_KEY) sont injectés automatiquement.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });

const ROLES = new Set(['AGENCE', 'REGULATION', 'DIRECTION']);
const MOT_DE_PASSE_MIN = 8;

// Supabase Auth n'accepte que des emails : un identifiant `ag01` est porté par
// l'adresse `ag01@flowtrax.local`. Même règle que public/assets/ident.js et que
// la contrainte `profiles_username_forme` (0005) — un test les compare.
const DOMAINE = 'flowtrax.local';
const IDENT = /^[a-z0-9][a-z0-9._-]{2,31}$/;

const normIdent = (v: unknown) => String(v || '').trim().toLowerCase();
const versEmail = (id: string) => (id.includes('@') ? id : id + '@' + DOMAINE);
const depuisEmail = (e: string) => String(e || '').split('@')[0].toLowerCase();

const emailValide = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

const uuidValide = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Les erreurs de GoTrue arrivent en anglais : on les rend utilisables. */
function messageAuth(e: { message?: string; code?: string } | null): string {
  const m = String(e?.message || e?.code || 'échec');
  if (/already been registered|already exists|email_exists/i.test(m)) {
    return 'Cette adresse email a déjà un compte.';
  }
  if (/password/i.test(m) && /short|6 characters|weak/i.test(m)) {
    return 'Mot de passe trop court ou trop simple.';
  }
  if (/invalid format|unable to validate email/i.test(m)) {
    return 'Adresse email invalide.';
  }
  if (/database error deleting user/i.test(m)) {
    return 'Ce compte a déclaré des départs : désactivez-le au lieu de le supprimer.';
  }
  return m;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'méthode attendue : POST' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  // Selon l'âge du projet, l'environnement expose les clés historiques (JWT)
  // ou les nouvelles (sb_publishable_ / sb_secret_). On accepte les deux :
  // sans ce repli, la fonction répond 500 « secrets manquants » alors que
  // rien ne manque.
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');
  if (!url || !anon || !service) {
    const absents = [
      !url && 'SUPABASE_URL',
      !anon && 'SUPABASE_ANON_KEY ou SUPABASE_PUBLISHABLE_KEY',
      !service && 'SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEY',
    ].filter(Boolean);
    return json({ error: 'fonction mal configurée : ' + absents.join(', ') }, 500);
  }

  // 1. Qui appelle ? La passerelle vérifie déjà le JWT, on le revérifie ici :
  //    une fonction déployée sans vérification ne doit pas devenir une porte.
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'non autorisé' }, 401);

  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { data: qui, error: eAuth } = await client.auth.getUser(jwt);
  if (eAuth || !qui?.user) return json({ error: 'session invalide ou expirée' }, 401);

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 2. Quel rôle ? Le rôle vient de la base, pas du corps de la requête.
  const { data: profil, error: eProfil } = await admin
    .from('profiles')
    .select('id, role, actif')
    .eq('id', qui.user.id)
    .maybeSingle();

  if (eProfil) return json({ error: eProfil.message }, 500);
  if (!profil?.actif || profil.role !== 'DIRECTION') {
    return json({ error: 'action réservée à la direction' }, 403);
  }

  const corps = await req.json().catch(() => null);
  if (!corps || typeof corps !== 'object') return json({ error: 'corps JSON attendu' }, 400);

  const action = String((corps as Record<string, unknown>).action || '');
  const c = corps as Record<string, any>;

  // --- Créer un compte de connexion + son profil -------------------------
  if (action === 'creer') {
    const identifiant = normIdent(c.identifiant);
    const nom = String(c.nom || '').trim();
    const role = String(c.role || '');
    const agence = c.agence_id == null || c.agence_id === '' ? null : Number(c.agence_id);
    const motdepasse = String(c.mot_de_passe || '');

    if (!identifiant) return json({ error: 'identifiant requis' }, 400);

    // Une adresse complète reste acceptée : elle sert au compte amorcé à la
    // main depuis le tableau de bord, avant que l'écran Comptes n'existe.
    const email = versEmail(identifiant);
    const username = depuisEmail(email);

    if (!IDENT.test(username) || !emailValide(email)) {
      return json(
        {
          error:
            'identifiant invalide : 3 à 32 caractères, minuscules, chiffres, point, tiret ou souligné',
        },
        400
      );
    }
    if (!nom) return json({ error: 'nom requis' }, 400);
    if (!ROLES.has(role)) return json({ error: 'rôle inconnu' }, 400);
    if (role === 'AGENCE' && !agence) {
      return json({ error: 'un compte agence doit être rattaché à une agence' }, 400);
    }
    if (motdepasse.length < MOT_DE_PASSE_MIN) {
      return json({ error: `mot de passe : ${MOT_DE_PASSE_MIN} caractères minimum` }, 400);
    }

    const { data: cree, error: e1 } = await admin.auth.admin.createUser({
      email,
      password: motdepasse,
      email_confirm: true,
    });
    if (e1 || !cree?.user) return json({ error: messageAuth(e1) }, 400);

    const { error: e2 } = await admin.from('profiles').insert({
      id: cree.user.id,
      nom,
      email,
      username,
      role,
      agence_id: agence,
      actif: true,
    });

    if (e2) {
      // pas de compte fantôme sans profil : on défait la création
      await admin.auth.admin.deleteUser(cree.user.id);
      return json({ error: e2.message }, 400);
    }

    return json({ ok: true, id: cree.user.id });
  }

  // --- Actions sur un compte existant ------------------------------------
  const id = String(c.id || '');
  if (!uuidValide(id)) return json({ error: 'identifiant de compte invalide' }, 400);

  if (action === 'identifiant') {
    const nouveau = normIdent(c.identifiant);
    if (!IDENT.test(nouveau)) {
      return json(
        {
          error:
            'identifiant invalide : 3 à 32 caractères, minuscules, chiffres, point, tiret ou souligné',
        },
        400
      );
    }

    const { data: cible, error: e0 } = await admin
      .from('profiles')
      .select('id, username, email')
      .eq('id', id)
      .maybeSingle();

    if (e0) return json({ error: e0.message }, 500);
    if (!cible) return json({ error: 'compte inconnu' }, 404);

    const ancien = normIdent(cible.username || depuisEmail(cible.email));
    if (nouveau === ancien) return json({ ok: true });

    // 1. le profil, qui porte l'unicité de l'identifiant
    const { error: e1 } = await admin.from('profiles').update({ username: nouveau }).eq('id', id);
    if (e1) {
      return json(
        { error: /duplicate|unique/i.test(e1.message) ? 'Cet identifiant est déjà utilisé.' : e1.message },
        400
      );
    }

    // 2. l'adresse technique suit ; une vraie adresse fournie par la personne
    //    ne bouge pas (elle peut recevoir du courrier)
    const technique = String(cible.email || '').toLowerCase().endsWith('@' + DOMAINE);
    if (technique) {
      const email = nouveau + '@' + DOMAINE;
      const { error: e2 } = await admin.auth.admin.updateUserById(id, {
        email,
        email_confirm: true,
      });

      if (e2) {
        // pas de profil renommé sans compte renommé : on revient en arrière
        await admin.from('profiles').update({ username: ancien }).eq('id', id);
        return json({ error: messageAuth(e2) }, 400);
      }

      await admin.from('profiles').update({ email }).eq('id', id);
    }

    return json({ ok: true });
  }

  if (action === 'motdepasse') {
    const motdepasse = String(c.mot_de_passe || '');
    if (motdepasse.length < MOT_DE_PASSE_MIN) {
      return json({ error: `mot de passe : ${MOT_DE_PASSE_MIN} caractères minimum` }, 400);
    }

    const { error } = await admin.auth.admin.updateUserById(id, { password: motdepasse });
    if (error) return json({ error: messageAuth(error) }, 400);

    return json({ ok: true });
  }

  if (action === 'supprimer') {
    if (id === profil.id) {
      return json({ error: 'vous ne pouvez pas supprimer votre propre compte' }, 400);
    }

    const { data: cible } = await admin
      .from('profiles')
      .select('id, role, actif')
      .eq('id', id)
      .maybeSingle();

    if (!cible) return json({ error: 'compte inconnu' }, 404);

    // ne pas se verrouiller dehors : il doit rester un direction actif
    if (cible.role === 'DIRECTION') {
      const { count } = await admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'DIRECTION')
        .eq('actif', true);

      if ((count ?? 0) <= 1) {
        return json(
          { error: 'c\'est le dernier compte direction actif : créez-en un autre avant' },
          400
        );
      }
    }

    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return json({ error: messageAuth(error) }, 400);

    return json({ ok: true });
  }

  return json({ error: 'action inconnue' }, 400);
});
