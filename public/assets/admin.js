import { sb, requireSession, erreurLisible } from './supa.js';
import { depuisEmail, identifiantValide } from './ident.js';
import { FONCTION_COMPTES } from './config.js';
import { monterNav } from './nav.js';
import { ACCENTS, appliquer, hexValide, logoAcceptable, reduireLogo } from './theme.js';
import { parcDepuisCsv } from './csv.js';

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const optionsHtml = (liste) =>
  liste.map((o) => '<option value="' + esc(o.v) + '">' + esc(o.l) + '</option>').join('');

const MOT_DE_PASSE_MIN = 8;

const DATA = {
  agences: [],
  axes: [],
  sens: [],
  axe_agences: [],
  vehicules: [],
  agents: [],
  profiles: [],
  settings: [],
};

let SESSION = null;
let SECTION = 'agences';
let EDITE = null; // ligne en cours de modification (objet de DATA)
let ITIN_AXE = null; // ligne dont on édite l'itinéraire
let ITIN = []; // agences ordonnées de cette ligne
let MDP_ID = null; // compte dont on change le mot de passe
let IDENT_ID = null; // compte dont on change l'identifiant
let APPARENCE = { accent: '', mode: 'auto', logo: '' }; // apparence en base, ou en cours d'édition

const nomAgence = (id) => (DATA.agences.find((a) => a.id === id) || {}).nom || '—';
const etiquetteAgence = (a) => a.code + ' · ' + a.nom;
const itineraire = (id) =>
  DATA.axe_agences
    .filter((x) => x.axe_id === id)
    .sort((a, b) => a.position - b.position)
    .map((x) => x.agence_id);

const oui = (v) => (v ? '<span class="pill ok">Oui</span>' : '<span class="pill bad">Non</span>');
const tz = (v) => (v ? '<span class="mono">' + esc(v) + '</span>' : '—');

/* ------------------------------------------------------------------ écrans */

const AGENCES_OPT = () => DATA.agences.map((a) => ({ v: a.id, l: etiquetteAgence(a) }));

/* Sens : un mot de la liste, affiché avec sa majuscule alors qu'il est rangé en
   capitales ('NORD' se lit « Nord », 'NORD-EST' se lit « Nord-est »). */
const SENS_LEGACY = ['NORD', 'SUD', 'AUCUN']; // la liste de 0001, tant que 0010 n'est pas passée
const libelleSens = (nom) => nom.charAt(0) + nom.slice(1).toLowerCase();
const lignesDuSens = (nom) => DATA.axes.filter((a) => a.sens === nom).length;

const SENS_OPT = () => {
  if (!DATA.sens.length) return SENS_LEGACY.map((n) => ({ v: n, l: libelleSens(n) }));
  // le sens déjà porté par la ligne qu'on modifie reste proposé même désactivé,
  // sinon l'enregistrement la ferait basculer sur un autre sens sans le dire
  const cur = EDITE && EDITE.sens;
  return DATA.sens
    .filter((s) => s.actif || s.nom === cur)
    .map((s) => ({ v: s.nom, l: libelleSens(s.nom) + (s.actif ? '' : ' (désactivé)') }));
};

const ROLES_OPT = () => [
  { v: 'AGENCE', l: 'Agence — saisie de son agence' },
  { v: 'REGULATION', l: 'Régulation — lecture de tout' },
  { v: 'DIRECTION', l: 'Direction — tout, plus cet écran' },
];

