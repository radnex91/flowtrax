-- FlowTrax — 0004 : écriture des référentiels (lot 2, écran Administration)
-- À exécuter après 0003.
--
-- Point important : 0002 pose les policies « for all » de la direction mais
-- n'accorde que `select` sur les référentiels. PostgreSQL vérifie le privilège
-- AVANT la RLS : sans les GRANT ci-dessous, toute écriture échoue en 42501
-- (« permission denied for table agences »), policy ou pas.

grant insert, update, delete on
  public.agences, public.axes, public.axe_agences,
  public.vehicules, public.agents, public.settings, public.profiles
  to authenticated;

-- ---------------------------------------------------------------------------
-- Adresse de connexion, recopiée dans le profil
-- auth.users n'est pas lisible par le client : l'écran Comptes a besoin de voir
-- qui est qui. La valeur reste facultative (les comptes créés avant 0004 n'en
-- ont pas).
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists email text;

comment on column public.profiles.email is
  'Adresse de connexion, recopiée à la création du compte. Purement descriptive.';

-- ---------------------------------------------------------------------------
-- Un compte désactivé perd réellement ses droits
-- Sans ceci, `actif = false` ne bloquait que la page de connexion : une session
-- déjà ouverte gardait l'accès complet.
-- ---------------------------------------------------------------------------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and actif
$$;

create or replace function public.my_agence() returns int
language sql stable security definer set search_path = public as $$
  select agence_id from public.profiles where id = auth.uid() and actif
$$;

-- Et l'on ne se coupe pas soi-même les jambes depuis l'écran Comptes.
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id = auth.uid() then
    if new.role <> old.role then
      raise exception 'Vous ne pouvez pas modifier votre propre rôle' using errcode = 'P0001';
    end if;
    if new.actif <> old.actif then
      raise exception 'Vous ne pouvez pas désactiver votre propre compte' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------------
-- Réglages : un fuseau inventé ou une fenêtre absurde cassaient la journée
-- de service pour toutes les agences. On refuse à l'écriture.
-- ---------------------------------------------------------------------------
create or replace function public.settings_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.key = 'timezone'
     and not exists (select 1 from pg_timezone_names z where z.name = new.value) then
    raise exception 'Fuseau horaire inconnu : utilisez un nom IANA (ex. Africa/Maseru)'
      using errcode = 'P0001';
  end if;

  if new.key = 'edit_window_minutes'
     and (new.value !~ '^[0-9]{1,4}$' or new.value::int > 1440) then
    raise exception 'Fenêtre de modification attendue en minutes, entre 0 et 1440'
      using errcode = 'P0001';
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists settings_guard on public.settings;
create trigger settings_guard before insert or update on public.settings
  for each row execute function public.settings_guard();

-- ---------------------------------------------------------------------------
-- Itinéraire d'une ligne, en une seule instruction
-- (axe_id, position) forme la clé primaire : intervertir deux positions par un
-- simple UPDATE violerait l'unicité en cours de route. On supprime puis on
-- réinsère, atomiquement, sous les policies de l'appelant (security invoker).
-- ---------------------------------------------------------------------------
create or replace function public.set_axe_itineraire(p_axe int, p_agences int[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_n int := coalesce(array_length(p_agences, 1), 0);
  v_d int;
  i   int;
begin
  if v_n < 2 then
    raise exception 'Une ligne doit desservir au moins deux agences' using errcode = 'P0001';
  end if;

  select count(distinct x) into v_d from unnest(p_agences) as x;
  if v_d <> v_n then
    raise exception 'Une agence ne peut apparaître deux fois sur la même ligne'
      using errcode = 'P0001';
  end if;

  select count(*) into v_d from public.agences a where a.id = any (p_agences);
  if v_d <> v_n then
    raise exception 'Agence inconnue dans l''itinéraire' using errcode = 'P0001';
  end if;

  delete from public.axe_agences where axe_id = p_axe;

  for i in 1..v_n loop
    insert into public.axe_agences (axe_id, agence_id, position)
    values (p_axe, p_agences[i], i - 1);
  end loop;
end $$;

grant execute on function public.set_axe_itineraire(int, int[]) to authenticated;
