import { sb, requireSession, erreurLisible } from './supa.js';
import {
  waText,
  waAnnul,
  libelleAxe,
  pct,
  cls,
  hhmm,
  PROGRAMMES,
  PROGRAMMES_COURTS,
} from './wa.js';
import { monterNav } from './nav.js';

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* stockage refusé : sans conséquence */
    }
  },
};

let AGENCES = [];
let AXES = [];
let VEH = {};
let AGENTS = { CHAUFFEUR: [], CONVOYEUR: [], CHEF_PISTE: [] };
let MINE = [];
let SESSION = null;
let AGENCE_ID = null; // agence pour laquelle on déclare
let TODAY = null;
let EDIT = null;
let busy = false;
let progManuel = false;

function toast(t) {
  const el = $('toast');
  el.textContent = t;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 2600);
}

function opts(sel, list, ph) {
  sel.innerHTML =
    (ph ? '<option value="">' + esc(ph) + '</option>' : '') +
    list.map((o) => '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>').join('');
}

function nomAgence(id) {
  const a = AGENCES.find((x) => x.id === id);
  return a ? a.nom : '';
}

const etiquetteAgence = (a) => a.code + ' · ' + a.nom;

function fmtLimite(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
init();

async function init() {
  let ctx;
  try {
    // AGENCE saisit pour elle-même ; DIRECTION et REGULATION saisissent pour
    // une agence qu'elles choisissent (policy dep_insert, 0007).
    ctx = await requireSession({
      roles: ['AGENCE', 'REGULATION', 'DIRECTION'],
      requireAgence: false,
    });
  } catch (e) {
    $('boot').innerHTML = 'Connexion au serveur impossible : ' + esc(erreurLisible(e));
    return;
  }
  if (!ctx) return;

  SESSION = {
    userId: ctx.session.user.id,
    nom: ctx.profile.nom,
    role: ctx.profile.role,
    agenceId: ctx.profile.agence_id,
  };

  if (SESSION.role === 'AGENCE' && !SESSION.agenceId) {
    location.replace('index.html?erreur=agence');
    return;
  }

  AGENCE_ID = SESSION.agenceId;
  monterNav(SESSION.role);

  try {
    const { data: t, error: eT } = await sb.rpc('today_service');
    if (eT) throw eT;
    TODAY = t;

    await loadConfig();
    await loadMine();
    start();
  } catch (e) {
    $('boot').innerHTML =
      'Le formulaire n\'a pas pu se charger : ' + esc(erreurLisible(e)) +
      '<br>Vérifiez la connexion internet et rechargez la page.';
  }
}

async function loadConfig() {
  const [ag, ax, aa, ve, agents, tz] = await Promise.all([
    sb.from('agences').select('id, code, nom').eq('actif', true).order('nom'),
    sb.from('axes').select('id, nom, sens, type').eq('actif', true).order('nom'),
    sb.from('axe_agences').select('axe_id, agence_id, position').order('position'),
    sb.from('vehicules').select('id, immat, marque, type, places').eq('actif', true).order('immat'),
    sb.from('agents').select('nom, fonction').eq('actif', true).order('nom'),
    sb.from('settings').select('value').eq('key', 'timezone').maybeSingle(),
  ]);

  for (const r of [ag, ax, aa, ve, agents]) {
    if (r.error) throw r.error;
  }

  AGENCES = ag.data;

  AXES = ax.data
    .map((a) => ({
      ...a,
      agences: aa.data
        .filter((l) => l.axe_id === a.id)
        .sort((x, y) => x.position - y.position)
        .map((l) => AGENCES.find((g) => g.id === l.agence_id))
        .filter(Boolean),
    }))
    .filter((a) => a.agences.length >= 2);

  VEH = {};
  for (const v of ve.data) {
    VEH[v.immat] = v;
  }

  AGENTS = { CHAUFFEUR: [], CONVOYEUR: [], CHEF_PISTE: [] };
  for (const a of agents.data) {
    if (AGENTS[a.fonction]) AGENTS[a.fonction].push(a.nom);
  }

  if (tz.data && tz.data.value === 'UTC') $('tz-warning').hidden = false;
}

function start() {
  $('boot').hidden = true;
  $('app').hidden = false;
  $('logout').hidden = false;

  choisirAgence();

  fillCrew();
  $('dl-immat').innerHTML = Object.keys(VEH)
    .sort()
    .map((k) => '<option value="' + esc(k) + '">' + VEH[k].places + ' places · ' + esc(VEH[k].type) + '</option>')
    .join('');

  buildAxes();
}

// Une agence saisit pour elle-même ; la direction et la régulation choisissent
// l'agence, et ce choix est mémorisé sur le poste.
function choisirAgence() {
  if (SESSION.role !== 'AGENCE') {
    const memo = Number(store.get('agence-travail', 0));
    AGENCE_ID = AGENCES.some((a) => a.id === memo) ? memo : AGENCES[0] ? AGENCES[0].id : null;
    opts($('agence'), AGENCES.map((a) => ({ value: String(a.id), label: etiquetteAgence(a) })));
    $('agence').value = String(AGENCE_ID);
    $('pick').hidden = false;
  }
  majWho();
}

function majWho() {
  SESSION.agenceNom = nomAgence(AGENCE_ID);
  $('who').textContent =
    SESSION.role === 'AGENCE'
      ? 'Agence : ' + SESSION.agenceNom
      : (SESSION.role === 'DIRECTION' ? 'Direction' : 'Régulation') +
        ' · déclaration pour ' + SESSION.agenceNom;
}

function buildAxes() {
  const list = AXES.filter((a) => {
    const i = a.agences.findIndex((x) => x.id === AGENCE_ID);
    return i >= 0 && i < a.agences.length - 1;
  }).map((a) => ({ value: String(a.id), label: a.nom }));

  opts($('axe'), list, list.length ? 'Choisir l\'axe…' : 'Aucun axe au départ de cette agence');
  $('axe').disabled = !list.length;
  if (list.length === 1) $('axe').value = list[0].value;

  onAxe();
  proposeProg();
}

function fillCrew() {
  const c = store.get('crew', { CHAUFFEUR: [], CONVOYEUR: [], CHEF_PISTE: [] });
  const paires = [
    ['dl-ch', 'CHAUFFEUR'],
    ['dl-cv', 'CONVOYEUR'],
    ['dl-cp', 'CHEF_PISTE'],
  ];
  for (const [id, role] of paires) {
    const noms = [...(c[role] || []), ...AGENTS[role]];
    const vus = new Set();
    $(id).innerHTML = noms
      .filter((n) => (vus.has(n) ? false : vus.add(n)))
      .map((n) => '<option value="' + esc(n) + '">')
      .join('');
  }
}

$('logout').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.replace('index.html');
});

