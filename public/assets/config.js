// Clés publiques du projet Supabase.
// La clé anon est publique par conception ; la sécurité est assurée par les
// policies RLS. Ne jamais placer la clé service_role dans ce fichier.

export const SUPABASE_URL = 'https://cdjaqofltxlrhytpimjx.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_UAWkfi2iIx81FaDhMrlTXA_-dnR2zl7';

// Nom de l'Edge Function qui crée les comptes et change les mots de passe.
// Le tableau de bord Supabase pré-remplit ce nom au hasard : c'est le nom
// réellement déployé qui compte, pas celui du dossier du dépôt. Ce fichier
// n'étant jamais mis en cache, corriger cette ligne suffit — sans toucher au
// reste du code.
export const FONCTION_COMPTES = 'clever-handler';
