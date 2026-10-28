// Rapport quotidien FlowTrax — Supabase Edge Function (Deno).
//
// Appelée par .github/workflows/rapport.yml avec l'en-tête
//   Authorization: Bearer <RAPPORT_TOKEN>
// Elle calcule les KPI du jour, compose le message, l'envoie si les
// identifiants WhatsApp sont présents, et journalise dans public.reports.
//
// Secrets à définir : RAPPORT_TOKEN, WHATSAPP_TOKEN, WHATSAPP_PHONE_ID,
// WHATSAPP_TO (optionnels — sans eux, le rapport est seulement archivé).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

const pct = (x: number | null) =>
  x == null ? '–' : Math.round(Number(x) * 100) + ' %';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'méthode attendue : POST' }, 405);

  const attendu = Deno.env.get('RAPPORT_TOKEN');
  const recu = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!attendu || recu !== attendu) return json({ error: 'non autorisé' }, 401);

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const corps = await req.json().catch(() => ({}));
  const jour: string = corps?.date || (await sb.rpc('today_service')).data;

  const { data: kpi, error: e1 } = await sb
    .from('v_kpis_jour')
    .select('*')
    .eq('date_service', jour)
    .maybeSingle();

  const { data: parAgence, error: e2 } = await sb
    .from('v_kpis_agence_jour')
    .select('*')
    .eq('date_service', jour)
    .order('agence');

  if (e1 || e2) return json({ error: e1?.message || e2?.message }, 500);

  const k = kpi ?? { departs: 0, annules: 0, passagers: 0, taux_agence: null, taux_vehicule: null };

  const lignes = [
    `*RAPPORT · DÉPARTS ${jour}*`,
    `Départs : ${k.departs} · Annulés : ${k.annules}`,
    `Passagers transportés : ${k.passagers}`,
    `Taux de remplissage agence : *${pct(k.taux_agence)}*`,
    `Taux d'occupation véhicule : *${pct(k.taux_vehicule)}*`,
  ];

  for (const a of parAgence ?? []) {
    lignes.push(`${a.agence} : ${a.departs} départ(s) · ${a.passagers} passagers · ${pct(a.taux_agence)}`);
  }

  const message = lignes.join('\n');

  // --- Envoi WhatsApp (Cloud API) : ignoré si non configuré -------------
  let statut: 'OK' | 'ERREUR' = 'OK';
  let detail: string | null = null;

  const waToken = Deno.env.get('WHATSAPP_TOKEN');
  const waPhone = Deno.env.get('WHATSAPP_PHONE_ID');
  const waTo = Deno.env.get('WHATSAPP_TO');

  if (waToken && waPhone && waTo) {
    const rep = await fetch(`https://graph.facebook.com/v20.0/${waPhone}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${waToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: waTo,
        type: 'text',
        text: { body: message },
      }),
    });
    if (!rep.ok) {
      statut = 'ERREUR';
      detail = await rep.text();
    }
  } else {
    detail = 'Envoi non configuré : rapport archivé uniquement.';
  }

  const { error: e3 } = await sb.from('reports').insert({
    date_service: jour,
    canal: 'WHATSAPP',
    destinataires: waTo ?? null,
    payload_json: { message, kpi: k, par_agence: parAgence ?? [] },
    statut,
  });

  if (e3) return json({ error: e3.message }, 500);

  return json({ ok: statut === 'OK', jour, message, statut, detail });
});
