import { sb, requireSession, erreurLisible } from './supa.js';
import { pct, cls, hhmm, PROGRAMMES_COURTS } from './wa.js';
import { csv, nombre, nomFichier } from './csv.js';
import { diffChamps, resumeAction } from './hist.js';
import { monterNav } from './nav.js';

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let SESSION = null;
let DU = '';
let AU = '';
let VUE = 'periode';
let DEPARTS = [];
let AGENCES = [];
let AXES = [];
let VEHICULES = [];
let HISTO = null;

const nomAgenceId = (id) => (AGENCES.find((a) => a.id === id) || {}).nom || '#' + id;
const nomAxeId = (id) => (AXES.find((a) => a.id === id) || {}).nom || '#' + id;
const immatId = (id) => (VEHICULES.find((v) => v.id === id) || {}).immat || '#' + id;

init();

async function init() {
  let ctx;
  try {
    ctx = await requireSession({ roles: ['REGULATION', 'DIRECTION'], requireAgence: false });
  } catch (e) {
    $('boot').textContent = 'Connexion au serveur impossible : ' + erreurLisible(e);
    return;
  }
  if (!ctx) return;

  SESSION = ctx.profile;
  monterNav(SESSION.role);
  $('who').textContent = SESSION.nom + ' · ' + SESSION.role.toLowerCase();
  $('logout').hidden = false;

  const { data: jour } = await sb.rpc('today_service');
  AU = jour || isoLocal(new Date());
  const d = new Date(AU + 'T12:00:00');
  d.setDate(d.getDate() - 29);
  DU = isoLocal(d);

  $('du').value = DU;
  $('au').value = AU;

  const [ag, ax, ve] = await Promise.all([
    sb.from('agences').select('id, nom, code').order('nom'),
    sb.from('axes').select('id, nom').order('nom'),
    sb.from('vehicules').select('id, immat').order('immat'),
  ]);

  const faute = ag.error || ax.error || ve.error;
  if (faute) {
    $('boot').textContent = 'Lecture impossible : ' + erreurLisible(faute);
    return;
  }

  AGENCES = ag.data || [];
  AXES = ax.data || [];
  VEHICULES = ve.data || [];

  $('agence').innerHTML =
    '<option value="">Toutes</option>' +
    AGENCES.map((a) => '<option value="' + a.id + '">' + esc(a.code + ' · ' + a.nom) + '</option>').join('');

  $('boot').hidden = true;
  $('app').hidden = false;

  $('du').addEventListener('change', () => {
    DU = $('du').value;
    recharger();
  });
  $('au').addEventListener('change', () => {
    AU = $('au').value;
    recharger();
  });
  $('agence').addEventListener('change', recharger);
  $('refresh').addEventListener('click', recharger);
  $('exportdep').addEventListener('click', exporterDeparts);
  $('exportsyn').addEventListener('click', exporterSynthese);

  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (!b) return;
    VUE = b.dataset.view;
    rendreOnglets();
    if (VUE === 'histo' && !HISTO) chargerHisto();
  });

  await charger();
}

$('logout').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.replace('index.html');
});

