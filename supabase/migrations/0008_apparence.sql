-- FlowTrax — 0008 : apparence (couleur d'accent, mode d'affichage, logo)
-- À exécuter après 0007, dans le SQL Editor.
--
-- Trois clés dans `settings`, déjà lue par tous les écrans :
--   theme_accent  vide = couleur d'origine, sinon #RRGGBB
--   theme_mode    auto (suit le système) | light | dark
--   logo_data     vide = logo livré avec l'application, sinon data:image/… en base
--
-- Le logo tient dans une colonne texte parce qu'il est réduit à 320 px de côté
-- par le navigateur avant l'envoi : quelques dizaines de kilo-octets, pas une
-- image d'origine. Cela évite un bucket Supabase et une policy de stockage de
-- plus, pour un fichier que seuls les écrans lisent.

insert into public.settings (key, value, label) values
  ('theme_accent', '', 'Couleur d''accent de l''application (#RRGGBB). Vide = couleur d''origine.'),
  ('theme_mode', 'auto', 'Mode d''affichage : auto (suit le système), light ou dark.'),
  ('logo_data', '', 'Logo importé depuis Administration (data:image/… encodé). Vide = logo d''origine.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- L'écran de connexion n'a pas de session : sans cette policy il resterait aux
-- couleurs et au logo d'origine, alors que tout le reste de l'application
-- aurait été personnalisé. La lecture est limitée aux trois clés ci-dessus —
-- jamais `using (true)`, qui exposerait aussi le fuseau et la fenêtre.
-- ---------------------------------------------------------------------------
grant select on public.settings to anon;

drop policy if exists settings_read_public on public.settings;
create policy settings_read_public on public.settings
  for select to anon
  using (key in ('theme_accent', 'theme_mode', 'logo_data'));

-- ---------------------------------------------------------------------------
-- Même garde que le reste des réglages : une couleur tronquée ou un logo qui
-- n'est pas une image casserait tous les écrans d'un coup. On refuse à
-- l'écriture, pas à la lecture.
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

  if new.key = 'theme_accent'
     and new.value <> ''
     and new.value !~* '^#[0-9a-f]{6}$' then
    raise exception 'Couleur d''accent attendue en hexadécimal, par exemple #C4560B'
      using errcode = 'P0001';
  end if;

  if new.key = 'theme_mode'
     and new.value not in ('auto', 'light', 'dark') then
    raise exception 'Mode d''affichage attendu : auto, light ou dark'
      using errcode = 'P0001';
  end if;

  if new.key = 'logo_data'
     and new.value <> ''
     and (new.value !~ '^data:image/(png|jpeg|webp|svg\+xml);base64,'
          or length(new.value) > 400000) then
    raise exception 'Logo attendu en image encodée (data:image/…), 400 000 caractères maximum'
      using errcode = 'P0001';
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists settings_guard on public.settings;
create trigger settings_guard before insert or update on public.settings
  for each row execute function public.settings_guard();

-- Contrôle : attendu « 3 | true | true | 1 ».
select
  (select count(*) from public.settings
    where key in ('theme_accent', 'theme_mode', 'logo_data'))                    as cles_apparence,
  has_table_privilege('anon', 'public.settings', 'select')                      as anon_lecture,
  has_table_privilege('authenticated', 'public.settings', 'update')             as direction_ecriture,
  (select count(*) from pg_policies
    where schemaname = 'public' and policyname = 'settings_read_public')        as policy_connexion;
