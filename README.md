# FlowTrax — suivi des départs

Remplacement de l'application Google Apps Script « Départs Danay Express » par une
application hébergée **gratuitement sur GitHub**, avec une vraie base de données,
un dashboard et une authentification par utilisateur.

L'écran de saisie, les libellés et le message WhatsApp envoyé aux groupes sont
**identiques à l'application actuelle**. C'est vérifié par des tests automatiques.

---

## 1. Ce qui tourne où

| Rôle | Service | Coût |
|---|---|---|
| Pages HTML, CSS, JS | **GitHub Pages** (dossier `public/`) | gratuit |
| Tests + déploiement + rapport planifié | **GitHub Actions** | gratuit |
| Base de données, authentification, règles d'accès | **Supabase** (`supabase/migrations/`) | gratuit jusqu'à 500 Mo |
| Envoi du rapport quotidien (option) | **Supabase Edge Function** + cron GitHub | gratuit |

GitHub Pages ne sert que des fichiers statiques : il ne peut pas exécuter de PHP
ni garder un mot de passe. Tout ce qui est confidentiel (données, comptes) vit
chez Supabase, et le navigateur n'y accède que via la clé publique `anon`, filtrée
par les règles RLS écrites dans `0002_rls.sql`.

Le dépôt git ne doit donc contenir **aucune donnée d'exploitation** : seulement
du code et le schéma.

---

## 2. Mise en route — 5 étapes

### Étape 1 — Créer le projet Supabase et charger le schéma

1. <https://supabase.com> → *New project*. Notez le mot de passe Postgres.
2. *SQL Editor* → *New query* : collez **`0001_schema.sql`**, exécutez.
3. Même chose avec **`0002_rls.sql`**, **`0003_seed_demo.sql`**,
   **`0004_direction_ecriture.sql`**, puis **`0005_identifiants.sql`**.

L'ordre est obligatoire : `0002` crée les policies sur les tables de `0001`,
`0003` insère les données de démonstration, `0004` accorde à la direction les
privilèges d'écriture que `0002` suppose, `0005` ajoute l'identifiant de
connexion. Sans `0004`, l'écran Administration répond « permission denied for
table agences » : en Postgres le `GRANT` est vérifié avant la RLS, une policy
seule ne suffit pas.

> `0003` est un jeu de démonstration (3 agences, 4 véhicules, 4 agents). Avant la
> mise en service, remplacez-le par vos vraies agences et votre vrai parc, ou
> videz les tables concernées puis saisissez-les depuis le dashboard Supabase.

### Étape 2 — Déployer la fonction des comptes, puis créer le premier accès

Créer un compte de connexion exige la clé `service_role`, qui contourne toute la
RLS : elle ne peut donc pas vivre dans la page. Une **Edge Function** la garde
côté Supabase et fait le travail à la place du navigateur.

```bash
supabase functions deploy admin-comptes
```

> Le nom qui compte est celui **réellement déployé**, et il vit dans
> `public/assets/config.js` (`FONCTION_COMPTES`). Le tableau de bord pré-remplit
> le champ du nom avec un nom généré : si la fonction part sous un autre nom,
> corrigez cette seule ligne — le fichier n'est jamais mis en cache.