const SPECS = {
  agences: {
    titre: 'Agences',
    aide: 'Le code à 4 caractères figure sur les bordereaux. Une agence déjà utilisée par un départ ne peut pas être supprimée : désactivez-la.',
    table: 'agences',
    cle: 'id',
    singulier: 'une agence',
    ajout: true,
    supprimable: true,
    colonnes: [
      { k: 'code', l: 'Code', f: (r) => '<span class="mono">' + esc(r.code) + '</span>' },
      { k: 'nom', l: 'Nom' },
      { k: 'ville', l: 'Ville' },
      { k: 'actif', l: 'Active', f: (r) => oui(r.actif) },
    ],
    champs: [
      { n: 'code', l: 'Code', t: 'text', req: true, max: 4, mono: true, aide: '4 caractères, ex. AG01' },
      { n: 'nom', l: 'Nom', t: 'text', req: true },
      { n: 'ville', l: 'Ville', t: 'text' },
      { n: 'actif', l: 'Agence active', t: 'check' },
    ],
    defaut: { actif: true },
    normaliser: (o) => {
      if (o.code) o.code = o.code.toUpperCase();
    },
    verifier: (o) => (o.code && o.code.length !== 4 ? 'Le code doit faire exactement 4 caractères.' : null),
  },

  axes: {
    titre: 'Lignes',
    aide: "L'ordre des agences est l'itinéraire : une agence ne peut déclarer un départ que si sa provenance la précède et sa destination la suit. Modifier l'itinéraire ne touche pas aux départs déjà déclarés.",
    table: 'axes',
    cle: 'id',
    singulier: 'une ligne',
    ajout: true,
    supprimable: true,
    itineraire: true,
    colonnes: [
      { k: 'nom', l: 'Ligne' },
      { k: 'sens', l: 'Sens' },
      { k: 'type', l: 'Type' },
      { k: 'actif', l: 'Active', f: (r) => oui(r.actif) },
      {
        k: 'id',
        l: 'Itinéraire',
        f: (r) => {
          const l = itineraire(r.id).map(nomAgence);
          return l.length ? esc(l.join(' → ')) : '<span class="sub">à définir</span>';
        },
      },
    ],
    champs: [
      { n: 'nom', l: 'Nom', t: 'text', req: true, aide: 'ex. NORD 1' },
      {
        n: 'sens',
        l: 'Sens',
        t: 'select',
        options: SENS_OPT,
      },
      {
        n: 'type',
        l: 'Type',
        t: 'select',
        options: () => [
          { v: 'AXE', l: 'Axe' },
          { v: 'LOCATION', l: 'Location' },
        ],
      },
      { n: 'actif', l: 'Ligne active', t: 'check' },
    ],
    defaut: { sens: 'NORD', type: 'AXE', actif: true },
  },

  sens: {
    titre: 'Sens',
    aide: "Le sens range les lignes par direction et n'a d'effet que sur cet écran : il ne change ni les départs déjà déclarés, ni les messages. Renommer un sens renomme les lignes qui le portent ; un sens encore porté par une ligne ne peut pas être supprimé, désactivez-le.",
    table: 'sens',
    cle: 'id',
    singulier: 'un sens',
    ajout: true,
    supprimable: true,
    colonnes: [
      { k: 'nom', l: 'Sens', f: (r) => esc(libelleSens(r.nom)) },
      { k: 'actif', l: 'Actif', f: (r) => oui(r.actif) },
      { k: 'id', l: 'Lignes', n: true, f: (r) => String(lignesDuSens(r.nom)) },
    ],
    champs: [
      { n: 'nom', l: 'Sens', t: 'text', req: true, aide: 'ex. NORD, SUD, NORD-EST' },
      { n: 'actif', l: 'Sens actif', t: 'check' },
    ],
    defaut: { actif: true },
    normaliser: (o) => {
      if (o.nom) o.nom = o.nom.toUpperCase().replace(/\s+/g, ' ');
    },
  },

  vehicules: {
    titre: 'Parc',
    aide: "Les places servent à figer la capacité d'un départ à sa déclaration : les changer demain ne réécrit pas l'historique.",
    table: 'vehicules',
    cle: 'id',
    singulier: 'un véhicule',
    ajout: true,
    supprimable: true,
    colonnes: [
      { k: 'immat', l: 'Immatriculation', f: (r) => '<span class="plate">' + esc(r.immat) + '</span>' },
      { k: 'marque', l: 'Marque' },
      { k: 'type', l: 'Type' },
      { k: 'places', l: 'Places', n: true },
      { k: 'actif', l: 'En service', f: (r) => oui(r.actif) },
    ],
    champs: [
      { n: 'immat', l: 'Immatriculation', t: 'text', req: true, mono: true, aide: 'ex. LT0171HE' },
      { n: 'marque', l: 'Marque', t: 'text' },
      { n: 'type', l: 'Type', t: 'text', aide: 'ex. Bus 70 places' },
      { n: 'places', l: 'Places assises', t: 'num', req: true, min: 1 },
      { n: 'actif', l: 'En service', t: 'check' },
    ],
    defaut: { actif: true },
    normaliser: (o) => {
      if (o.immat) o.immat = o.immat.toUpperCase().replace(/\s+/g, '');
    },
    verifier: (o) => (o.places == null || o.places < 1 ? 'Indiquez un nombre de places supérieur à zéro.' : null),
  },

  agents: {
    titre: 'Utilisateurs',
    aide: "Les utilisateurs apparaissent dans « Équipage » à la saisie. Un utilisateur déjà cité par un départ ne peut pas être supprimé : désactivez-le.",
    table: 'agents',
    cle: 'id',
    singulier: 'un utilisateur',
    ajout: true,
    supprimable: true,
    colonnes: [
      { k: 'nom', l: 'Nom' },
      { k: 'fonction', l: 'Fonction' },
      { k: 'agence_id', l: 'Agence', f: (r) => esc(nomAgence(r.agence_id)) },
      { k: 'actif', l: 'Actif', f: (r) => oui(r.actif) },
    ],
    champs: [
      { n: 'nom', l: 'Nom', t: 'text', req: true },
      {
        n: 'fonction',
        l: 'Fonction',
        t: 'select',
        options: () => [
          { v: 'CHAUFFEUR', l: 'Chauffeur' },
          { v: 'CONVOYEUR', l: 'Convoyeur' },
          { v: 'CHEF_PISTE', l: 'Chef de piste' },
        ],
      },
      { n: 'agence_id', l: 'Agence de rattachement', t: 'select', num: true, vide: true, options: AGENCES_OPT },
      { n: 'actif', l: 'Actif', t: 'check' },
    ],
    defaut: { fonction: 'CHAUFFEUR', actif: true },
  },

  comptes: {
    titre: 'Comptes',
    aide: "Créer un compte, changer son identifiant ou son mot de passe se fait ici : la fonction serveur des comptes s'en charge, avec la clé secrète qui ne quitte jamais Supabase. L'identifiant est ce que la personne tape pour se connecter — jamais une adresse email. Un compte qui a déclaré des départs ne peut pas être supprimé — désactivez-le.",
    table: 'profiles',
    cle: 'id',
    singulier: 'un compte',
    ajout: false,
    supprimable: false,
    gestionComptes: true,
    colonnes: [
      { k: 'nom', l: 'Nom' },
      { k: 'username', l: 'Identifiant', f: (r) => esc(r.username || depuisEmail(r.email) || '—') },
      { k: 'role', l: 'Rôle' },
      { k: 'agence_id', l: 'Agence', f: (r) => esc(nomAgence(r.agence_id)) },
      { k: 'actif', l: 'Actif', f: (r) => oui(r.actif) },
    ],
    champs: [
      { n: 'nom', l: 'Nom', t: 'text', req: true },
      { n: 'role', l: 'Rôle', t: 'select', options: ROLES_OPT },
      { n: 'agence_id', l: 'Agence', t: 'select', num: true, vide: true, options: AGENCES_OPT },
      { n: 'actif', l: 'Compte actif', t: 'check' },
    ],
    figer: (r) => (r.id === SESSION.id ? ['role', 'actif'] : []),
    verifier: (o) => (o.role === 'AGENCE' && !o.agence_id ? 'Un compte agence doit être rattaché à une agence.' : null),
  },

  reglages: {
    titre: 'Réglages',
    aide: "Le fuseau horaire définit la journée de service : tant qu'il vaut UTC, un bandeau d'avertissement s'affiche sur la saisie. La fenêtre de modification se compte en minutes après l'heure de départ.",
    table: 'settings',
    cle: 'key',
    singulier: 'un réglage',
    ajout: false,
    supprimable: false,
    colonnes: [
      { k: 'label', l: 'Réglage', f: (r) => esc(r.label || r.key) },
      { k: 'key', l: 'Clé', f: (r) => '<span class="mono">' + esc(r.key) + '</span>' },
      { k: 'value', l: 'Valeur', f: (r) => tz(r.value) },
    ],
    champs: [{ n: 'value', l: 'Valeur', t: 'text', req: true, list: 'tz-list' }],
    verifier: (o, ligne) => {
      if (ligne && ligne.key === 'timezone') {
        try {
          new Intl.DateTimeFormat('fr-FR', { timeZone: o.value });
        } catch {
          return 'Fuseau horaire inconnu : utilisez un nom IANA, par exemple Africa/Maseru.';
        }
      }
      if (ligne && ligne.key === 'edit_window_minutes') {
        const n = Number(o.value);
        if (!Number.isInteger(n) || n < 0 || n > 1440) return 'Fenêtre attendue en minutes, entre 0 et 1440.';
      }
      return null;
    },
  },

  apparence: {
    titre: 'Apparence',
    aide: "Le logo, le mode d'affichage et la couleur d'accent valent pour tous les comptes et tous les écrans, bordereau imprimé compris. L'aperçu est immédiat ici ; les autres appareils suivent à l'enregistrement.",
    apparence: true,
  },
};

