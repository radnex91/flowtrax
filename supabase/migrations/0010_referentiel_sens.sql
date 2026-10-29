-- ---------------------------------------------------------------------------
-- 0010 — les sens deviennent un référentiel
--
-- « Sens » était une liste fermée écrite dans la contrainte de la table axes :
-- ajouter une direction demandait une migration. Le sens est maintenant une
-- ligne de public.sens, tenue depuis Administration → Sens, et axes.sens y
-- renvoie (clé étrangère sur le nom).
--
-- Renommer un sens renomme le sens des lignes qui le portent (on update
-- cascade) ; supprimer un sens encore porté par une ligne échoue (on delete
-- restrict), ce qui laisse le message « désactivez-le au lieu de le supprimer »
-- faire son travail.
-- ---------------------------------------------------------------------------

create table public.sens (
  id    serial primary key,
  nom   text not null unique check (btrim(nom) <> ''),
  actif boolean not null default true
);

comment on table public.sens is
  'Directions proposées pour une ligne ; axes.sens référence nom.';

-- Les trois valeurs d'hier deviennent les trois premières lignes du
-- référentiel : la contrainte peut tomber sans laisser de ligne orpheline.
insert into public.sens (nom)
select v from (values ('NORD'), ('SUD'), ('AUCUN')) as t(v)
where not exists (select 1 from public.sens s where s.nom = t.v);

-- La contrainte de 0001 porte un nom engendré (axes_sens_check). On la retrouve
-- par sa définition plutôt que par ce nom, pour ne pas dépendre de la version de
-- PostgreSQL qui l'a créée.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.axes'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%sens%'
  loop
    execute format('alter table public.axes drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.axes drop constraint if exists axes_sens_fk;
alter table public.axes
  add constraint axes_sens_fk foreign key (sens)
  references public.sens (nom) on update cascade on delete restrict;

-- ---------------------------------------------------------------------------
-- Droits : même régime que les autres référentiels, plus la séquence
-- (0002 a accordé « on all sequences » sur celles qui existaient alors ;
-- la nouvelle n'y est pas, et un INSERT échouerait en 42501).
-- ---------------------------------------------------------------------------
alter table public.sens enable row level security;

create policy sens_read  on public.sens for select to authenticated using (true);
create policy sens_write on public.sens for all to authenticated
  using (public.my_role() = 'DIRECTION') with check (public.my_role() = 'DIRECTION');

grant select, insert, update, delete on public.sens to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Contrôle : 3 | <lignes> | 1 | 0 attendu — trois sens semés, au moins une
-- ligne portant un sens, la clé étrangère en place, plus aucune contrainte de
-- liste fermée sur axes.sens.
select
  (select count(*) from public.sens) as sens,
  (select count(*) from public.axes where sens is not null) as lignes,
  (select count(*) from pg_constraint
    where conrelid = 'public.axes'::regclass and conname = 'axes_sens_fk') as cle_etrangere,
  (select count(*) from pg_constraint
    where conrelid = 'public.axes'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%sens%') as ancienne_contrainte;