Les secrets du projet (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`) sont injectés automatiquement : il n'y a rien à
saisir. La fonction revérifie elle-même le jeton reçu **et** lit le rôle de
l'appelant dans `profiles` — elle ne fait jamais confiance au corps de la requête.

Tant qu'aucun compte `DIRECTION` n'existe, personne ne peut ouvrir l'écran
d'administration : il faut donc amorcer **un** compte à la main.

1. *Authentication → Users → Add user* : `direction@flowtrax.local` + mot de
   passe, cochez *Auto Confirm User*.
2. Copiez l'UUID du compte créé.
3. Dans le *SQL Editor*, rattachez-lui un profil :

```sql
insert into public.profiles (id, nom, username, email, role, agence_id)
values ('<uuid-du-compte>', 'Nom Prénom', 'direction', 'direction@flowtrax.local', 'DIRECTION', null);
```

Connectez-vous ensuite avec l'identifiant **`direction`** — pas l'adresse.
**Administration → Comptes** crée désormais tous les autres, avec leur
identifiant, leur rôle, leur agence et leur mot de passe. Plus besoin de SQL ni
du tableau de bord Supabase.

`role` vaut `AGENCE` (saisie de son agence uniquement), `REGULATION` (lecture de
toutes les agences, dashboard) ou `DIRECTION` (tout, plus l'écran d'administration).
`agence_id` est **obligatoire** pour un compte `AGENCE` : c'est lui qui détermine
ce que l'utilisateur voit.

### Les identifiants, et l'adresse derrière

Supabase Auth n'accepte que des adresses email : il n'existe pas de champ
« username ». Un compte `ag01` est donc réellement porté par
`ag01@flowtrax.local`, fabriquée par l'application. Personne ne voit cette
adresse : l'écran de connexion et l'écran Comptes ne parlent que d'identifiants.

Deux conséquences, à connaître :

- **pas de « mot de passe oublié » par email** — le domaine est interne. La
  direction réinitialise depuis **Administration → Comptes → Mot de passe** ;
- un **compte amorcé avec une vraie adresse** (`direction@danay.cd`) continue de
  fonctionner : l'écran de connexion accepte une adresse complète, elle est
  simplement transmise telle quelle au lieu d'être complétée.

### Étape 3 — Régler le fuseau horaire

Tant que ce réglage vaut `UTC`, l'application affiche un bandeau d'avertissement
et la « journée de service » bascule à 22 h ou 2 h du matin au lieu de minuit local.

```sql
update public.settings set value = 'Africa/Maseru', updated_at = now()
where key = 'timezone';
```

Le nom doit être un fuseau IANA (`Africa/Kinshasa`, `Africa/Lubumbashi`,
`Indian/Antananarivo`…). `Africa/Maseru` est la valeur du jeu de démonstration :
adaptez-la à votre exploitation.

Le second réglage, `edit_window_minutes` (120 par défaut), est le délai pendant
lequel une agence peut encore corriger un départ après l'heure de départ.

### Étape 4 — Renseigner les clés publiques

*Supabase → Project Settings → API* : copiez *Project URL* et la clé `anon public`.

```js
// public/assets/config.js
export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

La clé `anon` est publique par conception : elle est visible dans le code de la
page. Ce qui protège les données, ce sont les policies RLS. Ne mettez **jamais**
la clé `service_role` dans ce fichier — elle contourne toute la sécurité.

`config.js` n'est volontairement pas mis en cache par le service worker : après
une modification, un simple rechargement suffit.

### Étape 5 — Publier sur GitHub Pages

1. Poussez le dépôt sur GitHub (`main`).
2. *Settings → Pages → Source* : **GitHub Actions**.
3. Le workflow `pages.yml` se déclenche au push : tests, vérification de syntaxe,
   puis déploiement du dossier `public/`.
4. L'URL est affichée dans l'onglet *Actions*, job `deploy`.

Si `config.js` contient encore `VOTRE-PROJET`, le workflow affiche un
avertissement et l'application montre un écran de configuration au lieu du
formulaire de connexion.

### Option — rapport quotidien automatique

Le workflow `rapport.yml` appelle l'Edge Function `rapport-quotidien` chaque jour
à 18 h UTC. Pour l'activer :

```bash
supabase functions deploy rapport-quotidien --no-verify-jwt
supabase secrets set RAPPORT_TOKEN=<chaîne-aléatoire-longue>
```

Puis dans GitHub, *Settings → Secrets and variables → Actions* : créez
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (côté serveur uniquement) et
`RAPPORT_TOKEN` (la même valeur que ci-dessus). Si les secrets manquent, le
workflow se termine proprement avec une simple notification : il ne casse rien.

Pour l'envoi WhatsApp automatique, ajoutez `WHATSAPP_TOKEN` et
`WHATSAPP_PHONE_ID` (API Cloud de Meta) ; sans eux, le rapport est enregistré en
base et reste consultable, mais aucun message n'est envoyé.

---

## 3. L'écran Administration

`admin.html`, réservé au rôle `DIRECTION` (lien « Administration » depuis le
tableau de bord). Neuf onglets, aucune saisie technique :

| Onglet | Ce qu'on y fait |
|---|---|
| **Agences** | code à 4 caractères, nom, ville, active |
| **Lignes** | nom, sens, type, active, et surtout **l'itinéraire** : l'ordre des agences |
| **Sens** | les directions proposées à une ligne (Nord, Sud, …), actives ou non ; c'est cette liste que le formulaire d'une ligne propose |
| **Parc** | immatriculation, marque, type, nombre de places, en service ; import en masse depuis Excel ou un CSV |
| **Fonctions** | les fonctions proposées pour un utilisateur (Chauffeur, Guichetier, Chef d'agence, …) ; leur code est stable, leur libellé se renomme |
| **Utilisateurs** | nom, fonction (prise dans le référentiel), agence |
| **Comptes** | créer un compte, changer son identifiant ou son mot de passe, rôle, agence, actif — la clé secrète reste chez Supabase |
| **Réglages** | fuseau horaire et fenêtre de modification, validés à l'écriture |
| **Apparence** | logo importé, mode d'affichage (système / clair / sombre) et couleur d'accent, appliqués à tous les écrans et au bordereau |

Le logo importé est réduit à 320 px de côté dans le navigateur, puis rangé dans
`settings` (`logo_data`) sous forme de `data:` URL : pas de bucket de stockage
supplémentaire pour une image que seuls les écrans lisent. Couleur et mode
vivent à côté (`theme_accent`, `theme_mode`). La migration `0008` crée ces trois
clés, fait valider leur contenu par la même garde que le fuseau, et ouvre leur
lecture à l'écran de connexion — limitée à ces trois clés, jamais à toute la
table. Chaque navigateur garde une copie locale pour s'ouvrir déjà habillé.

Trois règles tenues par la base, pas par l'écran :

- **rien ne se supprime si un départ y fait référence** : le message propose de
  désactiver à la place, et l'historique reste intact ;
- **l'itinéraire se réécrit en une seule instruction** (`set_axe_itineraire`) :
  `(axe_id, position)` est la clé primaire, un simple échange de deux positions
  violerait l'unicité en cours de route ;
- **on ne se coupe pas soi-même** : impossible de changer son propre rôle ou de
  désactiver son propre compte, même en contournant l'interface.

Un compte désactivé perd réellement ses droits : `my_role()` ignore les profils
`actif = false`, donc les policies refusent tout, et la connexion affiche « Ce
compte a été désactivé ».

## 4. Rapports, exports et bordereau

`rapports.html` — accessible à `REGULATION` et `DIRECTION` (lien « Rapports »
depuis le tableau de bord). Une période (du / au), un filtre par agence, deux
onglets :

- **Période** : indicateurs, synthèse par agence, synthèse par jour, détail des
  départs. Les taux sont **pondérés sur la période** (`Σ complétées ÷ Σ places
  restantes`), pas une moyenne de moyennes ;
- **Historique** : les 200 dernières écritures de `audit_log`, avec pour chacune
  la valeur **avant → après** champ par champ, l'auteur et l'heure. Une annulation
  y apparaît comme telle, avec son motif.

Deux exports CSV — « Exporter les départs » et « Exporter la synthèse » :
séparateur point-virgule, BOM UTF-8, virgule décimale, fins de ligne CRLF, ce
qu'Excel attend en français. Une cellule commençant par `=`, `+`, `-` ou `@` est
désamorcée (injection de formule) sans perdre son contenu.

**Le PDF passe par l'impression du navigateur**, pas par une bibliothèque :
`bordereau.html` est mise en page pour le papier (A4, en-tête, logo, trajet,
effectifs, passants, équipage, déclarant) et le bouton « Imprimer / PDF » appelle
`window.print()` → « Enregistrer au format PDF ». Chaque heure de départ, au
tableau de bord comme dans les rapports, ouvre le bordereau correspondant.

## 5. Ce qui est identique au caractère près

Vérifié par `tests/wa.test.mjs` (9 tests) :

- le message de départ WhatsApp : entêtes, émojis, ordre des lignes, séparateurs,
  y compris la ligne `Axe :` répétée deux fois comme aujourd'hui ;
- le message de correction (« *Correction* », mention de remplacement) ;
- le message d'annulation ;
- l'absence de la ligne des passagers quand il n'y en a pas ;
- le tiret cadratin pour une heure d'arrivée vide ;
- les libellés et les identifiants de champs de la page de saisie ;
- la charte graphique (couleur `#C4560B`, Barlow Condensed, mode sombre).

Si un de ces messages change, le test échoue et le déploiement est bloqué.

## 6. Ce qui change volontairement

| Sujet | Avant | Maintenant |
|---|---|---|
| Connexion | agence + code à 4 chiffres, mémorisé dans le navigateur | identifiant + mot de passe Supabase ; le rôle vient de la base |
| Droits | aucun (tout le monde pouvait tout lire) | RLS : une agence ne voit que la sienne, `DIRECTION` gère les référentiels |
| Suppression d'un départ | possible | impossible : on annule (`statut = 'ANNULE'`), la trace reste |
| Intégrité | contrôlée dans le navigateur | contrôlée en base : itinéraire cohérent, capacité du véhicule figée à la déclaration, bordereau unique par jour et par agence, déclarant non modifiable, pas de réactivation |
| Deux taux | un seul (« taux de remplissage ») | `taux_agence` (à bord ÷ places restantes, comme avant) **et** `taux_vehicule` (occupation totale du véhicule) ; le premier est inchangé |
| Bouton `Changer d'agence` | changeait l'agence locale | devient `Se déconnecter` (une session = une agence) |
| Référentiels | édités à la main dans le Google Sheet | écran Administration réservé à `DIRECTION`, validé par la base |
| Navigation | deux ou trois liens dans l'en-tête de chaque page | un rail persistant à gauche au-dessus de 1024 px, une barre basse en dessous ; une seule définition (`assets/nav.js`), filtrée par le rôle. Le bordereau imprimé reste hors coque |

## 7. Points à confirmer

1. **Ligne `Axe :` en double** dans le message WhatsApp : reproduite telle quelle.
   Est-ce voulu, ou un reste de bug à corriger ?
2. **Fenêtre de modification** : 120 minutes après l'heure de départ. Quelle est
   la vraie règle ?
3. **Fuseau horaire** : à régler (étape 3). `UTC` n'est qu'une valeur d'attente.
4. **Bordereau unique par agence et par jour** : est-ce la règle, ou le même
   numéro peut-il resservir un autre jour ?
5. **Dépassement de capacité** : l'application avertit mais enregistre, comme
   aujourd'hui. Faut-il bloquer ?

## 8. Suite

- Envoi du rapport par email (aujourd'hui : WhatsApp ou archivage seul).
- Occupation par segment, reconstruite depuis les `passants` : le taux actuel
  compare les montées au total des places, sans dire où le bus roule plein.
- Rappel automatique aux agences qui n'ont pas saisi leurs départs du jour.

## 9. Développer et tester

Pas d'étape de build : les modules ES sont servis tels quels.

```bash
npm test        # 74 tests : messages, pages, SQL, CSV et import, historique, comptes, identifiants, portée, coque, apparence
npm run check   # node --check sur les modules du navigateur
```

Pour travailler en local, servez `public/` avec n'importe quel serveur statique
(`npx serve public`), jamais en `file://` — les modules ES et le service worker
exigent HTTP.

### Bootstrap 5

Bootstrap 5.3.3 est **recopié dans le dépôt** (`public/vendor/bootstrap/`), pas
chargé depuis un CDN : l'écran de saisie doit s'ouvrir sans réseau, et un CDN
tomberait en même temps que le reste. Chaque page charge, dans cet ordre :

```html
<link rel="stylesheet" href="vendor/bootstrap/bootstrap.min.css">
<link rel="stylesheet" href="assets/app.css">
```

`assets/app.css` n'est plus une feuille autonome : c'est une **couche de thème**
qui branche l'identité de l'application sur les jetons de Bootstrap
(`--bs-primary`, `--bs-body-bg`, `--bs-btn-*`, `--bs-border-radius`…). Les
composants servis sont donc ceux de Bootstrap — boutons, champs, cartes,
tableaux, alertes — et un changement de couleur d'accent ou de mode dans
Administration les suit tous. Seuls les blocs qui n'existent pas dans Bootstrap
gardent leur propre style : rail de navigation, bandeau de quai, plaque
d'immatriculation, bordereau imprimé.

Le mode « auto » est résolu en `data-bs-theme="dark"|"light"` avant le premier
rendu (`assets/theme-boot.js`), pour éviter le clignotement clair → sombre. Les
deux fichiers `vendor/bootstrap/` sont précachés par le service worker.

## 10. Limites connues

- Le SQL des migrations n'a pas encore été exécuté contre un projet Supabase
  réel : il a été relu et structuré, pas validé en production. Passez `0001` à
  `0011` sur un projet de test avant la mise en service.
- L'écran Administration ne peut créer de compte que si la fonction des comptes
  est déployée (étape 2) et que son nom correspond à `FONCTION_COMPTES` dans
  `public/assets/config.js`. Sinon, l'écran répond « fonction non déployée » au
  lieu d'échouer silencieusement.
- Les Edge Functions n'ont pas de test d'exécution : `tests/fonctions.test.mjs`
  vérifie leurs invariants de sécurité en lisant le source (JWT revérifié, rôle
  lu en base, dernier compte direction protégé), pas leur comportement réel.
- L'historique ne couvre que les départs : le trigger d'audit n'écrit que pour
  `departures`. Modifier une agence ou un véhicule ne laisse pas de trace.
- Rapports et exports sont calculés dans le navigateur : la période est limitée à
  un an, et le détail affiché aux 200 premiers départs (l'export, lui, prend tout).
- Pas de saisie hors-ligne : le service worker permet seulement d'**ouvrir**
  l'écran de saisie sans réseau, l'enregistrement exige le serveur.
- `_reference/` contient l'application d'origine extraite (HTML, CSS, JS) : c'est
  la source de vérité pour les libellés. Ce dossier n'est pas publié.