const FUSEAUX = [
  'UTC',
  'Africa/Maseru',
  'Africa/Johannesburg',
  'Africa/Kinshasa',
  'Africa/Lubumbashi',
  'Africa/Lusaka',
  'Africa/Harare',
  'Africa/Maputo',
  'Africa/Gaborone',
  'Africa/Nairobi',
  'Indian/Antananarivo',
];

/* ------------------------------------------------------------- démarrage */

init();

async function init() {
  let ctx;
  try {
    ctx = await requireSession({ roles: ['DIRECTION'], requireAgence: false });
  } catch (e) {
    $('boot').textContent = 'Connexion au serveur impossible : ' + erreurLisible(e);
    return;
  }
  if (!ctx) return;

  SESSION = ctx.profile;
  monterNav(SESSION.role);
  $('who').textContent = SESSION.nom + ' · direction';
  $('logout').hidden = false;

  if (!(await charger())) return;

  $('boot').hidden = true;
  $('app').hidden = false;

  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sec]');
    if (!b) return;
    SECTION = b.dataset.sec;
    EDITE = null;
    ITIN_AXE = null;
    ITIN = [];
    MDP_ID = null;
    IDENT_ID = null;
    alerte(null);
    rendre();
  });

  rendre();
}

$('logout').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.replace('index.html');
});

/* --------------------------------------------------------------- données */

async function charger() {
  const reponses = await Promise.all([
    sb.from('agences').select('id, code, nom, ville, actif').order('code'),
    sb.from('axes').select('id, nom, sens, type, actif').order('nom'),
    sb.from('axe_agences').select('axe_id, agence_id, position').order('axe_id').order('position'),
    sb.from('vehicules').select('id, immat, marque, type, places, actif').order('immat'),
    sb.from('agents').select('id, nom, fonction, agence_id, actif').order('nom'),
    sb.from('profiles').select('id, nom, username, email, role, agence_id, actif').order('nom'),
    sb.from('settings').select('key, value, label').order('key'),
  ]);

  const faute = reponses.find((r) => r.error);
  if (faute) {
    const texte = 'Lecture impossible : ' + erreurLisible(faute.error);
    if ($('app').hidden) $('boot').textContent = texte;
    else alerte(texte);
    return false;
  }

  ['agences', 'axes', 'axe_agences', 'vehicules', 'agents', 'profiles', 'settings'].forEach((k, i) => {
    DATA[k] = reponses[i].data || [];
  });

  // Le référentiel des sens est arrivé après coup : tant que 0010 n'est pas
  // passée, la table manque. L'écran garde alors la liste d'hier au lieu de
  // refuser d'un coup les agences, le parc et les comptes.
  const sens = await sb.from('sens').select('id, nom, actif').order('nom');
  DATA.sens = sens.error ? [] : sens.data || [];

  APPARENCE = apparenceEnBase();
  appliquer(APPARENCE);
  return true;
}

/** Apparence telle qu'elle est en base ; vide = valeurs d'origine. */
function apparenceEnBase() {
  const lire = (cle, defaut) => {
    const ligne = DATA.settings.find((s) => s.key === cle);
    return ligne && ligne.value ? ligne.value : defaut;
  };
  return {
    accent: lire('theme_accent', ''),
    mode: lire('theme_mode', 'auto'),
    logo: lire('logo_data', ''),
  };
}

/* --------------------------------------------------------------- affichage */

function toast(t) {
  const el = $('toast');
  el.textContent = t;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 2600);
}

function alerte(t) {
  const el = $('msg');
  el.hidden = !t;
  el.textContent = t || '';
}

