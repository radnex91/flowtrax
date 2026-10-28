-- FlowTrax — 0005 : identifiant de connexion
-- À exécuter après 0004.
--
-- Supabase Auth n'accepte que des adresses email : il n'y a pas de champ
-- « username » dans auth.users. On garde donc un email technique par compte
-- (`ag01@flowtrax.local`) et l'on expose un identifiant lisible (`ag01`),
-- seul visible à l'écran de connexion et à l'écran Comptes.

alter table public.profiles add column if not exists username text;

comment on column public.profiles.username is
  'Identifiant de connexion saisi par la personne (ex. ag01). Unique, en minuscules.';

-- Reprise des comptes créés avant 0005 : partie locale de leur email.
update public.profiles
   set username = lower(split_part(email, '@', 1))
 where username is null
   and email is not null
   and email ~ '^[^@]+@[^@]+$';

create unique index if not exists profiles_username_uidx
  on public.profiles (lower(username))
  where username is not null;

-- Même forme que côté navigateur (public/assets/ident.js) et côté fonction
-- (supabase/functions/admin-comptes) : trois exemplaires, un seul test les
-- compare, sinon un identifiant accepté ici serait refusé là.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_username_forme'
  ) then
    alter table public.profiles
      add constraint profiles_username_forme
      check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{2,31}$');
  end if;
end $$;
