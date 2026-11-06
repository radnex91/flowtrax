import { sb, requireSession, erreurLisible } from './supa.js';
import { pct, cls, hhmm, PROGRAMMES_COURTS } from './wa.js';
import { monterNav } from './nav.js';

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let SESSION = null;
let TODAY = null;

init();

function dateLisible(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr + 'T12:00:00');
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return isoStr;
  }
}

async function init() {
  let ctx;
  try {
    ctx = await requireSession({ perm: 'dashboard.lire', requireAgence: false });
  } catch (e) {
    $('boot').textContent = 'Connexion au serveur impossible : ' + erreurLisible(e);
    return;
  }
  if (!ctx) return;

  SESSION = ctx.profile;
  monterNav(SESSION);

  $('who').textContent = SESSION.nom + ' · ' + (SESSION.role_libelle || SESSION.role).toLowerCase();
  $('logout').hidden = false;
  if (SESSION.permissions.includes('rapports.lire')) $('reportslink').hidden = false;
  if (SESSION.permissions.includes('admin.acces')) $('adminlink').hidden = false;

  try {
    const { data, error } = await sb.rpc('today_service');
    if (error) throw error;
    TODAY = data;
  } catch (e) {
    $('boot').textContent = 'Impossible de lire la date de service : ' + erreurLisible(e);
    return;
  }

  $('date').value = TODAY;
  const badgeDate = $('date-badge-label');
  if (badgeDate) badgeDate.textContent = dateLisible(TODAY);

  $('boot').hidden = true;
  $('app').hidden = false;

  $('date').addEventListener('change', () => {
    if (badgeDate) badgeDate.textContent = dateLisible($('date').value || TODAY);
    charger();
  });
  $('refresh').addEventListener('click', charger);

  // Toggle nav sur mobile si bouton présent
  const toggleBtn = $('toggle-nav-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('nav-open');
    });
  }

  await charger();
}

