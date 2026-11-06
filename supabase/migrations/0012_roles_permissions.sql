-- ---------------------------------------------------------------------------
-- 0012 — rôles et permissions
--
-- Jusqu'ici, le rôle d'un compte était une valeur fermée (AGENCE, REGULATION,
-- DIRECTION) et chaque policy RLS comparait son nom en dur. Ajouter un
-- « guichet » ou retirer le droit d'annuler demandait une migration.
--
-- Deux tables portent désormais la règle :
--   roles        — un code stable + un libellé libre. Les trois rôles d'hier
--                  sont semés pour que les comptes existants gardent leurs
--                  droits, et l'écran Administration → Rôles en crée d'autres.
--   permissions  — le catalogue des actions métier (lire, déclarer, annuler…).
--   role_permissions — la matrice rôle × permission.
--
-- Les policies et les gardes (triggers) n'écrivent plus de nom de rôle : elles
-- appellent public.a_permission('…'), qui lit le profil connecté, son rôle et
-- la matrice. Un compte désactivé, un rôle désactivé ou une permission retirée
-- prennent effet au chargement suivant, sans redéploiement.
--
-- Le rôle DIRECTION reste un garde-fou : il ne peut pas être supprimé, ni
-- désactivé, ni perdre « admin.roles » — sinon plus personne ne pourrait
-- rouvrir la matrice depuis l'application.
--
-- Rejouable : chaque étape se rejoue sans erreur. Les droits par défaut ne
-- sont semés que pour un rôle qui n'a encore aucune ligne (un second passage
-- ne réécrit donc pas une matrice déjà réglée à la main).
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. Les deux référentiels
-- ---------------------------------------------------------------------------
create table if not exists public.roles (
  code        text primary key check (code = upper(btrim(code)) and btrim(code) <> ''),
  libelle     text not null check (btrim(libelle) <> ''),
  description text not null default '',
  systeme     boolean not null default false,
  actif       boolean not null default true,
  ordre       smallint not null default 100
);

comment on table public.roles is
  'Rôles attribuables à un compte ; profiles.role référence code.';

insert into public.roles (code, libelle, description, systeme, ordre) values
  ('AGENCE',     'Agence',     'Saisit les départs de son agence, dans le délai.', true, 10),
  ('REGULATION', 'Régulation', 'Suit et corrige les départs de toutes les agences.', true, 20),
  ('DIRECTION',  'Direction',  'Tous les droits, y compris l''administration.', true, 30)
on conflict (code) do nothing;

create table if not exists public.permissions (
  code    text primary key check (code = lower(btrim(code)) and btrim(code) <> ''),
  libelle text not null check (btrim(libelle) <> ''),
  module  text not null,
  ordre   smallint not null default 100
);

comment on table public.permissions is
  'Catalogue des actions ; le code est stable, le libellé est affiché.';

insert into public.permissions (code, libelle, module, ordre) values
  ('depart.lire',           'Voir les départs de son agence',                        'Départs',        10),
  ('depart.lire_tout',      'Voir les départs de toutes les agences',                'Départs',        20),
  ('depart.declarer',       'Déclarer un départ pour son agence',                    'Départs',        30),
  ('depart.declarer_tout',  'Déclarer pour n''importe quelle agence et n''importe quel jour', 'Départs', 40),
  ('depart.modifier',       'Modifier un départ dans le délai',                      'Départs',        50),
  ('depart.modifier_tout',  'Modifier hors délai, changer la date ou l''agence',     'Départs',        60),
  ('depart.annuler',        'Annuler un départ',                                     'Départs',        70),
  ('depart.reactiver',      'Réactiver un départ annulé',                            'Départs',        80),
  ('dashboard.lire',        'Ouvrir le tableau de bord',                             'Écrans',         10),
  ('rapports.lire',         'Ouvrir les rapports',                                   'Écrans',         20),
  ('admin.acces',           'Ouvrir l''administration',                              'Administration', 10),
  ('admin.referentiels',    'Gérer agences, lignes, parc, fonctions, utilisateurs, réglages et apparence', 'Administration', 20),
  ('admin.comptes',         'Gérer les comptes de connexion',                        'Administration', 30),
  ('admin.roles',           'Gérer les rôles et leurs permissions',                  'Administration', 40)
on conflict (code) do nothing;

create table if not exists public.role_permissions (
  role       text not null references public.roles (code) on update cascade on delete cascade,
  permission text not null references public.permissions (code) on update cascade on delete cascade,
  primary key (role, permission)
);