$('agence').addEventListener('change', () => {
  AGENCE_ID = Number($('agence').value);
  store.set('agence-travail', AGENCE_ID);
  majWho();

  if (EDIT) stopEdit();
  $('f').reset();
  $('msgs').innerHTML = '';
  progManuel = false;
  $('done').hidden = true;
  $('f').hidden = false;

  buildAxes();
  loadMine();
});

// ---------------------------------------------------------------------------
// Itinéraire
// ---------------------------------------------------------------------------
function curAxe() {
  const id = Number($('axe').value);
  return AXES.find((a) => a.id === id) || null;
}

function idxAgence(a, id) {
  return a.agences.findIndex((x) => x.id === id);
}

function onAxe() {
  const a = curAxe();
  if (!a) {
    [$('provenance'), $('destination')].forEach((s) => {
      s.innerHTML = '';
      s.disabled = true;
    });
    renderRoute();
    return;
  }

  const i = idxAgence(a, AGENCE_ID);

  opts($('provenance'), a.agences.slice(0, i + 1).map((g) => ({ value: String(g.id), label: g.nom })));
  $('provenance').value = String(a.agences[0].id);

  opts($('destination'), a.agences.slice(i + 1).map((g) => ({ value: String(g.id), label: g.nom })));
  $('destination').value = String(a.agences[a.agences.length - 1].id);

  $('provenance').disabled = false;
  $('destination').disabled = false;
  onProv();
}

function onProv() {
  const same = Number($('provenance').value) === AGENCE_ID;
  $('effarr').disabled = same;
  if (same) $('effarr').value = 0;
  $('harr').disabled = same;
  if (same) $('harr').value = '';
  renderRoute();
}