function rendre() {
  const spec = SPECS[SECTION];

  $('titre').textContent = spec.titre;
  $('aide').textContent = spec.aide;
  document.querySelectorAll('#tabs button').forEach((b) => {
    const on = b.dataset.sec === SECTION;
    b.classList.toggle('on', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });

  const blocs = [];
  if (spec.apparence) {
    $('zone').innerHTML = carteApparence();
    brancherApparence();
    return;
  }
  if (SECTION === 'comptes') blocs.push(carteNouveauCompte());
  if (spec.ajout !== false || EDITE) blocs.push(carteForm(spec));
  if (SECTION === 'comptes' && IDENT_ID) blocs.push(carteIdentifiant());
  if (SECTION === 'comptes' && MDP_ID) blocs.push(carteMdp());
  if (SECTION === 'axes' && ITIN_AXE != null) blocs.push(carteItin());
  blocs.push(carteTable(spec));
  if (SECTION === 'vehicules') blocs.push(carteImportParc());
  $('zone').innerHTML = blocs.join('');

  $('form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    enregistrer(spec);
  });
  $('form-compte')?.addEventListener('submit', (e) => {
    e.preventDefault();
    creerCompte();
  });
  $('form-ident')?.addEventListener('submit', (e) => {
    e.preventDefault();
    changerIdentifiant();
  });
  $('form-mdp')?.addEventListener('submit', (e) => {
    e.preventDefault();
    changerMdp();
  });
  $('annul')?.addEventListener('click', () => {
    EDITE = null;
    alerte(null);
    rendre();
  });
  $('form-import')?.addEventListener('submit', (e) => {
    e.preventDefault();
    importerParc();
  });
  $('imp-fichier')?.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    $('imp-txt').value = await f.text();
  });

  $('zone').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;

    if (d.edit) {
      EDITE = DATA[spec.table].find((r) => String(r[spec.cle]) === d.edit) || null;
      alerte(null);
      rendre();
    } else if (d.del) {
      supprimer(spec, d.del);
    } else if (d.ident) {
      IDENT_ID = d.ident;
      MDP_ID = null;
      EDITE = null;
      alerte(null);
      rendre();
    } else if (d.mdp) {
      MDP_ID = d.mdp;
      IDENT_ID = null;
      EDITE = null;
      alerte(null);
      rendre();
    } else if (d.suppr) {
      supprimerCompte(d.suppr);
    } else if (d.itin) {
      ITIN_AXE = Number(d.itin);
      ITIN = itineraire(ITIN_AXE);
      alerte(null);
      rendre();
    } else if (d.up) {
      deplacer(Number(d.up), -1);
    } else if (d.down) {
      deplacer(Number(d.down), 1);
    } else if (d.rm) {
      ITIN.splice(Number(d.rm), 1);
      rendre();
    } else if (d.act === 'itin-add') {
      const v = Number($('itin-add').value);
      if (v) {
        ITIN.push(v);
        rendre();
      }
    } else if (d.act === 'itin-save') {
      enregistrerItin();
    } else if (d.act === 'itin-close') {
      ITIN_AXE = null;
      ITIN = [];
      rendre();
    } else if (d.act === 'ident-close') {
      IDENT_ID = null;
      alerte(null);
      rendre();
    } else if (d.act === 'mdp-close') {
      MDP_ID = null;
      alerte(null);
      rendre();
    }
  };
}

function champsHtml(spec, ligne) {
  const v = Object.assign({}, spec.defaut || {}, ligne || {});
  const figes = ligne && spec.figer ? spec.figer(ligne) : [];

  return spec.champs
    .map((c) => {
      const id = 'f-' + c.n;
      const des = figes.includes(c.n) ? ' disabled' : '';
      const val = v[c.n];

      if (c.t === 'check') {
        return (
          '<label class="chk"><input type="checkbox" id="' +
          id +
          '"' +
          (val ? ' checked' : '') +
          des +
          '> ' +
          esc(c.l) +
          '</label>'
        );
      }

      if (c.t === 'select') {
        const options = c.options()
          .map(
            (o) =>
              '<option value="' +
              esc(o.v) +
              '"' +
              (String(o.v) === String(val == null ? '' : val) ? ' selected' : '') +
              '>' +
              esc(o.l) +
              '</option>'
          )
          .join('');
        return (
          '<label>' +
          esc(c.l) +
          '<select id="' +
          id +
          '"' +
          (c.req ? ' required' : '') +
          des +
          '>' +
          (c.vide ? '<option value="">—</option>' : '') +
          options +
          '</select></label>'
        );
      }

      return (
        '<label>' +
        esc(c.l) +
        (c.aide ? '<small>' + esc(c.aide) + '</small>' : '') +
        '<input id="' +
        id +
        '" type="' +
        (c.t === 'num' ? 'number' : 'text') +
        '" value="' +
        esc(val == null ? '' : val) +
        '"' +
        (c.req ? ' required' : '') +
        (c.max ? ' maxlength="' + c.max + '"' : '') +
        (c.min != null ? ' min="' + c.min + '"' : '') +
        (c.mono ? ' class="mono"' : '') +
        (c.list ? ' list="' + c.list + '"' : '') +
        des +
        '></label>'
      );
    })
    .join('');
}

function carteForm(spec) {
  const titres = EDITE ? 'Modifier ' + spec.singulier : 'Ajouter ' + spec.singulier;
  const datalist =
    SECTION === 'reglages'
      ? '<datalist id="tz-list">' + FUSEAUX.map((z) => '<option value="' + esc(z) + '">').join('') + '</datalist>'
      : '';

  return (
    '<form class="card formedit" id="form">' +
    '<h2>' +
    esc(titres) +
    '</h2>' +
    '<div class="grid2">' +
    champsHtml(spec, EDITE) +
    '</div>' +
    datalist +
    '<div class="actions">' +
    '<button class="btn" type="submit">' +
    (EDITE ? 'Enregistrer' : 'Ajouter') +
    '</button>' +
    (EDITE ? '<button class="btn ghost" type="button" id="annul">Annuler</button>' : '') +
    '</div>' +
    '</form>'
  );
}

