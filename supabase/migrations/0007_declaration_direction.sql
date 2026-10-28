-- FlowTrax — 0007 : la direction et la régulation déclarent pour une agence
--
-- 0002 n'ouvrait l'insertion qu'au rôle AGENCE, sur sa propre agence
-- (`dep_insert`, 0002:61-66). Une direction ne pouvait donc pas saisir un
-- départ pour le compte d'une agence, même en connaissant l'URL de la page.
--
-- Ce lot n'ouvre que l'INSERTION. La lecture et la modification étaient déjà
-- permises aux deux rôles (dep_read, dep_update), et les tables filles
-- (passagers, équipage) les acceptent sans fenêtre de modification — c'est
-- précisément ce qui rend la saisie pour autrui possible de bout en bout.
--
-- Ce qui reste verrouillé, et doit le rester :
--   * `created_by = auth.uid()` : on signe ce qu'on écrit, quel que soit le rôle ;
--   * une agence ne peut toujours écrire que chez elle ;
--   * `departures_guard` (0001:246) continue d'interdire à une agence de
--     déclarer une autre date que le jour de service. La direction, elle, peut
--     rattraper une journée passée — c'est le sens de ce lot.

drop policy if exists dep_insert on public.departures;

create policy dep_insert on public.departures for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.my_role() in ('DIRECTION', 'REGULATION')
      or (public.my_role() = 'AGENCE' and agence_id = public.my_agence())
    )
  );

-- Contrôle : attendu « true | true | true | true » sur la première ligne
select
  position('DIRECTION' in with_check) > 0  as autorise_direction,
  position('REGULATION' in with_check) > 0 as autorise_regulation,
  position('my_agence' in with_check) > 0   as agence_limitee_a_la_sienne,
  position('created_by' in with_check) > 0  as auteur_obligatoire,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'departures'
  and policyname = 'dep_insert';
