import { sb, requireSession, erreurLisible } from './supa.js';
import { pct, cls, hhmm, PROGRAMMES_COURTS } from './wa.js';
import { monterNav } from './nav.js';

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let SESSION = null;
let TODAY = null;

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
  if (SESSION.role !== 'AGENCE') $('reportslink').hidden = false;
  if (SESSION.role === 'DIRECTION') $('adminlink').hidden = false;

  try {
    const { data, error } = await sb.rpc('today_service');
    if (error) throw error;
    TODAY = data;
  } catch (e) {
    $('boot').textContent = 'Impossible de lire la date de service : ' + erreurLisible(e);
    return;
  }

  $('date').value = TODAY;
  $('boot').hidden = true;
  $('app').hidden = false;

  $('date').addEventListener('change', charger);
  $('refresh').addEventListener('click', charger);

  await charger();
}

$('logout').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.replace('index.html');
});

function iso(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

async function charger() {
  const jour = $('date').value || TODAY;

  // midi local : évite les décalages de fuseau et les changements d'heure
  const depuis = new Date(jour + 'T12:00:00');
  depuis.setDate(depuis.getDate() - 13);

  const [kj, ka, dep, ag, trend] = await Promise.all([
    sb.from('v_kpis_jour').select('*').eq('date_service', jour).maybeSingle(),
    sb.from('v_kpis_agence_jour').select('*').eq('date_service', jour).order('agence'),
    sb.from('v_departures').select('*').eq('date_service', jour).order('h_depart'),
    sb.from('agences').select('id, nom').eq('actif', true).order('nom'),
    sb
      .from('v_kpis_jour')
      .select('date_service, taux_agence, taux_vehicule, departs')
      .gte('date_service', iso(depuis))
      .lte('date_service', jour)
      .order('date_service'),
  ]);

  const erreur = kj.error || ka.error || dep.error || ag.error || trend.error;
  if (erreur) {
    $('kpis').innerHTML = '<div class="empty">Lecture impossible : ' + esc(erreurLisible(erreur)) + '</div>';
    return;
  }

  const k = kj.data || { departs: 0, passagers: 0, annules: 0, taux_agence: null, taux_vehicule: null };

  $('kpis').innerHTML = [
    ['Départs', k.departs ?? 0],
    ['Passagers à bord', k.passagers ?? 0],
    ['Taux de remplissage agence', pct(k.taux_agence)],
    ['Taux d\'occupation véhicule', pct(k.taux_vehicule)],
    ['Annulés', k.annules ?? 0],
  ]
    .map(([label, val]) => '<div class="kpi"><span>' + esc(label) + '</span><b>' + esc(val) + '</b></div>')
    .join('');

  // Agences actives n'ayant déclaré aucun départ
  const actives = new Set((ka.data || []).map((x) => x.agence_id));
  const muettes = (ag.data || []).filter((a) => !actives.has(a.id));
  $('alerte').hidden = muettes.length === 0;
  if (muettes.length) {
    $('alerte').innerHTML =
      '<b>' + muettes.length + ' agence' + (muettes.length > 1 ? 's' : '') +
      ' sans saisie</b> — ' + muettes.map((a) => esc(a.nom)).join(', ') + '.';
  }

  $('par-agence').innerHTML = !(ka.data || []).length
    ? '<div class="empty">Aucun départ déclaré ce jour.</div>'
    : '<div class="card tbl"><table><thead><tr><th>Agence</th><th class="n">Départs</th><th class="n">Passagers</th><th class="n">Taux</th></tr></thead><tbody>' +
      ka.data
        .map(
          (x) =>
            '<tr><td>' + esc(x.agence) + '</td><td class="n">' + x.departs + '</td>' +
            '<td class="n">' + x.passagers + '</td>' +
            '<td class="n"><span class="pill ' + cls(x.taux_agence) + '">' + pct(x.taux_agence) + '</span></td></tr>'
        )
        .join('') +
      '</tbody></table></div>';

  const serie = trend.data || [];
  $('tendance').innerHTML = !serie.length
    ? '<div class="empty">Pas encore d\'historique.</div>'
    : serie
        .map((d) => {
          const v = d.taux_agence == null ? 0 : Number(d.taux_agence);
          return (
            '<div class="meter" style="margin-bottom:8px">' +
            '<div class="meter-row"><span class="sub">' + esc(d.date_service.slice(5)) + '</span>' +
            '<span class="sub">' + pct(d.taux_agence) + ' · ' + d.departs + ' départ' + (d.departs > 1 ? 's' : '') + '</span></div>' +
            '<div class="bar"><i style="width:' + Math.min(100, v * 100) + '%;background:var(--' + (cls(v) || 'line') + ')"></i></div>' +
            '</div>'
          );
        })
        .join('');

  $('departs').innerHTML = !(dep.data || []).length
    ? '<div class="empty">Aucun départ déclaré ce jour.</div>'
    : '<div class="card tbl" style="padding:6px 8px"><table><thead><tr>' +
      '<th>Départ</th><th>Agence</th><th>Programme</th><th>Véhicule</th><th>Destination</th>' +
      '<th class="n">Complétées</th><th class="n">Taux agence</th><th class="n">Taux véhicule</th><th>Saisi par</th>' +
      '</tr></thead><tbody>' +
      dep.data
        .map(
          (x) =>
            '<tr' + (x.statut === 'ANNULE' ? ' class="annule"' : '') + '>' +
            '<td><a href="bordereau.html?d=' + encodeURIComponent(x.uuid) + '">' + esc(hhmm(x.h_depart)) + '</a></td>' +
            '<td>' + esc(x.agence) + '</td>' +
            '<td>' + esc(PROGRAMMES_COURTS[x.programme] || '–') + '</td>' +
            '<td><span class="plate">' + esc(x.immat) + '</span></td>' +
            '<td>' + esc(x.destination) + '</td>' +
            '<td class="n">' + x.eff_complete + ' / ' + x.dispo + '</td>' +
            '<td class="n"><span class="pill ' + cls(x.taux_agence) + '">' + pct(x.taux_agence) + '</span></td>' +
            '<td class="n"><span class="pill ' + cls(x.taux_vehicule) + '">' + pct(x.taux_vehicule) + '</span></td>' +
            '<td class="sub">' + esc(x.created_by_nom) + '</td>' +
            '</tr>'
        )
        .join('') +
      '</tbody></table></div>';
}