function carteItin() {
  const axe = DATA.axes.find((a) => a.id === ITIN_AXE);
  const libres = DATA.agences.filter((a) => !ITIN.includes(a.id));

  const lignes = ITIN.map((id, i) => {
    const a = DATA.agences.find((x) => x.id === id);
    return (
      '<li><span class="sub">' +
      (i + 1) +
      '</span><b>' +
      esc(a ? etiquetteAgence(a) : 'Agence ' + id) +
      '</b><span class="rowact" style="margin-left:auto">' +
      '<button class="btn small ghost" type="button" data-up="' +
      i +
      '"' +
      (i === 0 ? ' disabled' : '') +
      ' aria-label="Monter">↑</button>' +
      '<button class="btn small ghost" type="button" data-down="' +
      i +
      '"' +
      (i === ITIN.length - 1 ? ' disabled' : '') +
      ' aria-label="Descendre">↓</button>' +
      '<button class="btn small danger" type="button" data-rm="' +
      i +
      '" aria-label="Retirer">✕</button>' +
      '</span></li>'
    );
  }).join('');

  return (
    '<div class="card formedit">' +
    '<h2>Itinéraire — ' +
    esc(axe ? axe.nom : '') +
    '</h2>' +
    '<p class="hint">Le premier arrêt est le terminus de départ, le dernier l\'arrivée. Il faut au moins deux agences.</p>' +
    (ITIN.length ? '<ol class="itin">' + lignes + '</ol>' : '<div class="empty">Aucune agence : ajoutez-en au moins deux.</div>') +
    '<div class="actions">' +
    '<select id="itin-add" aria-label="Agence à ajouter"' +
    (libres.length ? '' : ' disabled') +
    '>' +
    libres.map((a) => '<option value="' + a.id + '">' + esc(etiquetteAgence(a)) + '</option>').join('') +
    '</select>' +
    '<button class="btn small ghost" type="button" data-act="itin-add"' +
    (libres.length ? '' : ' disabled') +
    '>Ajouter</button>' +
    '<button class="btn" type="button" data-act="itin-save">Enregistrer l\'itinéraire</button>' +
    '<button class="btn ghost" type="button" data-act="itin-close">Fermer</button>' +
    '</div></div>'
  );
}

function carteTable(spec) {
  const lignes = DATA[spec.table] || [];
  if (!lignes.length) return '<div class="empty">Aucun enregistrement.</div>';

  const th =
    spec.colonnes.map((c) => '<th' + (c.n ? ' class="n"' : '') + '>' + esc(c.l) + '</th>').join('') + '<th></th>';

  const tr = lignes
    .map((r) => {
      const tds = spec.colonnes
        .map((c) => '<td' + (c.n ? ' class="n"' : '') + '>' + (c.f ? c.f(r) : esc(r[c.k] == null ? '—' : r[c.k])) + '</td>')
        .join('');

      const boutons = [];
      if (spec.itineraire) {
        boutons.push(
          '<button class="btn small ghost" type="button" data-itin="' + esc(r.id) + '">Itinéraire</button>'
        );
      }
      if (spec.gestionComptes) {
        boutons.push(
          '<button class="btn small ghost" type="button" data-ident="' + esc(r.id) + '">Identifiant</button>',
          '<button class="btn small ghost" type="button" data-mdp="' + esc(r.id) + '">Mot de passe</button>'
        );
      }
      boutons.push(
        '<button class="btn small ghost" type="button" data-edit="' + esc(r[spec.cle]) + '">Modifier</button>'
      );
      if (spec.gestionComptes) {
        if (r.id !== SESSION.id) {
          boutons.push(
            '<button class="btn small danger" type="button" data-suppr="' + esc(r.id) + '">Supprimer</button>'
          );
        }
      } else if (spec.supprimable) {
        boutons.push(
          '<button class="btn small danger" type="button" data-del="' + esc(r[spec.cle]) + '">Supprimer</button>'
        );
      }

      return '<tr>' + tds + '<td><span class="rowact">' + boutons.join('') + '</span></td></tr>';
    })
    .join('');

  return '<div class="card tbl formedit" style="padding:6px 8px"><table><thead><tr>' + th + '</tr></thead><tbody>' + tr + '</tbody></table></div>';
}

/* --------------------------------------------------------------- apparence */

// Le thème n'est pas une ligne de référentiel : il s'édite en aperçu réel —
// le bandeau de cette page change sous les yeux — et n'est écrit qu'à
// l'enregistrement, pour qu'un essai de couleur ne s'impose pas à tout le monde.

const LIBELLES_APPARENCE = {
  theme_accent: "Couleur d'accent de l'application (#RRGGBB). Vide = couleur d'origine.",
  theme_mode: "Mode d'affichage : auto (suit le système), light ou dark.",
  logo_data: "Logo importé depuis Administration (data:image/… encodé). Vide = logo d'origine.",
};

function accentCourant() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  return hexValide(v) ? v : '#C4560B';
}