comment on table public.role_permissions is
  'Matrice rôle × permission : c''est elle que lisent les policies RLS.';

-- Droits par défaut : ceux d'avant 0012. Semés une seule fois par rôle, pour
-- qu'un second passage de cette migration ne rétablisse pas un droit retiré.
insert into public.role_permissions (role, permission)
select v.role, v.permission
from (values
  -- AGENCE : son agence, dans le délai
  ('AGENCE',     'depart.lire'),
  ('AGENCE',     'depart.declarer'),
  ('AGENCE',     'depart.modifier'),
  ('AGENCE',     'depart.annuler'),
  -- REGULATION : lecture de tout, correction sans délai, pas d'administration
  ('REGULATION', 'depart.lire'),
  ('REGULATION', 'depart.lire_tout'),
  ('REGULATION', 'depart.declarer'),
  ('REGULATION', 'depart.declarer_tout'),
  ('REGULATION', 'depart.modifier'),
  ('REGULATION', 'depart.modifier_tout'),
  ('REGULATION', 'depart.annuler'),
  ('REGULATION', 'dashboard.lire'),
  ('REGULATION', 'rapports.lire'),
  -- DIRECTION : tout
  ('DIRECTION',  'depart.lire'),
  ('DIRECTION',  'depart.lire_tout'),
  ('DIRECTION',  'depart.declarer'),
  ('DIRECTION',  'depart.declarer_tout'),
  ('DIRECTION',  'depart.modifier'),
  ('DIRECTION',  'depart.modifier_tout'),
  ('DIRECTION',  'depart.annuler'),
  ('DIRECTION',  'depart.reactiver'),
  ('DIRECTION',  'dashboard.lire'),
  ('DIRECTION',  'rapports.lire'),
  ('DIRECTION',  'admin.acces'),
  ('DIRECTION',  'admin.referentiels'),
  ('DIRECTION',  'admin.comptes'),
  ('DIRECTION',  'admin.roles')
) as v(role, permission)
where not exists (
  select 1 from public.role_permissions rp where rp.role = v.role
)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. profiles.role devient une clé étrangère
-- La contrainte de liste fermée de 0001 porte un nom engendré : on la retrouve
-- par sa définition (la garde d'agence, qui parle aussi de role, mentionne
-- agence_id et reste en place).
-- ---------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
      and pg_get_constraintdef(oid) not ilike '%agence_id%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.profiles drop constraint if exists profiles_role_fk;
alter table public.profiles
  add constraint profiles_role_fk foreign key (role)
  references public.roles (code) on update cascade on delete restrict;

-- ---------------------------------------------------------------------------
-- 3. Lecture des droits de l'appelant
-- SECURITY DEFINER : ces fonctions lisent profiles et role_permissions sans
-- repasser par leur RLS (sinon récursion). Un compte ou un rôle désactivé ne
-- rend aucune permission.
-- ---------------------------------------------------------------------------
create or replace function public.mes_permissions() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(rp.permission order by rp.permission), '{}'::text[])
  from public.profiles p
  join public.roles r on r.code = p.role and r.actif
  join public.role_permissions rp on rp.role = r.code
  where p.id = auth.uid() and p.actif
$$;

create or replace function public.a_permission(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_code = any (public.mes_permissions()), false)
$$;

