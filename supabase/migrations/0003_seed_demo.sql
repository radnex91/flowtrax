-- FlowTrax — 0003 : jeu de données de DÉMONSTRATION
--
-- ⚠️  À remplacer par le référentiel réel (export getConfig de l'application actuelle).
--     Les agences, lignes et véhicules ci-dessous sont inventés pour que l'écran
--     de saisie soit utilisable immédiatement.
--
-- Pour tout supprimer après import du vrai référentiel :
--   truncate public.departure_passagers, public.departure_crew, public.departures,
--            public.axe_agences, public.axes, public.vehicules, public.agents,
--            public.agences restart identity cascade;

insert into public.agences (code, nom, ville) values
  ('AG01', 'Agence Centrale', 'Centre'),
  ('AG02', 'Agence Nord',     'Nord'),
  ('AG03', 'Agence Sud',      'Sud')
on conflict (code) do nothing;

insert into public.axes (nom, sens, type) values
  ('NORD 1', 'NORD', 'AXE'),
  ('SUD 1',  'SUD',  'AXE')
on conflict (nom) do nothing;

-- L'ordre définit l'itinéraire : Centrale → Nord → Sud.
insert into public.axe_agences (axe_id, agence_id, position)
select a.id, g.id, v.position
from (values
  ('NORD 1', 'AG01', 0), ('NORD 1', 'AG02', 1), ('NORD 1', 'AG03', 2),
  ('SUD 1',  'AG01', 0), ('SUD 1',  'AG02', 1), ('SUD 1',  'AG03', 2)
) as v(axe, code, position)
join public.axes a    on a.nom = v.axe
join public.agences g on g.code = v.code
on conflict do nothing;

insert into public.vehicules (immat, marque, type, places) values
  ('LT0171HE', 'Toyota',  'Autocar', 62),
  ('LT0182HA', 'Toyota',  'Minibus', 30),
  ('LT0190HB', 'Mercedes', 'Autocar', 70),
  ('LT0201HC', 'Iveco',   'Autocar', 45)
on conflict (immat) do nothing;

insert into public.agents (nom, fonction, agence_id)
select v.nom, v.fonction, g.id
from (values
  ('Chauffeur Démo 1', 'CHAUFFEUR',   'AG01'),
  ('Chauffeur Démo 2', 'CHAUFFEUR',   'AG02'),
  ('Convoyeur Démo 1', 'CONVOYEUR',   'AG01'),
  ('Chef de piste Démo 1', 'CHEF_PISTE', 'AG01')
) as v(nom, fonction, code)
join public.agences g on g.code = v.code
on conflict (nom, fonction) do nothing;

-- ---------------------------------------------------------------------------
-- Comptes utilisateurs — à créer depuis Supabase Studio
-- ---------------------------------------------------------------------------
-- L'application n'a pas d'écran d'inscription : les comptes sont créés par la
-- direction. Marche à suivre :
--
--  1. Authentication → Users → « Add user » (email + mot de passe,
--     cocher « Auto Confirm User » pour éviter l'email de confirmation).
--  2. Copier l'UUID du compte, puis exécuter :
--
--     insert into public.profiles (id, nom, role, agence_id)
--     values ('<uuid>', 'Nom Prénom', 'AGENCE',
--             (select id from public.agences where code = 'AG01'));
--
-- Rôles : 'AGENCE' (saisie), 'REGULATION' (toutes les agences),
--         'DIRECTION' (dashboard + référentiels).
--
--  3. Régler le fuseau horaire, sinon fenêtre de modification et « aujourd'hui »
--     sont calculés en UTC :
--
--     update public.settings set value = 'Africa/Maseru', updated_at = now()
--     where key = 'timezone';