function mids() {
  const a = curAxe();
  if (!a) return [];
  const i = idxAgence(a, AGENCE_ID);
  const j = idxAgence(a, Number($('destination').value));
  return j > i ? a.agences.slice(i + 1, j) : [];
}

function renderRoute() {
  const a = curAxe();
  const okA = a && $('provenance').value && $('destination').value;
  $('axepub').hidden = !okA;

  if (!a || !$('destination').value) {
    $('route').innerHTML = '<span class="hint">Le trajet s\'affichera ici.</span>';
    renderPassants();
    return;
  }

  $('axepub-v').textContent = libelleAxe(nomAgence(Number($('provenance').value)), a.nom, nomAgence(Number($('destination').value)));

  const p = idxAgence(a, Number($('provenance').value));
  const i = idxAgence(a, AGENCE_ID);
  const j = idxAgence(a, Number($('destination').value));

  $('route').innerHTML = a.agences
    .slice(p, j + 1)
    .map((g, k) => {
      const idx = p + k;
      const c = idx === i ? 'here' : idx === j ? 'end' : idx > i ? 'mid' : '';
      return '<span class="stop ' + c + '">' + esc(g.nom) + '</span>';
    })
    .join('<span class="arrow" aria-hidden="true">→</span>');

  renderPassants();
}

function renderPassants() {
  const m = mids();
  const box = $('passants');
  const old = {};
  box.querySelectorAll('input').forEach((x) => {
    old[x.dataset.ag] = x.value;
  });

  if (!$('destination').value) {
    box.innerHTML = '<span class="hint">Choisissez la destination pour voir les agences intermédiaires.</span>';
    return;
  }
  if (!m.length) {
    box.innerHTML = '<span class="hint">Trajet direct : aucune agence intermédiaire.</span>';
    check();
    return;
  }

  box.innerHTML = m
    .map(
      (g, k) =>
        '<label for="pass-' + k + '">Passants ' + esc(g.nom) +
        '<input id="pass-' + k + '" data-ag="' + esc(g.id) + '" type="number" min="0" inputmode="numeric" value="' +
        esc(old[g.id] == null ? '' : old[g.id]) + '"></label>'
    )
    .join('');

  box.querySelectorAll('input').forEach((x) => x.addEventListener('input', check));
  check();
}

// ---------------------------------------------------------------------------
// Calculs
// ---------------------------------------------------------------------------
function vehicle() {
  const k = $('immat').value.trim().toUpperCase().replace(/[\s-]/g, '');
  return k ? { k, v: VEH[k] || null } : null;
}

function calc() {
  const ea = +($('effarr').value || 0);
  const ec = +($('effcomp').value || 0);
  const tot = ea + ec;

  $('efftot').value = $('effcomp').value === '' && !ea ? '' : tot;

  const ve = vehicle();
  const cap = ve && ve.v ? ve.v.places : null;
  const dispo = cap == null ? null : Math.max(0, cap - ea);

  $('dispo').value = dispo == null ? '' : dispo;

  const t = dispo && $('effcomp').value !== '' ? ec / dispo : null;

  $('taux').textContent = pct(t);
  const bar = $('tauxbar');
  bar.style.width = t == null ? '0' : Math.min(100, t * 100) + '%';
  bar.style.background = t == null ? 'var(--line)' : 'var(--' + cls(t) + ')';

  $('vinfo').innerHTML = !ve
    ? 'Saisissez l\'immatriculation : la capacité est retrouvée dans le parc.'
    : ve.v
      ? '<span class="plate">' + esc(ve.k) + '</span> ' + esc(ve.v.marque) + ' ' + esc(ve.v.type) +
        ' · <b>' + ve.v.places + ' places</b>'
      : 'Immatriculation inconnue dans le parc : vérifiez la saisie.';

  $('tauxinfo').textContent =
    dispo == null
      ? 'Places complétées ÷ places disponibles à l\'arrivée du véhicule.'
      : dispo === 0
        ? 'Le véhicule est arrivé plein : aucune place disponible.'
        : ec + ' places complétées sur ' + dispo + ' disponibles (' + cap + ' places − ' + ea + ' à l\'arrivée).';

  return { ea, ec, tot, cap, dispo };
}

