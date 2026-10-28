// Copier ce fichier en `config.js` puis renseigner les deux valeurs.
// Project Settings → API dans le tableau de bord Supabase.
//
// La clé `anon` est PUBLIQUE par conception : elle est visible dans le code
// source de la page. Ce qui protège les données, ce sont les policies RLS
// (supabase/migrations/0002_rls.sql). Ne JAMAIS mettre la clé `service_role`
// ici : elle contourne toute la sécurité.

export const SUPABASE_URL = 'https://VOTRE-PROJET.supabase.co';
export const SUPABASE_ANON_KEY = 'VOTRE_CLE_ANON';