function carteApparence() {
  const courant = hexValide(APPARENCE.accent) ? APPARENCE.accent : accentCourant();

  const modes = [
    ['auto', 'Système'],
    ['light', 'Clair'],
    ['dark', 'Sombre'],
  ];

  const seg = modes
    .map(
      ([v, l]) =>
        '<input type="radio" name="mode-apparence" id="mode-' +
        v +
        '" value="' +
        v +
        '"' +
        (APPARENCE.mode === v ? ' checked' : '') +
        '><label for="mode-' +
        v +
        '">' +
        esc(l) +
        '</label>'
    )
    .join('');

  const pastilles = ACCENTS.map(
    (c) =>
      '<button class="swatch" type="button" data-accent="' +
      c +
      '" style="background:' +
      c +
      '" aria-label="Accent ' +
      c +
      '"></button>'
  ).join('');

  return (
    '<div class="card formedit">' +
    '<h2>Logo</h2>' +
    '<div class="logo-line">' +
    '<img class="logo" id="apercu-logo" src="' +
    esc(APPARENCE.logo || 'assets/logo.jpg') +
    '" alt="Logo en vigueur">' +
    '<div class="logo-act">' +
    '<label class="filebtn">Importer une image<input type="file" id="logo-fichier" accept="image/png,image/jpeg,image/webp,image/svg+xml"></label>' +
    '<button class="btn small ghost" type="button" data-act="logo-reset"' +
    (APPARENCE.logo ? '' : ' disabled') +
    ">Rétablir le logo d'origine</button>" +
    '</div></div>' +
    '<p class="hint" id="logo-note">PNG, JPEG, WebP ou SVG. L\'image est réduite à 320 px de côté avant d\'être enregistrée.</p>' +

    '<h2 style="margin-top:8px">Affichage</h2>' +
    '<div class="seg seg3">' +
    seg +
    '</div>' +

    '<h2 style="margin-top:8px">Couleur d\'accent</h2>' +
    '<div class="accent-line">' +
    '<input type="color" id="accent-pick" value="' +
    courant +
    '" aria-label="Couleur d\'accent">' +
    '<input type="text" id="accent-hex" class="mono" value="' +
    courant +
    '" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Code hexadécimal">' +
    '<button class="btn small ghost" type="button" data-act="accent-reset"' +
    (APPARENCE.accent ? '' : ' disabled') +
    ">Couleur d'origine</button>" +
    '</div>' +
    '<div class="swatches">' +
    pastilles +
    '</div>' +

    '<div class="actions">' +
    '<button class="btn" type="button" data-act="apparence-save">Enregistrer l\'apparence</button>' +
    '</div>' +
    '<p class="hint">L\'aperçu est immédiat sur cet écran ; les autres appareils suivent au prochain chargement.</p>' +
    '</div>'
  );
}

function brancherApparence() {
  $('logo-fichier')?.addEventListener('change', async (e) => {
    const fichier = e.target.files && e.target.files[0];
    if (!fichier) return;

    const note = $('logo-note');
    note.textContent = 'Préparation de l\'image…';

    try {
      APPARENCE.logo = await reduireLogo(fichier);
      appliquer(APPARENCE);
      rendre();
      toast('Logo prêt : cliquez sur « Enregistrer l\'apparence ».');
    } catch (err) {
      note.textContent = String((err && err.message) || err);
    }
  });

  $('accent-pick')?.addEventListener('input', (e) => accentChoisi(e.target.value));

  $('accent-hex')?.addEventListener('input', (e) => {
    const v = e.target.value.trim();
    if (hexValide(v)) accentChoisi(v, false);
  });

  document.querySelectorAll('input[name="mode-apparence"]').forEach((r) =>
    r.addEventListener('change', () => {
      APPARENCE.mode = r.value;
      appliquer(APPARENCE);
    })
  );

  $('zone').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;

    if (b.dataset.accent) {
      accentChoisi(b.dataset.accent);
    } else if (b.dataset.act === 'logo-reset') {
      APPARENCE.logo = '';
      appliquer(APPARENCE);
      rendre();
    } else if (b.dataset.act === 'accent-reset') {
      APPARENCE.accent = '';
      appliquer(APPARENCE);
      rendre();
    } else if (b.dataset.act === 'apparence-save') {
      enregistrerApparence();
    }
  };
}

function accentChoisi(v, remplirChamps = true) {
  APPARENCE.accent = v;
  appliquer(APPARENCE);
  if (!remplirChamps) return;
  if ($('accent-pick')) $('accent-pick').value = v;
  if ($('accent-hex')) $('accent-hex').value = v;
}

async function enregistrerApparence() {
  if (APPARENCE.logo && !logoAcceptable(APPARENCE.logo)) {
    alerte('Logo refusé : image trop lourde. Importez une image plus petite.');
    return;
  }

  alerte(null);

  const { error } = await sb.from('settings').upsert(
    [
      { key: 'theme_accent', value: hexValide(APPARENCE.accent) ? APPARENCE.accent : '', label: LIBELLES_APPARENCE.theme_accent },
      { key: 'theme_mode', value: APPARENCE.mode, label: LIBELLES_APPARENCE.theme_mode },
      { key: 'logo_data', value: APPARENCE.logo || '', label: LIBELLES_APPARENCE.logo_data },
    ],
    { onConflict: 'key' }
  );

  if (error) {
    alerte(erreurLisible(error));
    return;
  }

  await charger();
  rendre();
  toast('Apparence enregistrée.');
}

/* ----------------------------------------------------------------- actions */

function lireChamps(spec) {
  const o = {};
  for (const c of spec.champs) {
    const el = $('f-' + c.n);
    if (!el) continue;
    if (c.t === 'check') o[c.n] = el.checked;
    else if (c.t === 'num') o[c.n] = el.value === '' ? null : Number(el.value);
    else if (c.t === 'select') o[c.n] = el.value === '' ? null : c.num ? Number(el.value) : el.value;
    else o[c.n] = el.value.trim() === '' ? null : el.value.trim();
  }
  return o;
}

async function enregistrer(spec) {
  const obj = lireChamps(spec);
  if (spec.normaliser) spec.normaliser(obj);

  const refus = spec.verifier ? spec.verifier(obj, EDITE) : null;
  if (refus) {
    alerte(refus);
    return;
  }

  alerte(null);

  const { error } = EDITE
    ? await sb.from(spec.table).update(obj).eq(spec.cle, EDITE[spec.cle])
    : await sb.from(spec.table).insert(obj);

  if (error) {
    alerte(erreurLisible(error));
    return;
  }

  EDITE = null;
  await charger();
  rendre();
  toast('Enregistré.');
}

async function supprimer(spec, id) {
  const ligne = DATA[spec.table].find((r) => String(r[spec.cle]) === String(id));
  const quoi = ligne ? ligne.nom || ligne.immat || ligne.code || '' : '';

  if (!confirm('Supprimer définitivement ' + (quoi ? '« ' + quoi + ' »' : 'cet enregistrement') + ' ?')) return;

  const { error } = await sb.from(spec.table).delete().eq(spec.cle, id);
  if (error) {
    alerte(erreurLisible(error));
    return;
  }

  if (EDITE && String(EDITE[spec.cle]) === String(id)) EDITE = null;
  await charger();
  rendre();
  toast('Supprimé.');
}

