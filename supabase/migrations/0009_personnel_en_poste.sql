-- ---------------------------------------------------------------------------
-- 0009 — Personnel en poste au début de programme
--
-- Une seule fois par jour, avec le départ « Début de programme », l'agence note
-- qui tient le guichet, la direction, le poste de chef de piste, l'accueil des
-- porteurs et la logistique. Les autres départs de la journée repartent avec
-- les mêmes personnes : les colonnes restent nulles pour une suite ou une fin.
--
-- Ces cinq noms ne changent rien au message WhatsApp ni au bordereau ; ils
-- servent à savoir qui était en poste, pas à qui monte dans le car.
-- ---------------------------------------------------------------------------

alter table public.departures
  add column if not exists guichetier            text,
  add column if not exists chef_agence           text,
  add column if not exists chef_piste_poste      text,
  add column if not exists porteur_accueil       text,
  add column if not exists chef_piste_logistique text;

-- La vue est remplacée, pas supprimée : ses droits de lecture restent en place
-- et aucune fenêtre ne s'ouvre où l'écran de saisie ne lirait plus les départs.
-- Les cinq colonnes viennent à la fin, seul ajout que « create or replace »
-- autorise sans toucher à l'ordre des colonnes déjà lues par les écrans.
create or replace view public.v_departures with (security_invoker = true) as
select
  d.id,
  d.uuid,
  d.date_service,
  d.agence_id,
  ag.nom as agence,
  d.programme,
  case d.programme
    when 'DEBUT'     then 'Début de programme'
    when 'SUITE'     then 'Suite de programme'
    when 'FIN'       then 'Fin de programme'
    else 'Début et fin de programme'
  end as programme_label,
  d.axe_id,
  ax.nom as axe,
  d.provenance_id,
  pv.nom as provenance,
  d.destination_id,
  dv.nom as destination,
  d.vehicule_id,
  ve.immat,
  ve.marque,
  ve.type as vehicule_type,
  d.places_snapshot as places,
  d.bordereau,
  d.h_arrivee,
  d.h_depart,
  d.eff_arrivee,
  d.eff_complete,
  d.dispo,
  d.taux_agence,
  d.taux_vehicule,
  (d.eff_arrivee + d.eff_complete) as total,
  d.statut,
  d.motif_annulation,
  d.modifie_count,
  coalesce(ps.passants, '[]'::jsonb) as passants,
  coalesce(co.crew, '[]'::jsonb) as crew,
  public.departure_limite(d.date_service, d.h_depart) as limite,
  (d.statut = 'ACTIF'
   and now() < public.departure_limite(d.date_service, d.h_depart)) as modifiable,
  d.created_by,
  pr.nom as created_by_nom,
  d.created_at,
  d.updated_at,
  d.guichetier,
  d.chef_agence,
  d.chef_piste_poste,
  d.porteur_accueil,
  d.chef_piste_logistique
from public.departures d
join public.agences  ag on ag.id = d.agence_id
join public.axes     ax on ax.id = d.axe_id
join public.agences  pv on pv.id = d.provenance_id
join public.agences  dv on dv.id = d.destination_id
join public.vehicules ve on ve.id = d.vehicule_id
join public.profiles pr on pr.id = d.created_by
left join lateral (
  select jsonb_agg(jsonb_build_object('agence', a2.nom, 'n', pp.n) order by aa.position) as passants
  from public.departure_passagers pp
  join public.agences a2 on a2.id = pp.agence_id
  left join public.axe_agences aa on aa.axe_id = d.axe_id and aa.agence_id = pp.agence_id
  where pp.departure_id = d.id
) ps on true
left join lateral (
  select jsonb_object_agg(c.role, c.nom) as crew
  from public.departure_crew c
  where c.departure_id = d.id
) co on true;

-- Contrôle : 5 | 5 attendu (les cinq colonnes dans la table, et dans la vue).
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'departures'
      and column_name in ('guichetier', 'chef_agence', 'chef_piste_poste',
                          'porteur_accueil', 'chef_piste_logistique')) as colonnes_table,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'v_departures'
      and column_name in ('guichetier', 'chef_agence', 'chef_piste_poste',
                          'porteur_accueil', 'chef_piste_logistique')) as colonnes_vue;
