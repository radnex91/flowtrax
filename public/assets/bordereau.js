import { sb, requireSession, erreurLisible } from './supa.js';
import { hhmm, pct, PROGRAMMES } from './wa.js';
import { srcLogo } from './theme.js';

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const uuid = new URLSearchParams(location.search).get('d');

const EQUIPAGE = [
  ['CHAUFFEUR', 'Chauffeur'],
  ['CONVOYEUR', 'Convoyeur'],
  ['CHEF_PISTE', 'Chef de piste'],
];

init();

async function init() {
  let ctx;
  try {
    // l'agence imprime son propre bordereau : la RLS filtre, pas cette page
    ctx = await requireSession({ roles: null, requireAgence: false });
  } catch (e) {
    $('boot').textContent = 'Connexion au serveur impossible : ' + erreurLisible(e);
    return;
  }
  if (!ctx) return;

  $('who').textContent = ctx.profile.nom;
  $('logout').hidden = false;
  $('logout').addEventListener('click', async () => {
    await sb.auth.signOut();
    location.replace('index.html');
  });

  if (!uuid) {
    $('boot').textContent = 'Aucun bordereau demandé : ouvrez-le depuis un départ.';
    return;
  }

  const { data, error } = await sb.from('v_departures').select('*').eq('uuid', uuid).maybeSingle();

  if (error) {
    $('boot').textContent = 'Lecture impossible : ' + erreurLisible(error);
    return;
  }
  if (!data) {
    $('boot').textContent = 'Bordereau introuvable, ou vous n\'avez pas accès à ce départ.';
    return;
  }

  $('boot').hidden = true;
  $('app').hidden = false;
  $('print').addEventListener('click', () => window.print());

  rendre(data);
}

function rendre(d) {
  const annule = d.statut === 'ANNULE';
  const date = d.date_service.split('-').reverse().join('/');

  const ligne = (l, v) => '<tr><th>' + esc(l) + '</th><td>' + v + '</td></tr>';

  const equipage = EQUIPAGE.filter(([role]) => d.crew && d.crew[role])
    .map(([role, label]) => ligne(label, esc(d.crew[role])))
    .join('');

  const passants = (d.passants || []).length
    ? '<h2>Passants par agence intermédiaire</h2>' +
      '<table><thead><tr><th>Agence</th><th class="n">Passagers</th></tr></thead><tbody>' +
      d.passants.map((p) => '<tr><td>' + esc(p.agence) + '</td><td class="n">' + esc(p.n) + '</td></tr>').join('') +
      '</tbody></table>'
    : '';

  $('sheet').innerHTML =
    '<div class="sheet-h">' +
    '<img class="logo" src="' + srcLogo() + '" alt="">' +
    '<div><h1>Bordereau de départ</h1><p class="sub">Danay Express SARL</p></div>' +
    '<div class="sheet-no"><span class="sub">N°</span><b>' + esc(d.bordereau) + '</b></div>' +
    '</div>' +
    (annule ? '<p class="banner bad noprint">Départ annulé' + (d.motif_annulation ? ' — ' + esc(d.motif_annulation) : '') + '</p>' : '') +
    '<table class="sheet-kv">' +
    ligne('Journée de service', esc(date)) +
    ligne('Agence', esc(d.agence)) +
    ligne('Ligne', esc(d.axe)) +
    ligne('Programme', esc(d.programme_label || PROGRAMMES[d.programme] || d.programme)) +
    ligne('Trajet', esc(d.provenance) + ' → ' + esc(d.destination)) +
    ligne('Véhicule', '<span class="plate">' + esc(d.immat) + '</span> ' + esc([d.marque, d.vehicule_type].filter(Boolean).join(' '))) +
    ligne('Places', esc(d.places)) +
    ligne('Départ', esc(hhmm(d.h_depart)) + (d.h_arrivee ? ' — arrivée ' + esc(hhmm(d.h_arrivee)) : '')) +
    ligne('Effectif à l\'arrivée', esc(d.eff_arrivee)) +
    ligne('Effectif complété', esc(d.eff_complete)) +
    ligne('Total à bord', esc(d.total) + ' / ' + esc(d.places)) +
    ligne('Taux de remplissage', pct(d.taux_agence)) +
    equipage +
    '</table>' +
    passants +
    '<p class="hint">Déclaré par ' + esc(d.created_by_nom) + ' le ' +
    esc(new Date(d.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })) +
    (d.modifie_count ? ' · modifié ' + d.modifie_count + ' fois' : '') +
    (annule ? ' · ANNULÉ' : '') +
    '</p>';
}
