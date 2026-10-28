-- FlowTrax — 0001 : schéma
-- Cible : PostgreSQL 15+ (Supabase)
-- À exécuter dans le SQL Editor du projet Supabase, dans l'ordre 0001 → 0002 → 0003.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Paramètres d'exploitation
-- ---------------------------------------------------------------------------
create table public.settings (
  key        text primary key,
  value      text not null,
  label      text,
  updated_at timestamptz not null default now()
);

insert into public.settings (key, value, label) values
  ('timezone', 'UTC',
   'Fuseau horaire des agences — À RÉGLER (ex. Africa/Maseru). Tant que la valeur est UTC, l''application affiche un avertissement.'),
  ('edit_window_minutes', '120',
   'Fenêtre de modification après l''heure de départ, en minutes.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Référentiels
-- ---------------------------------------------------------------------------
create table public.agences (
  id    serial primary key,
  code  char(4) not null unique,
  nom   text not null,
  ville text not null default '',
  actif boolean not null default true
);

create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nom        text not null,
  role       text not null default 'AGENCE'
             check (role in ('AGENCE', 'REGULATION', 'DIRECTION')),
  agence_id  int references public.agences(id),
  actif      boolean not null default true,
  created_at timestamptz not null default now(),
  constraint ck_profil_agence check (role <> 'AGENCE' or agence_id is not null)
);

create table public.axes (
  id    serial primary key,
  nom   text not null unique,
  sens  text not null default 'AUCUN' check (sens in ('NORD', 'SUD', 'AUCUN')),
  type  text not null default 'AXE' check (type in ('AXE', 'LOCATION')),
  actif boolean not null default true
);

-- L'ordre des agences *est* l'itinéraire.
create table public.axe_agences (
  axe_id    int not null references public.axes(id) on delete cascade,
  agence_id int not null references public.agences(id) on delete restrict,
  position  smallint not null check (position >= 0),
  primary key (axe_id, position),
  unique (axe_id, agence_id)
);

create table public.vehicules (
  id     serial primary key,
  immat  text not null unique,
  marque text not null default '',
  type   text not null default '',
  places smallint not null check (places > 0),
  actif  boolean not null default true
);

create table public.agents (
  id        serial primary key,
  nom       text not null,
  fonction  text not null check (fonction in ('CHAUFFEUR', 'CONVOYEUR', 'CHEF_PISTE')),
  agence_id int references public.agences(id),
  actif     boolean not null default true,
  unique (nom, fonction)
);

-- ---------------------------------------------------------------------------
-- Départs
-- ---------------------------------------------------------------------------
create table public.departures (
  id              bigserial primary key,
  uuid            uuid not null default gen_random_uuid() unique,
  date_service    date not null,
  agence_id       int not null references public.agences(id),
  axe_id          int not null references public.axes(id),
  programme       text not null
                  check (programme in ('DEBUT', 'SUITE', 'FIN', 'DEBUT_FIN')),
  provenance_id   int not null references public.agences(id),
  destination_id  int not null references public.agences(id),
  vehicule_id     int not null references public.vehicules(id),
  -- capacité figée à la saisie : modifier le parc demain ne réécrit pas l'historique
  places_snapshot smallint not null check (places_snapshot > 0),
  bordereau       text not null check (btrim(bordereau) <> ''),
  h_arrivee       time,
  h_depart        time not null,
  eff_arrivee     smallint not null default 0 check (eff_arrivee >= 0),
  eff_complete    smallint not null check (eff_complete >= 0),
  statut          text not null default 'ACTIF' check (statut in ('ACTIF', 'ANNULE')),
  motif_annulation text,
  modifie_count   smallint not null default 0,
  created_by      uuid not null default auth.uid() references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- taux « agence » : celui affiché aujourd'hui dans l'application
  dispo smallint generated always as
    (greatest(places_snapshot - eff_arrivee, 0)) stored,
  taux_agence numeric(6,4) generated always as (
    case when places_snapshot > eff_arrivee
         then round(eff_complete::numeric / (places_snapshot - eff_arrivee), 4)
    end) stored,
  -- taux « véhicule » : le car est-il plein, indépendamment de l'agence ?
  taux_vehicule numeric(6,4) generated always as (
    round((eff_arrivee + eff_complete)::numeric / nullif(places_snapshot, 0), 4)) stored,

  constraint uk_bordereau_jour unique (date_service, agence_id, bordereau)
);