$('logout').addEventListener('click', async () => {
  try {
    await sb.auth.signOut({ scope: 'local' });
  } catch {}
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('sb-') || k.includes('auth-token') || k.includes('supabase'))) {
        localStorage.removeItem(k);
      }
    }
  } catch {}
  location.replace('index.html?deconnexion=1');
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

  // ---------------------------------------------------------------------------
  // 1. Les 5 Cartes KPIs Modernes
  // ---------------------------------------------------------------------------
  const iconeBus = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="12" rx="2.5"/><path d="M3 11h18"/><path d="M7 20h2M15 20h2"/></svg>';
  const iconeUsers = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  const iconeChart = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/><path d="M3 20h18"/></svg>';
  const iconeGauge = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14v-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>';
  const iconeBan = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>';

  const kpisData = [
    {
      titre: 'Départs',
      val: k.departs ?? 0,
      sub: 'Départs déclarés aujourd\'hui',
      couleur: 'kpi-blue',
      icone: iconeBus,
    },
    {
      titre: 'Passagers',
      val: k.passagers ?? 0,
      sub: 'Passagers à bord',
      couleur: 'kpi-green',
      icone: iconeUsers,
    },
    {
      titre: 'Remplissage',
      val: pct(k.taux_agence),
      sub: 'Taux moyen agence',
      couleur: 'kpi-orange',
      icone: iconeChart,
    },
    {
      titre: 'Occupation',
      val: pct(k.taux_vehicule),
      sub: 'Taux moyen véhicules',
      couleur: 'kpi-purple',
      icone: iconeGauge,
    },
    {
      titre: 'Départs annulés',
      val: k.annules ?? 0,
      sub: k.annules > 0 ? k.annules + ' annulé' + (k.annules > 1 ? 's' : '') : 'Aucun départ annulé',
      couleur: 'kpi-red',
      icone: iconeBan,
    },
  ];

  $('kpis').innerHTML = kpisData
    .map(
      (item) =>
        '<div class="kpi-card ' + item.couleur + '">' +
          '<div class="kpi-card-inner">' +
            '<div class="kpi-icon-box ' + item.couleur + '">' + item.icone + '</div>' +
            '<div class="kpi-text-box">' +
              '<span class="kpi-title">' + esc(item.titre) + '</span>' +
              '<b class="kpi-num">' + esc(item.val) + '</b>' +
              '<span class="kpi-caption">' + esc(item.sub) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>'
    )
    .join('');

  // ---------------------------------------------------------------------------
  // 2. Alerte Agences sans saisie
  // ---------------------------------------------------------------------------
  const actives = new Set((ka.data || []).map((x) => x.agence_id));
  const muettes = (ag.data || []).filter((a) => !actives.has(a.id));
  $('alerte').hidden = muettes.length === 0;
  if (muettes.length) {
    $('alerte').innerHTML =
      '<div class="alerte-icon">⚠️</div>' +
      '<div><b>' + muettes.length + ' agence' + (muettes.length > 1 ? 's' : '') +
      ' sans saisie :</b> ' + muettes.map((a) => esc(a.nom)).join(', ') + '.</div>';
  }

  // ---------------------------------------------------------------------------
  // 3. Graphique Taux par agence (Bar chart moderne + tableau)
  // ---------------------------------------------------------------------------
  const agencesData = ka.data || [];
  if (!agencesData.length) {
    $('par-agence').innerHTML = '<div class="empty">Aucun départ déclaré ce jour.</div>';
  } else {
    // Top 5 pour le bar chart
    const topAgences = agencesData.slice(0, 5);
    const chartBars = topAgences
      .map((x) => {
        const p = x.taux_agence == null ? 0 : Math.round(Number(x.taux_agence) * 100);
        const h = Math.max(12, Math.min(100, p));
        return (
          '<div class="dash-bar-col">' +
            '<span class="dash-bar-val">' + p + '%</span>' +
            '<div class="dash-bar-track">' +
              '<div class="dash-bar-fill" style="height:' + h + '%"></div>' +
            '</div>' +
            '<span class="dash-bar-label">' + esc(x.agence) + '</span>' +
          '</div>'
        );
      })
      .join('');

    const tableRows = agencesData
      .map(
        (x) =>
          '<tr><td>' + esc(x.agence) + '</td>' +
          '<td class="n">' + x.departs + '</td>' +
          '<td class="n">' + x.passagers + '</td>' +
          '<td class="n"><span class="pill ' + cls(x.taux_agence) + '">' + pct(x.taux_agence) + '</span></td></tr>'
      )
      .join('');

    $('par-agence').innerHTML =
      '<div class="dash-barchart-container">' +
        '<div class="dash-barchart-axis">' +
          '<span>100</span><span>80</span><span>60</span><span>40</span><span>20</span><span>0</span>' +
        '</div>' +
        '<div class="dash-barchart-bars">' + chartBars + '</div>' +
      '</div>' +
      '<div class="dash-subtable-box">' +
        '<table><thead><tr><th>Agence</th><th class="n">Départs</th><th class="n">Passagers</th><th class="n">Taux</th></tr></thead>' +
        '<tbody>' + tableRows + '</tbody></table>' +
      '</div>';
  }

  // ---------------------------------------------------------------------------
  // 4. Graphique Activité des 14 derniers jours (Double courbe SVG)
  // ---------------------------------------------------------------------------
  const serie = trend.data || [];
  if (!serie.length) {
    $('tendance').innerHTML = '<div class="empty">Pas encore d\'historique disponible.</div>';
  } else {
    // Calcul des coordonnées SVG
    const svgW = 560;
    const svgH = 190;
    const padL = 40;
    const padR = 20;
    const padT = 20;
    const padB = 30;
    const chartW = svgW - padL - padR;
    const chartH = svgH - padT - padB;

    const maxDep = Math.max(10, ...serie.map((s) => s.departs || 0));
    const stepX = chartW / Math.max(1, serie.length - 1);

    const ptsTaux = [];
    const ptsDep = [];

    serie.forEach((d, idx) => {
      const x = padL + idx * stepX;
      const tauxVal = d.taux_agence == null ? 0 : Number(d.taux_agence) * 100;
      const yTaux = padT + chartH - (tauxVal / 100) * chartH;
      const yDep = padT + chartH - ((d.departs || 0) / maxDep) * chartH;
      ptsTaux.push({ x, y: yTaux, val: pct(d.taux_agence), date: d.date_service });
      ptsDep.push({ x, y: yDep, val: d.departs, date: d.date_service });
    });

    const dPathTaux = ptsTaux.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
    const dPathDep = ptsDep.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
    const areaTaux = dPathTaux + ' L' + ptsTaux[ptsTaux.length - 1].x.toFixed(1) + ',' + (padT + chartH) + ' L' + padL + ',' + (padT + chartH) + ' Z';

    const gridLines = [0, 25, 50, 75, 100]
      .map((val) => {
        const y = padT + chartH - (val / 100) * chartH;
        return (
          '<line x1="' + padL + '" y1="' + y + '" x2="' + (svgW - padR) + '" y2="' + y + '" stroke="rgba(0,0,0,0.06)" stroke-dasharray="3 3"/>' +
          '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" fill="#94A3B8" font-size="10" text-anchor="end">' + val + '</text>'
        );
      })
      .join('');

    const dateLabels = serie
      .map((d, idx) => {
        const x = padL + idx * stepX;
        const court = d.date_service.slice(8, 10) + '/' + d.date_service.slice(5, 7);
        return '<text x="' + x.toFixed(1) + '" y="' + (svgH - 8) + '" fill="#94A3B8" font-size="10" text-anchor="middle">' + court + '</text>';
      })
      .join('');

    const circlesTaux = ptsTaux
      .map((p) => '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4" fill="#ED5D0B" stroke="#fff" stroke-width="2"/>')
      .join('');

    const circlesDep = ptsDep
      .map((p) => '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4" fill="#2563EB" stroke="#fff" stroke-width="2"/>')
      .join('');

    $('tendance').innerHTML =
      '<div class="dash-svg-chart-wrap">' +
        '<svg viewBox="0 0 ' + svgW + ' ' + svgH + '" class="dash-svg-chart">' +
          '<defs>' +
            '<linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">' +
              '<stop offset="0%" stop-color="#ED5D0B" stop-opacity="0.18"/>' +
              '<stop offset="100%" stop-color="#ED5D0B" stop-opacity="0.0"/>' +
            '</linearGradient>' +
          '</defs>' +
          gridLines +
          '<path d="' + areaTaux + '" fill="url(#areaGrad)"/>' +
          '<path d="' + dPathDep + '" fill="none" stroke="#2563EB" stroke-width="2.5" stroke-linecap="round"/>' +
          '<path d="' + dPathTaux + '" fill="none" stroke="#ED5D0B" stroke-width="2.5" stroke-linecap="round"/>' +
          circlesDep +
          circlesTaux +
          dateLabels +
        '</svg>' +
      '</div>';
  }

  // ---------------------------------------------------------------------------
  // 5. Tableau Départs de la journée (Identique à la maquette)
  // ---------------------------------------------------------------------------
  const departsData = dep.data || [];
  if (!departsData.length) {
    $('departs').innerHTML =
      '<div class="dash-empty-state">' +
        '<div class="dash-empty-bus-icon">' +
          '<svg viewBox="0 0 48 32" width="48" height="32" fill="none">' +
            '<rect x="2" y="4" width="44" height="22" rx="4" fill="#EDF2F7"/>' +
            '<line x1="2" y1="14" x2="46" y2="14" stroke="#CBD5E1" stroke-width="2"/>' +
            '<circle cx="12" cy="26" r="3.5" fill="#94A3B8"/><circle cx="36" cy="26" r="3.5" fill="#94A3B8"/>' +
            '<rect x="6" y="8" width="8" height="4" rx="1" fill="#94A3B8"/>' +
            '<rect x="18" y="8" width="8" height="4" rx="1" fill="#94A3B8"/>' +
            '<rect x="30" y="8" width="10" height="4" rx="1" fill="#94A3B8"/>' +
          '</svg>' +
        '</div>' +
        '<b class="dash-empty-title">Aucun départ déclaré ce jour.</b>' +
        '<p class="dash-empty-sub">Les informations apparaîtront ici dès qu\'un départ sera enregistré.</p>' +
      '</div>';
  } else {
    const rows = departsData
      .map((x, idx) => {
        const statutLabel = x.statut === 'ANNULE'
          ? '<span class="pill bad">Annulé</span>'
          : x.modifie_count > 0
            ? '<span class="pill warn">Modifié</span>'
            : '<span class="pill ok">Confirmé</span>';

        return (
          '<tr' + (x.statut === 'ANNULE' ? ' class="annule"' : '') + '>' +
            '<td class="td-num">' + (idx + 1) + '</td>' +
            '<td class="td-agence"><b>' + esc(x.agence) + '</b></td>' +
            '<td><span class="plate">' + esc(x.immat) + '</span></td>' +
            '<td>' + esc(x.destination) + '</td>' +
            '<td class="td-passagers">' + (x.eff_complete ?? 0) + ' / ' + (x.dispo || '–') + '</td>' +
            '<td><a class="time-badge-link" href="bordereau.html?d=' + encodeURIComponent(x.uuid) + '">' + esc(hhmm(x.h_depart)) + '</a></td>' +
            '<td>' + statutLabel + '</td>' +
          '</tr>'
        );
      })
      .join('');

    $('departs').innerHTML =
      '<div class="tbl dash-tbl"><table>' +
        '<thead><tr>' +
          '<th>#</th><th>Agence</th><th>Véhicule</th><th>Destination</th><th>Passagers</th><th>Heure départ</th><th>Statut</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>';
  }
}