function check() {
  const c = calc();
  const w = [];

  if (c.cap && c.ea > c.cap) {
    w.push('L\'effectif à l\'arrivée (' + c.ea + ') dépasse la capacité du véhicule (' + c.cap + ' places).');
  } else if (c.dispo != null && c.ec > c.dispo) {
    w.push('L\'effectif complété (' + c.ec + ') dépasse les places disponibles (' + c.dispo + ').');
  }

  const pg = prog();
  const autres = actifs();
  const fin = autres.filter((x) => x.programme === 'FIN' || x.programme === 'DEBUT_FIN')[0];

  if (fin) {
    w.push('Le programme du jour a déjà été clôturé (fin de programme à ' + hhmm(fin.h_depart) + '). Ce départ sera signalé dans le rapport.');
  }
  if (autres.length && (pg === 'DEBUT' || pg === 'DEBUT_FIN')) {
    w.push('Un départ a déjà été déclaré aujourd\'hui : vérifiez qu\'il s\'agit bien du début de programme.');
  }

  let prev = c.tot;
  $('passants').querySelectorAll('input').forEach((x) => {
    if (x.value === '') return;
    const v = +x.value;
    if (v > prev) {
      w.push('Passants ' + nomAgence(Number(x.dataset.ag)) + ' (' + v + ') supérieur à l\'effectif précédent (' + prev + ') : les passants ne peuvent que diminuer.');
    }
    prev = v;
  });

  const ha = $('harr').value;
  const hd = $('hdep').value;
  if (ha && hd && hd < ha) w.push('L\'heure de départ est avant l\'heure d\'arrivée.');

  $('msgs').innerHTML = w.map((t) => '<p class="w">' + esc(t) + '</p>').join('');
  return c;
}

['effarr', 'effcomp', 'immat', 'harr', 'hdep'].forEach((id) => $(id).addEventListener('input', check));
$('axe').addEventListener('change', onAxe);
$('provenance').addEventListener('change', onProv);
$('destination').addEventListener('change', renderRoute);

// ---------------------------------------------------------------------------
// Programme
// ---------------------------------------------------------------------------
function prog() {
  const x = document.querySelector('input[name="prog"]:checked');
  return x ? x.value : '';
}

function setProg(v) {
  document.querySelectorAll('input[name="prog"]').forEach((x) => {
    x.checked = x.value === v;
  });
}

function actifs() {
  return MINE.filter((x) => x.statut !== 'ANNULE' && (!EDIT || x.id !== EDIT.id));
}

function proposeProg() {
  if (!progManuel && !EDIT) setProg(actifs().length ? 'SUITE' : 'DEBUT');
  check();
}

document.querySelectorAll('input[name="prog"]').forEach((x) => {
  x.addEventListener('change', () => {
    progManuel = true;
    check();
  });
});

// ---------------------------------------------------------------------------
// Collecte et enregistrement
// ---------------------------------------------------------------------------
function collect() {
  const c = check();
  const ve = vehicle();
  const missing = [];

  if (!prog()) missing.push('le programme (début, suite ou fin)');

  const need = {
    axe: 'l\'axe',
    provenance: 'la provenance',
    destination: 'la destination',
    immat: 'l\'immatriculation',
    bordereau: 'le n° de bordereau',
    hdep: 'l\'heure de départ',
    effcomp: 'l\'effectif complété',
    chauffeur: 'le chauffeur',
    convoyeur: 'le convoyeur',
    chefpiste: 'le chef de piste',
  };

  Object.keys(need).forEach((id) => {
    if (!String($(id).value).trim()) missing.push(need[id]);
  });

  if (!$('harr').disabled && !$('harr').value) missing.push('l\'heure d\'arrivée');
  if (!$('effarr').disabled && $('effarr').value === '') missing.push('l\'effectif à l\'arrivée');

  if (ve && !ve.v) missing.push('une immatriculation présente dans le parc');

  if (missing.length) {
    $('msgs').insertAdjacentHTML(
      'afterbegin',
      '<p class="e">À compléter : ' + esc(missing.join(', ')) + '.</p>'
    );
    return null;
  }

  const a = curAxe();
  const passants = [];
  $('passants').querySelectorAll('input').forEach((x) => {
    if (x.value === '') return;
    passants.push({ agenceId: Number(x.dataset.ag), n: +x.value });
  });

  return {
    programme: prog(),
    axeId: a.id,
    axe: a.nom,
    provenanceId: Number($('provenance').value),
    provenance: nomAgence(Number($('provenance').value)),
    destinationId: Number($('destination').value),
    destination: nomAgence(Number($('destination').value)),
    vehiculeId: ve.v.id,
    immat: ve.k,
    bordereau: $('bordereau').value.trim(),
    hArr: $('harr').value,
    hDep: $('hdep').value,
    effArr: $('effarr').disabled ? 0 : +$('effarr').value,
    effComp: +$('effcomp').value,
    passants,
    chauffeur: $('chauffeur').value.trim(),
    convoyeur: $('convoyeur').value.trim(),
    chefPiste: $('chefpiste').value.trim(),
  };
}

