// Identifiant lisible ↔ adresse technique.
//
// Supabase Auth n'accepte que des emails : le compte `ag01` existe réellement
// sous `ag01@flowtrax.local`. La conversion vit ici, en un seul endroit, pour
// que la connexion et la création de compte ne puissent pas diverger.

export const DOMAINE = 'flowtrax.local';

/** `ag01` → `ag01@flowtrax.local` ; une vraie adresse passe telle quelle. */
export function versEmail(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s) return '';
  return s.includes('@') ? s : s + '@' + DOMAINE;
}

/** 3 à 32 caractères : minuscules, chiffres, point, tiret, souligné. */
export function identifiantValide(v) {
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(String(v == null ? '' : v).trim().toLowerCase());
}

/** Cet email a-t-il été fabriqué par l'application (et non fourni par quelqu'un) ? */
export function estTechnique(email) {
  return String(email == null ? '' : email).trim().toLowerCase().endsWith('@' + DOMAINE);
}

/** `ag01@flowtrax.local` → `ag01` ; sert de repli quand `username` est vide. */
export function depuisEmail(email) {
  const s = String(email == null ? '' : email).trim().toLowerCase();
  return s.includes('@') ? s.slice(0, s.indexOf('@')) : s;
}
