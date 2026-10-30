-- FlowTrax — import du référentiel Danay
-- Source : Danay_Departs_Base_1.xlsx (feuilles AGENCES et AXES), 2026-10-30.
-- 21 agences, 16 lignes, 121 arrêts. Les noms sont repris verbatim.
-- Rejouable : réimporter met à jour, ne duplique pas.
-- La feuille ne porte ni ville ni responsable : la ville est laissée vide,
-- à remplir depuis Administration → Agences.

begin;

-- 1. Référentiel de démonstration de 0003 ------------------------------------
delete from public.departures d
 where d.agence_id      in (select id from public.agences   where code in ('AG01','AG02','AG03'))
    or d.provenance_id  in (select id from public.agences   where code in ('AG01','AG02','AG03'))
    or d.destination_id in (select id from public.agences   where code in ('AG01','AG02','AG03'))
    or d.vehicule_id    in (select id from public.vehicules where immat in ('LT0171HE','LT0182HA','LT0190HB','LT0201HC'));

delete from public.axe_agences
 where axe_id in (select id from public.axes where nom in ('NORD 1', 'SUD 1'));
delete from public.axes     where nom in ('NORD 1', 'SUD 1');
delete from public.vehicules where immat in ('LT0171HE','LT0182HA','LT0190HB','LT0201HC');
delete from public.agents    where nom in ('Chauffeur Démo 1','Chauffeur Démo 2','Convoyeur Démo 1','Chef de piste Démo 1');

-- Une agence encore portée par un profil utilisateur n'est pas supprimée :
-- la suppression lèverait 23503 et arrêterait tout le script.
do $$
begin
  delete from public.agences where code in ('AG01','AG02','AG03');
exception when foreign_key_violation then
  raise notice 'Agences de démonstration conservées : un profil utilisateur y est encore rattaché.';
end $$;

-- 2. Agences (21) ------------------------------------------------------------
insert into public.agences (code, nom, ville) values
  ('2951', 'Abong-Bang', ''),
  ('6234', 'Bertoua', ''),
  ('9233', 'Douala', ''),
  ('9385', 'Garoua Boulaï', ''),
  ('2681', 'Garoua I', ''),
  ('4658', 'Garoua II', ''),
  ('7891', 'Guidiguis', ''),
  ('9975', 'Kalfou', ''),
  ('9042', 'Kaélé', ''),
  ('8226', 'Maroua I', ''),
  ('4931', 'Maroua II', ''),
  ('1041', 'Mbé', ''),
  ('2322', 'Meiganga', ''),
  ('2814', 'Mokolo', ''),
  ('5706', 'Ndokayo', ''),
  ('2606', 'Ngaoundéré I', ''),
  ('8367', 'Ngaoundéré II', ''),
  ('1188', 'Ngong', ''),
  ('9032', 'Touboro', ''),
  ('6148', 'Yagoua', ''),
  ('4444', 'Yaoundé', '')
on conflict (code) do update set nom = excluded.nom;

-- 3. Lignes (16) — sens et type dérivés du nom, qui reste verbatim ------------
insert into public.axes (nom, sens, type) values
  ('YAGOUA - AXE SUD', 'SUD', 'AXE'),
  ('MAROUA - AXE SUD', 'SUD', 'AXE'),
  ('DOUALA - AXE NORD MAROUA-MOKOLO', 'NORD', 'AXE'),
  ('DOUALA - AXE NORD YAGOUA', 'NORD', 'AXE'),
  ('GAROUA - AXE MAROUA', 'AUCUN', 'AXE'),
  ('GAROUA - AXE YAGOUA', 'AUCUN', 'AXE'),
  ('MAROUA - AXE YAGOUA', 'AUCUN', 'AXE'),
  ('MAROUA - AXE GAROUA', 'AUCUN', 'AXE'),
  ('YAGOUA - AXE GAROUA', 'AUCUN', 'AXE'),
  ('YAGOUA - AXE MAROUA', 'AUCUN', 'AXE'),
  ('AXE TOUBORO', 'AUCUN', 'AXE'),
  ('TOUBORO - LOCATION SUD', 'SUD', 'LOCATION'),
  ('TOUBORO - LOCATION NORD MAROUA-MOKOLO', 'NORD', 'LOCATION'),
  ('TOUBORO - LOCATION NORD YAGOUA', 'NORD', 'LOCATION'),
  ('MOKOLO - AXE SUD', 'SUD', 'AXE'),
  ('MOKOLO - AXE MAROUA', 'AUCUN', 'AXE')
on conflict (nom) do update set sens = excluded.sens, type = excluded.type;