async function enregistrer(d) {
  const payload = {
    agence_id: AGENCE_ID,
    axe_id: d.axeId,
    programme: d.programme,
    provenance_id: d.provenanceId,
    destination_id: d.destinationId,
    vehicule_id: d.vehiculeId,
    bordereau: d.bordereau,
    h_arrivee: d.hArr || null,
    h_depart: d.hDep,
    eff_arrivee: d.effArr,
    eff_complete: d.effComp,
  };

  let id;

  if (EDIT) {
    const { error } = await sb.from('departures').update(payload).eq('id', EDIT.id);
    if (error) throw error;
    id = EDIT.id;
  } else {
    const { data, error } = await sb
      .from('departures')
      .insert({ ...payload, date_service: TODAY })
      .select('id')
      .single();
    if (error) throw error;
    id = data.id;
  }

  const { error: eDel } = await sb.from('departure_passagers').delete().eq('departure_id', id);
  if (eDel) throw eDel;

  if (d.passants.length) {
    const { error } = await sb.from('departure_passagers').insert(
      d.passants.map((p) => ({ departure_id: id, agence_id: p.agenceId, n: p.n }))
    );
    if (error) throw error;
  }

  const crew = [
    { departure_id: id, role: 'CHAUFFEUR', nom: d.chauffeur },
    { departure_id: id, role: 'CONVOYEUR', nom: d.convoyeur },
    { departure_id: id, role: 'CHEF_PISTE', nom: d.chefPiste },
  ];
  const { error: eCrew } = await sb.from('departure_crew').upsert(crew, { onConflict: 'departure_id,role' });
  if (eCrew) throw eCrew;

  const { data: row, error: eRow } = await sb.from('v_departures').select('*').eq('id', id).single();
  if (eRow) throw eRow;

  return row;
}

function remember(d) {
  const c = store.get('crew', { CHAUFFEUR: [], CONVOYEUR: [], CHEF_PISTE: [] });
  const paires = [
    ['CHAUFFEUR', d.chauffeur],
    ['CONVOYEUR', d.convoyeur],
    ['CHEF_PISTE', d.chefPiste],
  ];
  for (const [role, nom] of paires) {
    c[role] = [nom].concat((c[role] || []).filter((x) => x !== nom)).slice(0, 40);
  }
  store.set('crew', c);
  fillCrew();
}