function deplacer(i, sens) {
  const j = i + sens;
  if (j < 0 || j >= ITIN.length) return;
  const t = ITIN[i];
  ITIN[i] = ITIN[j];
  ITIN[j] = t;
  rendre();
}

// (axe_id, position) forme la clé primaire : réordonner par des UPDATE
// violerait l'unicité en cours de route. La fonction SQL supprime puis
// réinsère dans la même transaction, et refait les contrôles côté serveur.
async function enregistrerItin() {
  if (ITIN.length < 2) {
    alerte('Une ligne doit desservir au moins deux agences.');
    return;
  }

  if (new Set(ITIN).size !== ITIN.length) {
    alerte('Une agence ne peut apparaître deux fois sur la même ligne.');
    return;
  }

  alerte(null);

  const { error } = await sb.rpc('set_axe_itineraire', { p_axe: ITIN_AXE, p_agences: ITIN });

  if (error) {
    alerte(erreurLisible(error));
    return;
  }

  ITIN_AXE = null;
  ITIN = [];
  await charger();
  rendre();
  toast('Itinéraire enregistré.');
}

/* ------------------------------------------------ comptes (Edge Function) */

// Créer un compte de connexion ou changer un mot de passe exige la clé
// `service_role`, qui contourne la RLS : elle ne peut pas vivre dans cette
// page. L'appel passe donc par l'Edge Function « admin-comptes », qui
// revérifie elle-même le JWT et lit le rôle en base — le corps de la requête
// ne fait jamais foi.

async function appelComptes(corps) {
  let reponse;
  try {
    reponse = await sb.functions.invoke(FONCTION_COMPTES, { body: corps });
  } catch (e) {
    return { erreur: 'Appel au serveur impossible : ' + String((e && e.message) || e) };
  }

  const { data, error } = reponse;

  if (error) {
    let texte = error.message || 'appel refusé';
    const statut = error.context && error.context.status;
    try {
      const j = await error.context.json();
      if (j && j.error) texte = j.error;
    } catch {
      // corps non JSON : la passerelle a répondu avant la fonction
    }
    if (statut === 404 || /failed to send|not found/i.test(texte)) {
      texte =
        'La fonction « ' +
        FONCTION_COMPTES +
        " » n'est pas déployée sur ce projet. " +
        'Voir README, étape 2 bis : supabase functions deploy ' +
        FONCTION_COMPTES +
        '.';
    }
    return { erreur: texte };
  }

  if (data && data.error) return { erreur: String(data.error) };
  return { ok: true };
}

function carteNouveauCompte() {
  return (
    '<form class="card formedit" id="form-compte">' +
    '<h2>Créer un compte</h2>' +
    "<p class=\"hint\">Le mot de passe est transmis à Supabase et n'est écrit nulle part : communiquez-le à la personne, qui pourra le changer ensuite.</p>" +
    '<div class="grid2">' +
    '<label>Nom<input id="nc-nom" type="text" autocomplete="off" required></label>' +
    '<label>Identifiant<small>ce que la personne tape pour se connecter, sans @</small><input id="nc-ident" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" required></label>' +
    '<label>Mot de passe<small>' +
    MOT_DE_PASSE_MIN +
    ' caractères minimum</small><input id="nc-mdp" type="password" minlength="' +
    MOT_DE_PASSE_MIN +
    '" autocomplete="new-password" required></label>' +
    '<label>Rôle<select id="nc-role">' +
    optionsHtml(ROLES_OPT()) +
    '</select></label>' +
    '<label>Agence<select id="nc-agence"><option value="">—</option>' +
    optionsHtml(AGENCES_OPT()) +
    '</select></label>' +
    '</div>' +
    '<div class="actions"><button class="btn" type="submit">Créer le compte</button></div>' +
    '</form>'
  );
}

function carteMdp() {
  const p = DATA.profiles.find((r) => String(r.id) === String(MDP_ID));
  return (
    '<form class="card formedit" id="form-mdp">' +
    '<h2>Mot de passe — ' +
    esc(p ? p.nom : '') +
    '</h2>' +
    "<p class=\"hint\">Remplace le mot de passe actuel. La personne n'a pas besoin de se déconnecter.</p>" +
    '<label>Nouveau mot de passe<small>' +
    MOT_DE_PASSE_MIN +
    ' caractères minimum</small><input id="mdp-valeur" type="password" minlength="' +
    MOT_DE_PASSE_MIN +
    '" autocomplete="new-password" required></label>' +
    '<div class="actions"><button class="btn" type="submit">Changer le mot de passe</button>' +
    '<button class="btn ghost" type="button" data-act="mdp-close">Annuler</button></div>' +
    '</form>'
  );
}

function carteIdentifiant() {
  const p = DATA.profiles.find((r) => String(r.id) === String(IDENT_ID));
  return (
    '<form class="card formedit" id="form-ident">' +
    '<h2>Identifiant — ' +
    esc(p ? p.nom : '') +
    '</h2>' +
    "<p class=\"hint\">C'est ce que la personne tape pour se connecter. Le changer ne touche pas à son mot de passe ; l'adresse technique qui porte le compte suit automatiquement.</p>" +
    '<label>Identifiant<small>3 à 32 caractères : minuscules, chiffres, point, tiret ou souligné</small>' +
    '<input id="ident-valeur" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" value="' +
    esc(p ? p.username || depuisEmail(p.email) : '') +
    '" required></label>' +
    '<div class="actions"><button class="btn" type="submit">Enregistrer l\'identifiant</button>' +
    '<button class="btn ghost" type="button" data-act="ident-close">Annuler</button></div>' +
    '</form>'
  );
}