create index idx_dep_jour on public.departures (date_service, agence_id);
create index idx_dep_axe  on public.departures (date_service, axe_id);

create table public.departure_passagers (
  departure_id bigint not null references public.departures(id) on delete cascade,
  agence_id    int not null references public.agences(id),
  n            smallint not null check (n >= 0),
  primary key (departure_id, agence_id)
);

create table public.departure_crew (
  departure_id bigint not null references public.departures(id) on delete cascade,
  role         text not null check (role in ('CHAUFFEUR', 'CONVOYEUR', 'CHEF_PISTE')),
  agent_id     int references public.agents(id),
  nom          text not null,
  primary key (departure_id, role)
);

-- ---------------------------------------------------------------------------
-- Traçabilité et rapports
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id          bigserial primary key,
  user_id     uuid,
  action      text not null,
  entity      text not null,
  entity_id   bigint,
  before_json jsonb,
  after_json  jsonb,
  at          timestamptz not null default now()
);

create index idx_audit_entity on public.audit_log (entity, entity_id);
create index idx_audit_at     on public.audit_log (at desc);

create table public.reports (
  id           bigserial primary key,
  date_service date not null,
  canal        text not null check (canal in ('EMAIL', 'WHATSAPP', 'PDF')),
  destinataires text,
  payload_json jsonb not null,
  statut       text not null default 'OK' check (statut in ('OK', 'ERREUR')),
  sent_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Fonctions utilitaires
-- ---------------------------------------------------------------------------
create or replace function public.app_tz() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.settings where key = 'timezone'), 'UTC')
$$;

create or replace function public.today_service() returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone public.app_tz())::date
$$;

create or replace function public.edit_window_minutes() returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select value::int from public.settings where key = 'edit_window_minutes'), 120)
$$;

create or replace function public.departure_limite(p_date date, p_dep time)
returns timestamptz
language sql stable security definer set search_path = public as $$
  select ((p_date + p_dep) at time zone public.app_tz())
         + make_interval(mins => public.edit_window_minutes())
$$;

-- Agence et rôle de l'appelant. SECURITY DEFINER : ces fonctions lisent profiles
-- sans repasser par sa policy RLS (sinon récursion infinie).
create or replace function public.my_agence() returns int
language sql stable security definer set search_path = public as $$
  select agence_id from public.profiles where id = auth.uid()
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Contrôles d'intégrité (côté base, pas côté navigateur)
-- ---------------------------------------------------------------------------
create or replace function public.assert_route(
  p_axe int, p_agence int, p_prov int, p_dest int
) returns void
language plpgsql stable security definer set search_path = public as $$
declare
  v_ag   smallint;
  v_prov smallint;
  v_dest smallint;
begin
  select position into v_ag   from public.axe_agences where axe_id = p_axe and agence_id = p_agence;
  select position into v_prov from public.axe_agences where axe_id = p_axe and agence_id = p_prov;
  select position into v_dest from public.axe_agences where axe_id = p_axe and agence_id = p_dest;

  if v_ag is null then
    raise exception 'Cette agence n''est pas sur la ligne choisie' using errcode = 'P0001';
  end if;
  if v_prov is null or v_dest is null then
    raise exception 'Provenance ou destination hors de cette ligne' using errcode = 'P0001';
  end if;
  if not (v_prov <= v_ag and v_ag < v_dest) then
    raise exception 'Itinéraire incohérent : la provenance doit précéder l''agence, la destination doit suivre'
      using errcode = 'P0001';
  end if;
end $$;