function isoLocal(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function alerte(t) {
  const el = $('msg');
  el.hidden = !t;
  el.textContent = t || '';
}

function recharger() {
  HISTO = null;
  charger();
}

/* ------------------------------------------------------------------ données */

async function charger() {
  if (!DU || !AU) return;
  if (DU > AU) {
    alerte('La date de début doit précéder la date de fin.');
    return;
  }
  if ((new Date(AU + 'T12:00:00') - new Date(DU + 'T12:00:00')) / 86400000 > 366) {
    alerte('Période limitée à un an.');
    return;
  }

  alerte(null);

  let requete = sb.from('v_departures').select('*').gte('date_service', DU).lte('date_service', AU);
  const agence = $('agence').value;
  if (agence) requete = requete.eq('agence_id', Number(agence));

  const { data, error } = await requete.order('date_service').order('h_depart');
  if (error) {
    alerte('Lecture impossible : ' + erreurLisible(error));
    return;
  }

  DEPARTS = data || [];
  rendre();
}

function rendreOnglets() {
  document.querySelectorAll('#tabs button').forEach((b) => {
    const on = b.dataset.view === VUE;
    b.classList.toggle('on', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });
  $('vue-periode').hidden = VUE !== 'periode';
  $('vue-histo').hidden = VUE !== 'histo';
}

function rendre() {
  rendreOnglets();

  const actifs = DEPARTS.filter((d) => d.statut === 'ACTIF');
  const passagers = actifs.reduce((s, d) => s + Number(d.total || 0), 0);
  const complete = actifs.reduce((s, d) => s + Number(d.eff_complete || 0), 0);
  const dispo = actifs.reduce((s, d) => s + Math.max(Number(d.places) - Number(d.eff_arrivee), 0), 0);
  const places = actifs.reduce((s, d) => s + Number(d.places), 0);

  $('kpis').innerHTML = [
    ['Départs', actifs.length],
    ['Passagers', passagers],
    ['Taux de remplissage agence', pct(dispo > 0 ? complete / dispo : null)],
    ['Taux d\'occupation véhicule', pct(places > 0 ? passagers / places : null)],
    ['Annulés', DEPARTS.length - actifs.length],
  ]
    .map(([l, v]) => '<div class="kpi"><span>' + esc(l) + '</span><b>' + esc(v) + '</b></div>')
    .join('');

  // par agence (mêmes formules que v_kpis_agence_jour, mais pondérées sur la période)
  const parAgence = new Map();
  for (const d of actifs) {
    const g = parAgence.get(d.agence_id) || { nom: d.agence, departs: 0, passagers: 0, complete: 0, dispo: 0 };
    g.departs += 1;
    g.passagers += Number(d.total || 0);
    g.complete += Number(d.eff_complete || 0);
    g.dispo += Math.max(Number(d.places) - Number(d.eff_arrivee), 0);
    parAgence.set(d.agence_id, g);
  }

  $('paragence').innerHTML = parAgence.size
    ? '<div class="card tbl"><table><thead><tr><th>Agence</th><th class="n">Départs</th><th class="n">Passagers</th><th class="n">Taux</th></tr></thead><tbody>' +
      [...parAgence.values()]
        .sort((a, b) => a.nom.localeCompare(b.nom))
        .map((g) => {
          const t = g.dispo > 0 ? g.complete / g.dispo : null;
          return (
            '<tr><td>' + esc(g.nom) + '</td><td class="n">' + g.departs + '</td>' +
            '<td class="n">' + g.passagers + '</td>' +
            '<td class="n"><span class="pill ' + cls(t) + '">' + pct(t) + '</span></td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>'
    : '<div class="empty">Aucun départ sur la période.</div>';

  // par jour
  const parJour = new Map();
  for (const d of actifs) {
    const g = parJour.get(d.date_service) || { departs: 0, passagers: 0, complete: 0, dispo: 0 };
    g.departs += 1;
    g.passagers += Number(d.total || 0);
    g.complete += Number(d.eff_complete || 0);
    g.dispo += Math.max(Number(d.places) - Number(d.eff_arrivee), 0);
    parJour.set(d.date_service, g);
  }

  $('parjour').innerHTML = parJour.size
    ? '<div class="card tbl"><table><thead><tr><th>Jour</th><th class="n">Départs</th><th class="n">Passagers</th><th class="n">Taux</th></tr></thead><tbody>' +
      [...parJour.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([jour, g]) => {
          const t = g.dispo > 0 ? g.complete / g.dispo : null;
          return (
            '<tr><td>' + esc(jour.split('-').reverse().join('/')) + '</td>' +
            '<td class="n">' + g.departs + '</td><td class="n">' + g.passagers + '</td>' +
            '<td class="n"><span class="pill ' + cls(t) + '">' + pct(t) + '</span></td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>'
    : '<div class="empty">Aucun départ sur la période.</div>';

  // détail
  const visibles = DEPARTS.slice(0, 200);
  const reste = DEPARTS.length - visibles.length;

  $('liste').innerHTML = !DEPARTS.length
    ? '<div class="empty">Aucun départ sur la période.</div>'
    : '<div class="card tbl" style="padding:6px 8px"><table><thead><tr>' +
      '<th>Jour</th><th>Départ</th><th>Agence</th><th>Bordereau</th><th>Destination</th>' +
      '<th>Véhicule</th><th class="n">Total</th><th class="n">Taux agence</th><th>Statut</th>' +
      '</tr></thead><tbody>' +
      visibles
        .map((d) => {
          const annule = d.statut === 'ANNULE';
          return (
            '<tr' + (annule ? ' class="annule"' : '') + '>' +
            '<td>' + esc(d.date_service.split('-').reverse().join('/')) + '</td>' +
            '<td><a href="bordereau.html?d=' + encodeURIComponent(d.uuid) + '">' + esc(hhmm(d.h_depart)) + '</a></td>' +
            '<td>' + esc(d.agence) + '</td>' +
            '<td>' + esc(d.bordereau) + '</td>' +
            '<td>' + esc(d.destination) + '</td>' +
            '<td><span class="plate">' + esc(d.immat) + '</span></td>' +
            '<td class="n">' + esc(d.total) + ' / ' + esc(d.places) + '</td>' +
            '<td class="n"><span class="pill ' + cls(d.taux_agence) + '">' + pct(d.taux_agence) + '</span></td>' +
            '<td>' + esc(d.statut === 'ACTIF' ? 'Actif' : 'Annulé') + '</td>' +
            '</tr>'
          );
        })
        .join('') +
      '</tbody></table></div>' +
      (reste > 0 ? '<p class="hint">' + reste + ' départ(s) de plus : utilisez l\'export CSV ou resserrez la période.</p>' : '');
}

/* ------------------------------------------------------------------ exports */

function telecharger(nom, texte) {
  const blob = new Blob([texte], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const COLONNES_DEPARTS = [
  { l: 'Jour', k: 'date_service' },
  { l: 'Départ', f: (d) => hhmm(d.h_depart) },
  { l: 'Arrivée', f: (d) => (d.h_arrivee ? hhmm(d.h_arrivee) : '') },
  { l: 'Agence', k: 'agence' },
  { l: 'Bordereau', k: 'bordereau' },
  { l: 'Programme', k: 'programme_label' },
  { l: 'Ligne', k: 'axe' },
  { l: 'Provenance', k: 'provenance' },
  { l: 'Destination', k: 'destination' },
  { l: 'Véhicule', k: 'immat' },
  { l: 'Places', k: 'places' },
  { l: 'À bord', k: 'eff_arrivee' },
  { l: 'Complétées', k: 'eff_complete' },
  { l: 'Total', k: 'total' },
  { l: 'Taux agence %', f: (d) => nombre(d.taux_agence == null ? null : Number(d.taux_agence) * 100, 1) },
  { l: 'Taux véhicule %', f: (d) => nombre(d.taux_vehicule == null ? null : Number(d.taux_vehicule) * 100, 1) },
  { l: 'Statut', k: 'statut' },
  { l: 'Motif', k: 'motif_annulation' },
  { l: 'Modifications', k: 'modifie_count' },
  { l: 'Déclaré par', k: 'created_by_nom' },
];

function exporterDeparts() {
  if (!DEPARTS.length) {
    alerte('Rien à exporter sur cette période.');
    return;
  }
  telecharger(nomFichier('departs', DU, AU), csv(COLONNES_DEPARTS, DEPARTS));
  alerte(null);
}

function exporterSynthese() {
  const actifs = DEPARTS.filter((d) => d.statut === 'ACTIF');
  const groupes = new Map();

  for (const d of actifs) {
    const g = groupes.get(d.agence_id) || { agence: d.agence, departs: 0, passagers: 0, complete: 0, dispo: 0 };
    g.departs += 1;
    g.passagers += Number(d.total || 0);
    g.complete += Number(d.eff_complete || 0);
    g.dispo += Math.max(Number(d.places) - Number(d.eff_arrivee), 0);
    groupes.set(d.agence_id, g);
  }

  const lignes = [...groupes.values()].sort((a, b) => a.agence.localeCompare(b.agence));

  if (!lignes.length) {
    alerte('Rien à exporter sur cette période.');
    return;
  }

  telecharger(
    nomFichier('synthese-agences', DU, AU),
    csv(
      [
        { l: 'Agence', k: 'agence' },
        { l: 'Départs', k: 'departs' },
        { l: 'Passagers', k: 'passagers' },
        { l: 'Taux agence %', f: (g) => nombre(g.dispo > 0 ? (g.complete / g.dispo) * 100 : null, 1) },
      ],
      lignes
    )
  );
  alerte(null);
}

/* ---------------------------------------------------------------- historique */

const libelleChamp = (champ, v) => {
  if (v == null || v === '') return '—';
  switch (champ) {
    case 'axe_id':
      return nomAxeId(v);
    case 'provenance_id':
    case 'destination_id':
      return nomAgenceId(v);
    case 'vehicule_id':
      return immatId(v);
    case 'programme':
      return PROGRAMMES_COURTS[v] || v;
    case 'h_depart':
    case 'h_arrivee':
      return hhmm(v);
    default:
      return String(v);
  }
};

function dateHeure(at) {
  try {
    return new Date(at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(at);
  }
}

async function chargerHisto() {
  $('histo').innerHTML = '<div class="empty">Chargement…</div>';

  const debut = new Date(DU + 'T00:00:00').toISOString();
  const fin = new Date(AU + 'T23:59:59').toISOString();

  const { data, error } = await sb
    .from('audit_log')
    .select('id, user_id, action, entity_id, before_json, after_json, at')
    .eq('entity', 'departures')
    .gte('at', debut)
    .lte('at', fin)
    .order('at', { ascending: false })
    .limit(200);

  if (error) {
    $('histo').innerHTML = '<div class="empty">Lecture impossible : ' + esc(erreurLisible(error)) + '</div>';
    return;
  }

  HISTO = data || [];

  if (!HISTO.length) {
    $('histo').innerHTML = '<div class="empty">Aucune écriture sur la période.</div>';
    return;
  }

  const ids = [...new Set(HISTO.map((r) => r.entity_id))];
  const uids = [...new Set(HISTO.map((r) => r.user_id).filter(Boolean))];

  const [dep, pr] = await Promise.all([
    sb.from('v_departures').select('id, uuid, date_service, agence, bordereau, h_depart').in('id', ids),
    uids.length ? sb.from('profiles').select('id, nom').in('id', uids) : Promise.resolve({ data: [] }),
  ]);

  const parDepart = new Map((dep.data || []).map((d) => [d.id, d]));
  const parProfil = new Map((pr.data || []).map((p) => [p.id, p.nom]));

  $('histo').innerHTML = HISTO.map((r) => {
    const d = parDepart.get(r.entity_id);
    const action = resumeAction(r.action, r.before_json, r.after_json);
    const ton = action === 'Annulation' ? 'bad' : action === 'Déclaration' ? 'ok' : 'warn';
    const qui = parProfil.get(r.user_id) || 'compte supprimé';

    const contexte = d
      ? esc(d.bordereau) + ' · ' + esc(d.agence) + ' · ' + esc(d.date_service.split('-').reverse().join('/')) + ' ' + esc(hhmm(d.h_depart))
      : 'départ #' + r.entity_id;

    let corps;
    if (action === 'Déclaration' && r.after_json) {
      const a = r.after_json;
      corps =
        '<p class="hint">' + esc(a.places_snapshot) + ' places · à bord ' + esc(a.eff_arrivee) +
        ' · complétées ' + esc(a.eff_complete) + ' · ligne ' + esc(nomAxeId(a.axe_id)) + ' — ' +
        esc(nomAgenceId(a.provenance_id)) + ' → ' + esc(nomAgenceId(a.destination_id)) + '</p>';
    } else {
      const diff = diffChamps(r.before_json, r.after_json, libelleChamp);
      corps = diff.length
        ? '<ul class="diff">' +
          diff
            .map((x) => '<li><b>' + esc(x.label) + '</b> : ' + esc(x.avant) + ' → ' + esc(x.apres) + '</li>')
            .join('') +
          '</ul>'
        : '<p class="hint">Aucun champ suivi n\'a changé.</p>';
    }

    return (
      '<article class="entry">' +
      '<div class="entry-h"><span class="pill ' + ton + '">' + esc(action) + '</span>' +
      '<b>' + contexte + '</b>' +
      '<span class="sub" style="margin-left:auto">' + esc(dateHeure(r.at)) + '</span></div>' +
      corps +
      '<p class="hint">par ' + esc(qui) + '</p>' +
      '</article>'
    );
  }).join('');
}