grant execute on function public.mes_permissions() to authenticated;
grant execute on function public.a_permission(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Garde-fous : on ne se coupe pas soi-même du droit de rouvrir la matrice
-- ---------------------------------------------------------------------------
create or replace function public.role_permissions_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'DIRECTION' and old.permission = 'admin.roles' then
    raise exception 'La direction ne peut pas perdre « Rôles et permissions » : plus personne ne pourrait les rouvrir'
      using errcode = 'P0001';
  end if;
  return old;
end $$;

drop trigger if exists role_permissions_guard on public.role_permissions;
create trigger role_permissions_guard before delete or update on public.role_permissions
  for each row execute function public.role_permissions_guard();

create or replace function public.roles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.code = 'DIRECTION' then
    if tg_op = 'DELETE' then
      raise exception 'Le rôle Direction ne peut être ni supprimé ni désactivé' using errcode = 'P0001';
    end if;
    if not new.actif then
      raise exception 'Le rôle Direction ne peut être ni supprimé ni désactivé' using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists roles_guard on public.roles;
create trigger roles_guard before update or delete on public.roles
  for each row execute function public.roles_guard();

-- Le profil : un rôle qui travaille sur une seule agence exige un rattachement,
-- et le dernier compte capable de gérer les rôles ne peut pas être rétrogradé
-- ni désactivé. (0004 ne surveillait que le compte connecté lui-même.)
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.id = auth.uid() then
    if new.role <> old.role then
      raise exception 'Vous ne pouvez pas modifier votre propre rôle' using errcode = 'P0001';
    end if;
    if new.actif <> old.actif then
      raise exception 'Vous ne pouvez pas désactiver votre propre compte' using errcode = 'P0001';
    end if;
  end if;

  if new.agence_id is null
     and exists (
       select 1 from public.role_permissions rp
       where rp.role = new.role
         and rp.permission in ('depart.lire', 'depart.declarer', 'depart.modifier', 'depart.annuler')
     )
     and not exists (
       select 1 from public.role_permissions rp
       where rp.role = new.role
         and rp.permission in ('depart.lire_tout', 'depart.declarer_tout')
     ) then
    raise exception 'Ce rôle travaille sur une seule agence : rattachez le compte à une agence'
      using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' and (new.actif = false or new.role <> old.role) then
    if exists (
         select 1 from public.role_permissions rp
         where rp.role = old.role and rp.permission = 'admin.roles'
       )
       and not exists (
         select 1
         from public.profiles p
         join public.roles r on r.code = p.role and r.actif
         join public.role_permissions rp on rp.role = p.role
         where p.id <> old.id and p.actif and rp.permission = 'admin.roles'
       ) then
      raise exception 'C''est le dernier compte qui peut gérer les rôles : gardez-en un autre actif avant'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before insert or update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------------
-- 5. Écriture d'une matrice en une seule instruction
-- Supprimer puis réinsérer est atomique ; on ne supprime que ce qui sort de la
-- nouvelle liste, sinon retirer « admin.roles » à la direction déclencherait
-- la garde à chaque enregistrement alors qu'il est conservé.
-- ---------------------------------------------------------------------------
create or replace function public.set_role_permissions(p_role text, p_permissions text[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inconnues text[];
begin
  if not exists (select 1 from public.roles where code = p_role) then
    raise exception 'Rôle inconnu' using errcode = 'P0001';
  end if;

  select array_agg(x) into v_inconnues
  from unnest(coalesce(p_permissions, '{}'::text[])) as x
  where not exists (select 1 from public.permissions p where p.code = x);

  if v_inconnues is not null then
    raise exception 'Permission inconnue : %', array_to_string(v_inconnues, ', ')
      using errcode = 'P0001';
  end if;

  delete from public.role_permissions
  where role = p_role
    and permission <> all (coalesce(p_permissions, '{}'::text[]));

  insert into public.role_permissions (role, permission)
  select p_role, x from unnest(coalesce(p_permissions, '{}'::text[])) as x
  on conflict do nothing;
end $$;

grant execute on function public.set_role_permissions(text, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RLS des nouveaux référentiels
-- ---------------------------------------------------------------------------
alter table public.roles            enable row level security;
alter table public.permissions      enable row level security;
alter table public.role_permissions enable row level security;

drop policy if exists roles_read on public.roles;
drop policy if exists roles_write on public.roles;
create policy roles_read on public.roles for select to authenticated using (true);
create policy roles_write on public.roles for all to authenticated
  using (public.a_permission('admin.roles')) with check (public.a_permission('admin.roles'));

drop policy if exists permissions_read on public.permissions;
create policy permissions_read on public.permissions for select to authenticated using (true);

drop policy if exists role_permissions_read on public.role_permissions;
drop policy if exists role_permissions_write on public.role_permissions;
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (public.a_permission('admin.roles')) with check (public.a_permission('admin.roles'));

grant select on public.roles, public.permissions, public.role_permissions to authenticated;
grant insert, update, delete on public.roles to authenticated;
grant insert, update, delete on public.role_permissions to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Les référentiels s'écrivent avec « admin.referentiels », plus « DIRECTION »
-- ---------------------------------------------------------------------------
drop policy if exists agences_write on public.agences;
create policy agences_write on public.agences for all to authenticated
  using (public.a_permission('admin.referentiels')) with check (public.a_permission('admin.referentiels'));

drop policy if exists axes_write on public.axes;
create policy axes_write on public.axes for all to authenticated
  using (public.a_permission('admin.referentiels')) with check (public.a_permission('admin.referentiels'));

drop policy if exists axe_agences_write on public.axe_agences;
create policy axe_agences_write on public.axe_agences for all to authenticated
  using (public.a_permission('admin.referentiels')) with check (public.a_permission('admin.referentiels'));

drop policy if exists vehicules_write on public.vehicules;
create policy vehicules_write on public.vehicules for all to authenticated
  using (public.a_permission('admin.referentiels')) with check (public.a_permission('admin.referentiels'));

drop policy if exists agents_write on public.agents;
create policy agents_write on public.agents for all to authenticated
  using (public.a_permission('admin.referentiels')) with check (public.a_permission('admin.referentiels'));

drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings for all to authenticated
  using (public.a_permission('admin.referentiels')) with check (public.a_permission('admin.referentiels'));

drop policy if exists sens_write on public.sens;
create policy sens_write on public.sens for all to authenticated
  using (public.a_permission('admin.referentiels')) with check (public.a_permission('admin.referentiels'));

drop policy if exists fonctions_write on public.fonctions;
create policy fonctions_write on public.fonctions for all to authenticated
  using (public.a_permission('admin.referentiels')) with check (public.a_permission('admin.referentiels'));

-- ---------------------------------------------------------------------------
-- 8. Profils : soi-même, ou qui gère les comptes / les rôles.
-- La lecture par « depart.lire_tout » est nécessaire : la vue v_departures
-- joint le nom du déclarant, et la vue est security_invoker.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.a_permission('admin.comptes')
    or public.a_permission('admin.roles')
    or public.a_permission('depart.lire_tout')
  );

drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for all to authenticated
  using (public.a_permission('admin.comptes')) with check (public.a_permission('admin.comptes'));

-- ---------------------------------------------------------------------------
-- 9. Départs : lecture, déclaration, modification
-- La policy dit quelles lignes on peut toucher ; le trigger departures_guard
-- dit, colonne par colonne, quelle action est permise (annuler, réactiver,
-- replanifier, modifier).
-- ---------------------------------------------------------------------------
drop policy if exists dep_read on public.departures;
create policy dep_read on public.departures for select to authenticated
  using (
    public.a_permission('depart.lire_tout')
    or (public.a_permission('depart.lire') and agence_id = public.my_agence())
  );

drop policy if exists dep_insert on public.departures;
create policy dep_insert on public.departures for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.a_permission('depart.declarer_tout')
      or (public.a_permission('depart.declarer') and agence_id = public.my_agence())
    )
  );

drop policy if exists dep_update on public.departures;
create policy dep_update on public.departures for update to authenticated
  using (
    public.a_permission('depart.modifier_tout')
    or (
      public.a_permission('depart.reactiver')
      and (public.a_permission('depart.lire_tout') or agence_id = public.my_agence())
    )
    or (
      agence_id = public.my_agence()
      and (public.a_permission('depart.modifier') or public.a_permission('depart.annuler'))
    )
  )
  with check (
    public.a_permission('depart.modifier_tout')
    or agence_id = public.my_agence()
  );

-- ---------------------------------------------------------------------------
-- 10. Lignes filles : même portée que le parent
-- ---------------------------------------------------------------------------
drop policy if exists passagers_all on public.departure_passagers;
create policy passagers_all on public.departure_passagers for all to authenticated
  using (
    exists (
      select 1 from public.departures d
      where d.id = departure_id
        and (
          public.a_permission('depart.modifier_tout')
          or (d.agence_id = public.my_agence()
              and (public.a_permission('depart.declarer') or public.a_permission('depart.modifier'))
              and now() < public.departure_limite(d.date_service, d.h_depart))
        )
    )
  )
  with check (
    exists (
      select 1 from public.departures d
      where d.id = departure_id
        and (
          public.a_permission('depart.modifier_tout')
          or (d.agence_id = public.my_agence()
              and (public.a_permission('depart.declarer') or public.a_permission('depart.modifier'))
              and now() < public.departure_limite(d.date_service, d.h_depart))
        )
    )
  );

drop policy if exists crew_all on public.departure_crew;
create policy crew_all on public.departure_crew for all to authenticated
  using (
    exists (
      select 1 from public.departures d
      where d.id = departure_id
        and (
          public.a_permission('depart.modifier_tout')
          or (d.agence_id = public.my_agence()
              and (public.a_permission('depart.declarer') or public.a_permission('depart.modifier'))
              and now() < public.departure_limite(d.date_service, d.h_depart))
        )
    )
  )
  with check (
    exists (
      select 1 from public.departures d
      where d.id = departure_id
        and (
          public.a_permission('depart.modifier_tout')
          or (d.agence_id = public.my_agence()
              and (public.a_permission('depart.declarer') or public.a_permission('depart.modifier'))
              and now() < public.departure_limite(d.date_service, d.h_depart))
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 11. Journal et rapports
-- ---------------------------------------------------------------------------
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated
  using (
    public.a_permission('depart.lire_tout')
    or (
      public.a_permission('depart.lire')
      and exists (
        select 1 from public.departures d
        where d.id = audit_log.entity_id
          and audit_log.entity = 'departures'
          and d.agence_id = public.my_agence()
      )
    )
  );

drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports for select to authenticated
  using (public.a_permission('rapports.lire'));

-- ---------------------------------------------------------------------------
-- 12. Déclaration : même règle qu'avant, mais lue dans la matrice
-- ---------------------------------------------------------------------------
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

  if not public.a_permission('depart.declarer_tout') then
    if not (public.a_permission('depart.declarer') and new.agence_id = public.my_agence()) then
      raise exception 'Vous ne pouvez pas déclarer un départ pour cette agence' using errcode = 'P0001';
    end if;
    if new.date_service <> public.today_service() then
      raise exception 'Une agence ne peut déclarer que les départs du jour' using errcode = 'P0001';
    end if;
  end if;

  perform public.assert_route(new.axe_id, new.agence_id, new.provenance_id, new.destination_id);
  return new;
end $$;

drop trigger if exists trg_departures_before_insert on public.departures;
create trigger trg_departures_before_insert
before insert on public.departures
for each row execute function public.departures_before_insert();

-- ---------------------------------------------------------------------------
-- 13. Modification : chaque action a sa permission
-- Le délai reste la règle par défaut ; « depart.modifier_tout » l'emporte.
-- Une réactivation pure (statut seul) échappe au délai : elle ne réécrit pas
-- les chiffres du départ.
-- ---------------------------------------------------------------------------
create or replace function public.departures_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_champs text[];
  v_edit   text[];
begin
  if new.created_by <> old.created_by then
    raise exception 'Le déclarant d''un départ est immuable' using errcode = 'P0001';
  end if;

  if new.date_service <> old.date_service or new.agence_id <> old.agence_id then
    if not public.a_permission('depart.modifier_tout') then
      raise exception 'Un départ ne peut pas changer de date ni d''agence' using errcode = 'P0001';
    end if;
  end if;

  if old.statut = 'ANNULE' and new.statut <> 'ANNULE'
     and not public.a_permission('depart.reactiver') then
    raise exception 'Vous n''êtes pas autorisé à réactiver un départ annulé' using errcode = 'P0001';
  end if;

  if old.statut = 'ACTIF' and new.statut = 'ANNULE'
     and not public.a_permission('depart.annuler') then
    raise exception 'Vous n''êtes pas autorisé à annuler un départ' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(k), '{}') into v_champs
  from jsonb_object_keys(to_jsonb(new)) as k
  where k not in ('modifie_count', 'updated_at', 'places_snapshot')
    and (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k);

  v_edit := v_champs - array['statut', 'motif_annulation'];

  if v_edit <> '{}'
     and not (public.a_permission('depart.modifier') or public.a_permission('depart.modifier_tout')) then
    raise exception 'Vous n''êtes pas autorisé à modifier un départ' using errcode = 'P0001';
  end if;

  if not public.a_permission('depart.modifier_tout')
     and not (old.statut = 'ANNULE' and new.statut = 'ACTIF')
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

drop trigger if exists trg_departures_guard on public.departures;
create trigger trg_departures_guard
before update on public.departures
for each row execute function public.departures_guard();

commit;

-- Contrôle : une seule cellule qui nomme ses valeurs — attendu
-- « rôles=3 permissions=14 liens=27 clé_role=1 policies=6 ».
-- Nommée plutôt que positionnelle : une suite « 3 14 27 1 6 » revient parfois
-- sans séparateurs et ne dit plus quel chiffre est lequel.
select format('rôles=%s permissions=%s liens=%s clé_role=%s policies=%s',
  (select count(*) from public.roles),
  (select count(*) from public.permissions),
  (select count(*) from public.role_permissions),
  (select count(*) from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_role_fk'),
  (select count(*) from pg_policies
    where schemaname = 'public'
      and policyname in ('roles_read', 'roles_write', 'permissions_read',
                         'role_permissions_read', 'role_permissions_write',
                         'settings_read_public'))
) as controle;