create or replace function public.departures_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select v.places into new.places_snapshot
  from public.vehicules v
  where v.id = new.vehicule_id and v.actif;

  if new.places_snapshot is null then
    raise exception 'Immatriculation inconnue dans le parc' using errcode = 'P0001';
  end if;

  new.date_service := coalesce(new.date_service, public.today_service());

  if public.my_role() = 'AGENCE' and new.date_service <> public.today_service() then
    raise exception 'Une agence ne peut déclarer que les départs du jour' using errcode = 'P0001';
  end if;

  perform public.assert_route(new.axe_id, new.agence_id, new.provenance_id, new.destination_id);
  return new;
end $$;

create trigger trg_departures_before_insert
before insert on public.departures
for each row execute function public.departures_before_insert();

create or replace function public.departures_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.my_role();
begin
  if new.created_by <> old.created_by then
    raise exception 'Le déclarant d''un départ est immuable' using errcode = 'P0001';
  end if;

  if new.date_service <> old.date_service or new.agence_id <> old.agence_id then
    if v_role not in ('REGULATION', 'DIRECTION') then
      raise exception 'Un départ ne peut pas changer de date ni d''agence' using errcode = 'P0001';
    end if;
  end if;

  if old.statut = 'ANNULE' and new.statut <> 'ANNULE' and v_role <> 'DIRECTION' then
    raise exception 'Un départ annulé ne peut pas être réactivé' using errcode = 'P0001';
  end if;

  if v_role = 'AGENCE'
     and now() >= public.departure_limite(old.date_service, old.h_depart) then
    raise exception 'Délai de modification dépassé' using errcode = 'P0001';
  end if;

  -- la capacité reste celle du jour de la déclaration
  new.places_snapshot := old.places_snapshot;
  new.modifie_count   := old.modifie_count + 1;
  new.updated_at      := now();

  if new.axe_id <> old.axe_id
     or new.provenance_id <> old.provenance_id
     or new.destination_id <> old.destination_id then
    perform public.assert_route(new.axe_id, new.agence_id, new.provenance_id, new.destination_id);
  end if;

  return new;
end $$;

create trigger trg_departures_guard
before update on public.departures
for each row execute function public.departures_guard();

create or replace function public.audit_departures() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (user_id, action, entity, entity_id, before_json, after_json)
  values (
    auth.uid(),
    lower(tg_op),
    'departures',
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;

create trigger trg_audit_departures
after insert or update on public.departures
for each row execute function public.audit_departures();

-- ---------------------------------------------------------------------------
-- Vues de lecture (security_invoker : les policies RLS s'appliquent !)
-- ---------------------------------------------------------------------------
create view public.v_departures with (security_invoker = true) as
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
  d.updated_at
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

create view public.v_kpis_jour with (security_invoker = true) as
select
  date_service,
  count(*) filter (where statut = 'ACTIF')  as departs,
  count(*) filter (where statut = 'ANNULE') as annules,
  coalesce(sum(eff_arrivee + eff_complete) filter (where statut = 'ACTIF'), 0) as passagers,
  round(
    sum(eff_complete) filter (where statut = 'ACTIF')::numeric
    / nullif(sum(places_snapshot - eff_arrivee) filter (where statut = 'ACTIF'), 0)
  , 4) as taux_agence,
  round(
    sum(eff_arrivee + eff_complete) filter (where statut = 'ACTIF')::numeric
    / nullif(sum(places_snapshot) filter (where statut = 'ACTIF'), 0)
  , 4) as taux_vehicule
from public.departures
group by date_service;

create view public.v_kpis_agence_jour with (security_invoker = true) as
select
  d.date_service,
  d.agence_id,
  a.nom as agence,
  count(*) filter (where d.statut = 'ACTIF') as departs,
  coalesce(sum(d.eff_arrivee + d.eff_complete) filter (where d.statut = 'ACTIF'), 0) as passagers,
  round(
    sum(d.eff_complete) filter (where d.statut = 'ACTIF')::numeric
    / nullif(sum(d.places_snapshot - d.eff_arrivee) filter (where d.statut = 'ACTIF'), 0)
  , 4) as taux_agence
from public.departures d
join public.agences a on a.id = d.agence_id
group by d.date_service, d.agence_id, a.nom;