-- 4. Itinéraires (121 arrêts) — l'ordre est l'itinéraire ---------------------
delete from public.axe_agences
 where axe_id in (select id from public.axes where nom in ('YAGOUA - AXE SUD', 'MAROUA - AXE SUD', 'DOUALA - AXE NORD MAROUA-MOKOLO', 'DOUALA - AXE NORD YAGOUA', 'GAROUA - AXE MAROUA', 'GAROUA - AXE YAGOUA', 'MAROUA - AXE YAGOUA', 'MAROUA - AXE GAROUA', 'YAGOUA - AXE GAROUA', 'YAGOUA - AXE MAROUA', 'AXE TOUBORO', 'TOUBORO - LOCATION SUD', 'TOUBORO - LOCATION NORD MAROUA-MOKOLO', 'TOUBORO - LOCATION NORD YAGOUA', 'MOKOLO - AXE SUD', 'MOKOLO - AXE MAROUA'));

insert into public.axe_agences (axe_id, agence_id, position)
select a.id, g.id, v.position
from (values
  ('YAGOUA - AXE SUD', '6148', 1),
  ('YAGOUA - AXE SUD', '9975', 2),
  ('YAGOUA - AXE SUD', '7891', 3),
  ('YAGOUA - AXE SUD', '9042', 4),
  ('YAGOUA - AXE SUD', '4658', 5),
  ('YAGOUA - AXE SUD', '1188', 6),
  ('YAGOUA - AXE SUD', '1041', 7),
  ('YAGOUA - AXE SUD', '8367', 8),
  ('YAGOUA - AXE SUD', '2322', 9),
  ('YAGOUA - AXE SUD', '9385', 10),
  ('YAGOUA - AXE SUD', '5706', 11),
  ('YAGOUA - AXE SUD', '6234', 12),
  ('YAGOUA - AXE SUD', '2951', 13),
  ('YAGOUA - AXE SUD', '4444', 14),
  ('YAGOUA - AXE SUD', '9233', 15),
  ('MAROUA - AXE SUD', '4931', 1),
  ('MAROUA - AXE SUD', '4658', 2),
  ('MAROUA - AXE SUD', '1188', 3),
  ('MAROUA - AXE SUD', '1041', 4),
  ('MAROUA - AXE SUD', '8367', 5),
  ('MAROUA - AXE SUD', '2322', 6),
  ('MAROUA - AXE SUD', '9385', 7),
  ('MAROUA - AXE SUD', '5706', 8),
  ('MAROUA - AXE SUD', '6234', 9),
  ('MAROUA - AXE SUD', '2951', 10),
  ('MAROUA - AXE SUD', '4444', 11),
  ('MAROUA - AXE SUD', '9233', 12),
  ('DOUALA - AXE NORD MAROUA-MOKOLO', '9233', 1),
  ('DOUALA - AXE NORD MAROUA-MOKOLO', '4444', 2),
  ('DOUALA - AXE NORD MAROUA-MOKOLO', '2951', 3),
  ('DOUALA - AXE NORD MAROUA-MOKOLO', '6234', 4),
  ('DOUALA - AXE NORD MAROUA-MOKOLO', '5706', 5),
  ('DOUALA - AXE NORD MAROUA-MOKOLO', '9385', 6),
  ('DOUALA - AXE NORD MAROUA-MOKOLO', '2322', 7),
  ('DOUALA - AXE NORD MAROUA-MOKOLO', '2606', 8),
  ('DOUALA - AXE NORD MAROUA-MOKOLO', '1041', 9),
  ('DOUALA - AXE NORD MAROUA-MOKOLO', '1188', 10),
  ('DOUALA - AXE NORD MAROUA-MOKOLO', '4658', 11),
  ('DOUALA - AXE NORD MAROUA-MOKOLO', '4931', 12),
  ('DOUALA - AXE NORD MAROUA-MOKOLO', '2814', 13),
  ('DOUALA - AXE NORD YAGOUA', '9233', 1),
  ('DOUALA - AXE NORD YAGOUA', '4444', 2),
  ('DOUALA - AXE NORD YAGOUA', '2951', 3),
  ('DOUALA - AXE NORD YAGOUA', '6234', 4),
  ('DOUALA - AXE NORD YAGOUA', '5706', 5),
  ('DOUALA - AXE NORD YAGOUA', '9385', 6),
  ('DOUALA - AXE NORD YAGOUA', '2322', 7),
  ('DOUALA - AXE NORD YAGOUA', '2606', 8),
  ('DOUALA - AXE NORD YAGOUA', '1041', 9),
  ('DOUALA - AXE NORD YAGOUA', '1188', 10),
  ('DOUALA - AXE NORD YAGOUA', '2681', 11),
  ('DOUALA - AXE NORD YAGOUA', '9042', 12),
  ('DOUALA - AXE NORD YAGOUA', '7891', 13),
  ('DOUALA - AXE NORD YAGOUA', '9975', 14),
  ('DOUALA - AXE NORD YAGOUA', '6148', 15),
  ('GAROUA - AXE MAROUA', '4658', 1),
  ('GAROUA - AXE MAROUA', '4931', 2),
  ('GAROUA - AXE YAGOUA', '2681', 1),
  ('GAROUA - AXE YAGOUA', '9042', 2),
  ('GAROUA - AXE YAGOUA', '7891', 3),
  ('GAROUA - AXE YAGOUA', '9975', 4),
  ('GAROUA - AXE YAGOUA', '6148', 5),
  ('MAROUA - AXE YAGOUA', '8226', 1),
  ('MAROUA - AXE YAGOUA', '9042', 2),
  ('MAROUA - AXE YAGOUA', '7891', 3),
  ('MAROUA - AXE YAGOUA', '9975', 4),
  ('MAROUA - AXE YAGOUA', '6148', 5),
  ('MAROUA - AXE GAROUA', '4931', 1),
  ('MAROUA - AXE GAROUA', '4658', 2),
  ('YAGOUA - AXE GAROUA', '6148', 1),
  ('YAGOUA - AXE GAROUA', '9975', 2),
  ('YAGOUA - AXE GAROUA', '7891', 3),
  ('YAGOUA - AXE GAROUA', '9042', 4),
  ('YAGOUA - AXE GAROUA', '2681', 5),
  ('YAGOUA - AXE MAROUA', '6148', 1),
  ('YAGOUA - AXE MAROUA', '9975', 2),
  ('YAGOUA - AXE MAROUA', '7891', 3),
  ('YAGOUA - AXE MAROUA', '9042', 4),
  ('YAGOUA - AXE MAROUA', '8226', 5),
  ('AXE TOUBORO', '9032', 1),
  ('AXE TOUBORO', '2606', 2),
  ('TOUBORO - LOCATION SUD', '9032', 1),
  ('TOUBORO - LOCATION SUD', '2606', 2),
  ('TOUBORO - LOCATION SUD', '2322', 3),
  ('TOUBORO - LOCATION SUD', '9385', 4),
  ('TOUBORO - LOCATION SUD', '5706', 5),
  ('TOUBORO - LOCATION SUD', '6234', 6),
  ('TOUBORO - LOCATION SUD', '2951', 7),
  ('TOUBORO - LOCATION SUD', '4444', 8),
  ('TOUBORO - LOCATION SUD', '9233', 9),
  ('TOUBORO - LOCATION NORD MAROUA-MOKOLO', '9032', 1),
  ('TOUBORO - LOCATION NORD MAROUA-MOKOLO', '2606', 2),
  ('TOUBORO - LOCATION NORD MAROUA-MOKOLO', '1041', 3),
  ('TOUBORO - LOCATION NORD MAROUA-MOKOLO', '1188', 4),
  ('TOUBORO - LOCATION NORD MAROUA-MOKOLO', '4658', 5),
  ('TOUBORO - LOCATION NORD MAROUA-MOKOLO', '4931', 6),
  ('TOUBORO - LOCATION NORD MAROUA-MOKOLO', '2814', 7),
  ('TOUBORO - LOCATION NORD YAGOUA', '9032', 1),
  ('TOUBORO - LOCATION NORD YAGOUA', '2606', 2),
  ('TOUBORO - LOCATION NORD YAGOUA', '1041', 3),
  ('TOUBORO - LOCATION NORD YAGOUA', '1188', 4),
  ('TOUBORO - LOCATION NORD YAGOUA', '2681', 5),
  ('TOUBORO - LOCATION NORD YAGOUA', '9042', 6),
  ('TOUBORO - LOCATION NORD YAGOUA', '7891', 7),
  ('TOUBORO - LOCATION NORD YAGOUA', '9975', 8),
  ('TOUBORO - LOCATION NORD YAGOUA', '6148', 9),
  ('MOKOLO - AXE SUD', '2814', 1),
  ('MOKOLO - AXE SUD', '4931', 2),
  ('MOKOLO - AXE SUD', '4658', 3),
  ('MOKOLO - AXE SUD', '1188', 4),
  ('MOKOLO - AXE SUD', '1041', 5),
  ('MOKOLO - AXE SUD', '8367', 6),
  ('MOKOLO - AXE SUD', '2322', 7),
  ('MOKOLO - AXE SUD', '9385', 8),
  ('MOKOLO - AXE SUD', '5706', 9),
  ('MOKOLO - AXE SUD', '6234', 10),
  ('MOKOLO - AXE SUD', '2951', 11),
  ('MOKOLO - AXE SUD', '4444', 12),
  ('MOKOLO - AXE SUD', '9233', 13),
  ('MOKOLO - AXE MAROUA', '2814', 1),
  ('MOKOLO - AXE MAROUA', '4931', 2)
) as v(axe, code, position)
join public.axes    a on a.nom  = v.axe
join public.agences g on g.code = v.code;

commit;

-- Contrôle : 21 | 16 | 121 | 0 attendu (demo = agences AG01-AG03 restantes)
select format('agences=%s lignes=%s arrets=%s demo=%s',
  (select count(*) from public.agences),
  (select count(*) from public.axes),
  (select count(*) from public.axe_agences),
  (select count(*) from public.agences where code in ('AG01','AG02','AG03'))) as controle;