$('f').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (busy) return;

  const d = collect();
  if (!d) return;

  busy = true;
  $('submit').disabled = true;
  $('submit').textContent = 'Envoi…';

  const corr = Boolean(EDIT);

  try {
    const row = await enregistrer(d);
    busy = false;
    $('submit').disabled = false;

    remember(d);

    const crew = row.crew || {};
    const d2 = {
      agence: row.agence,
      axe: row.axe,
      provenance: row.provenance,
      destination: row.destination,
      bordereau: row.bordereau,
      hDep: hhmm(row.h_depart),
      effArr: row.eff_arrivee,
      effComp: row.eff_complete,
      chauffeur: crew.CHAUFFEUR || d.chauffeur,
      convoyeur: crew.CONVOYEUR || d.convoyeur,
      chefPiste: crew.CHEF_PISTE || d.chefPiste,
    };
    const r = {
      programme: row.programme_label,
      immat: row.immat,
      places: row.places,
      dispo: row.dispo,
      total: row.total,
      taux: row.taux_agence,
      hArr: hhmm(row.h_arrivee),
      passants: row.passants || [],
    };

    const fin = MINE.filter(
      (x) => x.statut !== 'ANNULE' && (!EDIT || x.id !== EDIT.id) && (x.programme === 'FIN' || x.programme === 'DEBUT_FIN')
    )[0];
    const apresFin = Boolean(fin) && row.h_depart > fin.h_depart;

    const t = waText(d2, r, corr);

    $('done-title').textContent = corr ? 'Modification enregistrée' : 'Départ enregistré';
    if (corr) stopEdit();
    else $('submit').textContent = 'Envoyer le départ';

    $('donemsg').innerHTML = apresFin
      ? '<p class="w">Départ enregistré après la fin de programme : il sera signalé dans le rapport.</p>'
      : '';
    $('wa').textContent = t;
    $('wa-link').href = 'https://wa.me/?text=' + encodeURIComponent(t);

    $('f').hidden = true;
    $('done').hidden = false;
    window.scrollTo(0, 0);
    loadMine();
  } catch (e) {
    busy = false;
    $('submit').disabled = false;
    $('submit').textContent = EDIT ? 'Enregistrer la modification' : 'Envoyer le départ';
    $('msgs').insertAdjacentHTML(
      'afterbegin',
      '<p class="e">Non enregistré : ' + esc(erreurLisible(e)) + '</p>'
    );
  }
});

$('copy').addEventListener('click', () => {
  const fb = () => {
    const r = document.createRange();
    r.selectNodeContents($('wa'));
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
    toast('Texte sélectionné : copiez-le');
  };
  try {
    navigator.clipboard.writeText($('wa').textContent).then(() => toast('Message copié'), fb);
  } catch {
    fb();
  }
});

function resetForm() {
  const ax = $('axe').value;
  $('f').reset();
  $('axe').value = ax;
  progManuel = false;
  onAxe();
  $('msgs').innerHTML = '';
  proposeProg();
}

$('again').addEventListener('click', () => {
  resetForm();
  $('done').hidden = true;
  $('f').hidden = false;
});

$('reset').addEventListener('click', () => {
  if (EDIT) stopEdit();
  resetForm();
});

// ---------------------------------------------------------------------------
// Modification / annulation
// ---------------------------------------------------------------------------
function stopEdit() {
  EDIT = null;
  $('editbar').hidden = true;
  $('ftitle').textContent = 'Déclarer un départ';
  $('submit').textContent = 'Envoyer le départ';
}

$('edit-cancel').addEventListener('click', () => {
  stopEdit();
  resetForm();
  toast('Modification abandonnée');
});

function startEdit(x) {
  EDIT = x;
  $('done').hidden = true;
  $('f').hidden = false;
  $('msgs').innerHTML = '';

  progManuel = true;
  setProg(x.programme);

  $('axe').value = String(x.axe_id);
  onAxe();
  $('provenance').value = String(x.provenance_id);
  $('destination').value = String(x.destination_id);
  onProv();

  $('immat').value = x.immat;
  $('bordereau').value = x.bordereau;
  $('harr').value = hhmm(x.h_arrivee);
  $('hdep').value = hhmm(x.h_depart);
  if (!$('effarr').disabled) $('effarr').value = x.eff_arrivee;
  $('effcomp').value = x.eff_complete;

  const pv = {};
  for (const p of x.passants || []) pv[p.agence] = p.n;
  $('passants').querySelectorAll('input').forEach((i) => {
    const nom = nomAgence(Number(i.dataset.ag));
    i.value = pv[nom] == null ? '' : pv[nom];
  });

  const crew = x.crew || {};
  $('chauffeur').value = crew.CHAUFFEUR || '';
  $('convoyeur').value = crew.CONVOYEUR || '';
  $('chefpiste').value = crew.CHEF_PISTE || '';

  $('ftitle').textContent = 'Modifier un départ';
  $('submit').textContent = 'Enregistrer la modification';
  $('edit-what').textContent =
    'Modification du départ ' + x.immat + ' · bordereau ' + x.bordereau + ' · ' + hhmm(x.h_depart);
  $('edit-until').textContent =
    'Modifiable jusqu\'à ' + fmtLimite(x.limite) + '. Le groupe recevra un message de correction.';
  $('editbar').hidden = false;

  check();
  window.scrollTo(0, 0);
}