async function creerCompte() {
  const corps = {
    action: 'creer',
    nom: $('nc-nom').value.trim(),
    identifiant: $('nc-ident').value.trim().toLowerCase(),
    mot_de_passe: $('nc-mdp').value,
    role: $('nc-role').value,
    agence_id: $('nc-agence').value || null,
  };

  if (!corps.nom) return alerte('Indiquez le nom de la personne.');
  if (!identifiantValide(corps.identifiant)) {
    return alerte('Identifiant : 3 à 32 caractères, minuscules, chiffres, point, tiret ou souligné — sans @.');
  }
  if (corps.mot_de_passe.length < MOT_DE_PASSE_MIN) {
    return alerte('Mot de passe : ' + MOT_DE_PASSE_MIN + ' caractères minimum.');
  }
  if (corps.role === 'AGENCE' && !corps.agence_id) {
    return alerte('Un compte agence doit être rattaché à une agence.');
  }

  alerte(null);
  const r = await appelComptes(corps);
  if (r.erreur) return alerte(r.erreur);

  await charger();
  rendre();
  toast('Compte créé.');
}

async function changerMdp() {
  const v = $('mdp-valeur').value;
  if (v.length < MOT_DE_PASSE_MIN) {
    return alerte('Mot de passe : ' + MOT_DE_PASSE_MIN + ' caractères minimum.');
  }

  alerte(null);
  const r = await appelComptes({ action: 'motdepasse', id: MDP_ID, mot_de_passe: v });
  if (r.erreur) return alerte(r.erreur);

  MDP_ID = null;
  rendre();
  toast('Mot de passe changé.');
}

async function changerIdentifiant() {
  const v = $('ident-valeur').value.trim().toLowerCase();
  if (!identifiantValide(v)) {
    return alerte('Identifiant : 3 à 32 caractères, minuscules, chiffres, point, tiret ou souligné — sans @.');
  }

  alerte(null);
  const r = await appelComptes({ action: 'identifiant', id: IDENT_ID, identifiant: v });
  if (r.erreur) return alerte(r.erreur);

  IDENT_ID = null;
  await charger();
  rendre();
  toast('Identifiant mis à jour.');
}

async function supprimerCompte(id) {
  const p = DATA.profiles.find((r) => String(r.id) === String(id));
  const nom = p ? p.nom : 'cette personne';

  const question =
    'Supprimer définitivement le compte de ' +
    nom +
    " ?\n\nLe profil et l'accès disparaissent. Si la personne a déjà déclaré des départs, " +
    'la suppression est refusée : désactivez le compte à la place, pour garder l\'historique.';

  if (!confirm(question)) return;

  alerte(null);
  const r = await appelComptes({ action: 'supprimer', id });
  if (r.erreur) return alerte(r.erreur);

  if (String(MDP_ID) === String(id)) MDP_ID = null;
  if (String(IDENT_ID) === String(id)) IDENT_ID = null;
  await charger();
  rendre();
  toast('Compte supprimé.');
}

/* ------------------------------------------------------------ parc (import) */

function carteImportParc() {
  return (
    '<form class="card formedit" id="form-import">' +
    '<h2>Importer le parc</h2>' +
    '<p class="hint">Une ligne par véhicule, dans cet ordre : <b>Immatriculation</b>, <b>Marque</b>, ' +
    '<b>Type</b>, <b>Places assises</b>, <b>En service</b> (facultatif, oui par défaut). ' +
    'Collez directement depuis Excel, ou chargez un fichier CSV — les deux passent, ' +
    'avec tabulations, points-virgules ou virgules.</p>' +
    '<label class="filebtn">Charger un fichier CSV<input type="file" id="imp-fichier" accept=".csv,.txt,text/csv,text/plain"></label>' +
    '<label for="imp-txt">Lignes à importer<textarea id="imp-txt" rows="6" spellcheck="false" ' +
    'placeholder="LT0171HE ; Higer ; Bus 70 places ; 70 ; oui"></textarea></label>' +
    '<div class="msgs" id="imp-msg"></div>' +
    '<div class="actions"><button class="btn" type="submit">Importer</button></div>' +
    '</form>'
  );
}

async function importerParc() {
  const r = parcDepuisCsv($('imp-txt').value);
  const msg = $('imp-msg');
  const refus = r.refus.map((x) => 'ligne ' + x.n + ' : ' + x.motif);

  if (!r.lignes.length) {
    msg.innerHTML =
      '<p class="e">Rien à importer' + (refus.length ? ' — ' + refus.length + ' ligne(s) refusée(s).' : '.') + '</p>' +
      refus.map((t) => '<p class="w">' + esc(t) + '</p>').join('');
    return;
  }

  // L'immatriculation est déjà unique en base : réimporter un parc met à jour
  // la ligne existante au lieu d'en créer une seconde.
  const connus = new Set(DATA.vehicules.map((v) => v.immat));
  const neufs = r.lignes.filter((l) => !connus.has(l.immat)).length;

  msg.innerHTML = '<p class="w">Envoi de ' + r.lignes.length + ' véhicule(s)…</p>';

  for (let i = 0; i < r.lignes.length; i += 200) {
    const { error } = await sb.from('vehicules').upsert(r.lignes.slice(i, i + 200), { onConflict: 'immat' });
    if (error) {
      msg.innerHTML = '<p class="e">Import interrompu : ' + esc(erreurLisible(error)) + '</p>';
      return;
    }
  }

  $('imp-txt').value = '';
  await charger();
  rendre();
  toast(r.lignes.length + ' importé(s) · ' + neufs + ' nouveau(x), ' + (r.lignes.length - neufs) + ' mis à jour');
  if (refus.length) {
    $('imp-msg').innerHTML =
      '<p class="w">' + refus.length + ' ligne(s) refusée(s) :</p>' +
      refus.map((t) => '<p class="w">' + esc(t) + '</p>').join('');
  }
}

