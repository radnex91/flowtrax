-- ---------------------------------------------------------------------------
-- 0011 — les fonctions deviennent un référentiel
--
-- « Fonction » était une liste fermée de trois valeurs écrite dans la
-- contrainte de la table agents : déclarer un guichetier ou un chef d'agence
-- demandait une migration. La fonction est maintenant une ligne de
-- public.fonctions, tenue depuis Administration → Fonctions, et agents.fonction
-- y renvoie (clé étrangère sur le code).
--
-- Deux colonnes, deux rôles distincts :
--   code    — la valeur rangée sur la ligne de l'utilisateur (CHAUFFEUR), la
--             clé. C'est elle que depart.js compare pour remplir les listes
--             « Chauffeur / Convoyeur / Chef de piste » de l'équipage : elle
--             ne doit donc pas dépendre de l'orthographe affichée.
--   libelle — ce que lit l'écran (Chauffeur, Chef de piste). Il se renomme
--             librement sans toucher au code, donc sans casser l'équipage.
--
-- Fonction en texte et non en serial : la clé est le code lui-même, aucune
-- séquence à accorder (0002 a accordé « on all sequences » sur celles qui
-- existaient alors ; une séquence créée après coup vaudrait un 42501).
--
-- Rejouable : comme 0010, un premier passage peut s'être arrêté après la
-- création de la table (42P07), laissant la clé étrangère, les policies et les
-- droits à poser. Chaque étape se rejoue sans erreur, et la ligne de contrôle
-- dit où l'on en est.
-- ---------------------------------------------------------------------------

create table if not exists public.fonctions (
  code    text primary key check (code = upper(btrim(code)) and btrim(code) <> ''),
  libelle text not null check (btrim(libelle) <> ''),
  actif   boolean not null default true
);

comment on table public.fonctions is
  'Fonctions proposées pour un utilisateur ; agents.fonction référence code.';

-- Les trois valeurs d'hier deviennent les trois premières lignes du
-- référentiel : la contrainte peut tomber sans laisser de ligne orpheline.
insert into public.fonctions (code, libelle) values
  ('CHAUFFEUR', 'Chauffeur'),
  ('CONVOYEUR', 'Convoyeur'),
  ('CHEF_PISTE', 'Chef de piste')
on conflict (code) do nothing;

-- La contrainte de 0001 porte un nom engendré (agents_fonction_check). On la
-- retrouve par sa définition plutôt que par ce nom, pour ne pas dépendre de la
-- version de PostgreSQL qui l'a créée.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.agents'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%fonction%'
  loop
    execute format('alter table public.agents drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.agents drop constraint if exists agents_fonction_fk;
alter table public.agents
  add constraint agents_fonction_fk foreign key (fonction)
  references public.fonctions (code) on update cascade on delete restrict;

-- ---------------------------------------------------------------------------
-- Droits : même régime que les autres référentiels. Pas de séquence ici, la
-- clé étant le code.
-- ---------------------------------------------------------------------------
alter table public.fonctions enable row level security;

drop policy if exists fonctions_read on public.fonctions;
drop policy if exists fonctions_write on public.fonctions;
create policy fonctions_read on public.fonctions for select to authenticated using (true);
create policy fonctions_write on public.fonctions for all to authenticated
  using (public.my_role() = 'DIRECTION') with check (public.my_role() = 'DIRECTION');

grant select, insert, update, delete on public.fonctions to authenticated;

-- Contrôle : 3 | <utilisateurs> | 1 | 0 | 2 attendu — trois fonctions semées,
-- autant d'utilisateurs que la table en porte, la clé étrangère en place, plus
-- aucune contrainte de liste fermée sur agents.fonction, et les deux policies.
select
  (select count(*) from public.fonctions) as fonctions,
  (select count(*) from public.agents where fonction is not null) as utilisateurs,
  (select count(*) from pg_constraint
    where conrelid = 'public.agents'::regclass and conname = 'agents_fonction_fk') as cle_etrangere,
  (select count(*) from pg_constraint
    where conrelid = 'public.agents'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%fonction%') as ancienne_contrainte,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'fonctions') as policies;