$('mine').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;

  const box = b.closest('.rowact');
  const id = Number(box.dataset.id);
  const x = MINE.find((m) => m.id === id);
  if (!x) return;

  const act = b.dataset.act;

  if (act === 'edit') {
    startEdit(x);
    return;
  }

  if (act === 'ask') {
    box.innerHTML =
      '<button class="btn small danger" type="button" data-act="yes">Confirmer l\'annulation</button>' +
      '<button class="btn small ghost" type="button" data-act="no">Non</button>';
    return;
  }

  if (act === 'no') {
    loadMine();
    return;
  }

  if (act === 'yes') {
    b.disabled = true;
    try {
      const { data: row, error } = await sb
        .from('departures')
        .update({ statut: 'ANNULE' })
        .eq('id', id)
        .select('id, immat, bordereau, destination_id, h_depart, programme')
        .single();
      if (error) throw error;

      if (EDIT && EDIT.id === id) {
        stopEdit();
        resetForm();
      }

      const t = waAnnul(
        {
          immat: row.immat,
          bordereau: row.bordereau,
          destination: nomAgence(row.destination_id),
          hDep: hhmm(row.h_depart),
          programme: PROGRAMMES[row.programme],
        },
        SESSION.agenceNom
      );

      $('done-title').textContent = 'Départ annulé';
      $('donemsg').innerHTML = '';
      $('wa').textContent = t;
      $('wa-link').href = 'https://wa.me/?text=' + encodeURIComponent(t);
      $('f').hidden = true;
      $('done').hidden = false;
      window.scrollTo(0, 0);
      loadMine();
    } catch (err) {
      toast(erreurLisible(err));
      loadMine();
    }
  }
});

// ---------------------------------------------------------------------------
// Liste du jour
// ---------------------------------------------------------------------------
async function loadMine() {
  if (!SESSION) return;

  const { data, error } = await sb
    .from('v_departures')
    .select('*')
    .eq('date_service', TODAY)
    .eq('agence_id', AGENCE_ID)
    .order('h_depart');

  if (error) {
    $('mine').innerHTML = '<div class="empty">Liste indisponible pour le moment.</div>';
    return;
  }

  MINE = data;
  proposeProg();

  $('mine').innerHTML = !data.length
    ? '<div class="empty">Aucun départ envoyé aujourd\'hui par votre agence.</div>'
    : '<div class="card tbl" style="padding:6px 8px"><table><thead><tr>' +
      '<th>Départ</th><th></th><th>Programme</th><th>Véhicule</th><th>Destination</th>' +
      '<th class="n">Complétées</th><th class="n">Taux</th><th>Bordereau</th>' +
      '</tr></thead><tbody>' +
      data
        .map((x) => {
          const act = x.statut === 'ANNULE'
            ? '<span class="pill bad">Annulé</span>'
            : x.modifiable
              ? '<div class="rowact" data-id="' + x.id + '">' +
                '<button class="btn small ghost" type="button" data-act="edit">Modifier</button>' +
                '<button class="btn small danger" type="button" data-act="ask">Annuler</button>' +
                '</div><div class="sub">jusqu\'à ' + esc(fmtLimite(x.limite)) + '</div>'
              : '<span class="sub">Délai dépassé</span>';

          return (
            '<tr' + (x.statut === 'ANNULE' ? ' class="annule"' : '') + '>' +
            '<td>' + esc(hhmm(x.h_depart)) + '</td>' +
            '<td>' + act + '</td>' +
            '<td>' + esc(PROGRAMMES_COURTS[x.programme] || '–') +
            (x.modifie_count > 0 ? '<div class="sub">modifié</div>' : '') + '</td>' +
            '<td><span class="plate">' + esc(x.immat) + '</span></td>' +
            '<td>' + esc(x.destination) + '</td>' +
            '<td class="n">' + x.eff_complete + (x.dispo != null ? ' / ' + x.dispo : '') + '</td>' +
            '<td class="n"><span class="pill ' + cls(x.taux_agence) + '">' + pct(x.taux_agence) + '</span></td>' +
            '<td>' + esc(x.bordereau) + '</td>' +
            '</tr>'
          );
        })
        .join('') +
      '</tbody></table></div>';
}

setInterval(() => {
  if (SESSION && !document.hidden && !busy) loadMine();
}, 5 * 60000);
