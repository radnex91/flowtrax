-- ---------------------------------------------------------------------------
-- 0013 — les messages générés après une déclaration deviennent réglables
--
-- Les trois textes partis sur WhatsApp (départ, correction, annulation)
-- étaient écrits dans public/assets/wa.js : changer une phrase demandait une
-- livraison. Ils sont désormais des gabarits en base, avec des {variables}
-- remplacées à l'envoi — l'écran Administration → Messages les édite.
--
--   messages.code     DEPART, CORRECTION, ANNULATION (clé stable)
--   messages.gabarit  le texte complet, {agence}, {bordereau}, {taux}…
--
-- Les gabarits semés reproduisent au caractère près les textes d'avant : un
-- déploiement de l'interface avant ce collage n'envoie rien de nouveau, et
-- l'après-collage n'envoie rien d'autre. C'est tests/wa.test.mjs qui garde
-- cette promesse.
--
-- Les messages ne s'inventent pas tout seuls : seul un rôle qui porte la
-- permission « messages.gerer » peut les réécrire. Elle est accordée à la
-- direction au premier passage, et à qui l'on veut ensuite depuis
-- Administration → Rôles (case « Modifier les messages envoyés aux agences »).
--
-- Rejouable : rien n'est réécrit, ni les textes déjà modifiés, ni un droit
-- retiré à la main.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. Les gabarits
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  code    text primary key check (code = upper(btrim(code)) and btrim(code) <> ''),
  libelle text not null check (btrim(libelle) <> ''),
  gabarit text not null check (btrim(gabarit) <> ''),
  ordre   smallint not null default 100
);

comment on table public.messages is
  'Textes des messages WhatsApp ; les {variables} sont remplacées à l''envoi.';

comment on column public.messages.gabarit is
  'Texte complet, retours à la ligne compris. Une ligne dont toutes les variables sont vides disparaît.';

insert into public.messages (code, libelle, ordre, gabarit) values
  ('DEPART', 'Départ déclaré', 10, $msg$🚌 *DÉPART {agence_maj} · {programme_maj}*
━━━━━━━━━━━━━━━━━━━━
📍 *ITINÉRAIRE*
• Axe : {axe}
• Ligne : {ligne}
• Provenance : {provenance}
• Destination : {destination}

🚍 *VÉHICULE & BORDEREAU*
• Véhicule : {immat} ({places} places)
• Bordereau : N° {bordereau}

🕒 *HORAIRES*
• Arrivée : {h_arrivee} · Départ : {h_depart}

👥 *EFFECTIFS & REMPLISSAGE*
• Effectif arrivée : {eff_arrivee} (places dispo : {dispo})
• Effectif complété : {eff_complete} · Total à bord : {total}
• *Taux de remplissage agence : {taux}*
• Passants : {passants}

👨‍✈️ *ÉQUIPAGE*
• Chauffeur : {chauffeur}
• Convoyeur : {convoyeur}
• Chef de piste : {chef_piste}
━━━━━━━━━━━━━━━━━━━━
✨ _Danay Express SARL — Ensemble, vers de nouveaux horizons_$msg$),

  ('CORRECTION', 'Correction d''un départ', 20, $msg$🚨 *CORRECTION · DÉPART {agence_maj} · {programme_maj}*
━━━━━━━━━━━━━━━━━━━━
⚠️ _Ce message remplace et annule le précédent pour ce départ._
━━━━━━━━━━━━━━━━━━━━
📍 *ITINÉRAIRE*
• Axe : {axe}
• Ligne : {ligne}
• Provenance : {provenance}
• Destination : {destination}

🚍 *VÉHICULE & BORDEREAU*
• Véhicule : {immat} ({places} places)
• Bordereau : N° {bordereau}

🕒 *HORAIRES*
• Arrivée : {h_arrivee} · Départ : {h_depart}

👥 *EFFECTIFS & REMPLISSAGE*
• Effectif arrivée : {eff_arrivee} (places dispo : {dispo})
• Effectif complété : {eff_complete} · Total à bord : {total}
• *Taux de remplissage agence : {taux}*
• Passants : {passants}

👨‍✈️ *ÉQUIPAGE*
• Chauffeur : {chauffeur}
• Convoyeur : {convoyeur}
• Chef de piste : {chef_piste}
━━━━━━━━━━━━━━━━━━━━
✨ _Danay Express SARL — Ensemble, vers de nouveaux horizons_$msg$),

  ('ANNULATION', 'Annulation d''un départ', 30, $msg$🚫 *ANNULATION · DÉPART {agence_maj}*
━━━━━━━━━━━━━━━━━━━━
🚍 Véhicule : {immat}
🔖 Bordereau : N° {bordereau}
📍 Destination : {destination}
🕒 Heure de départ : {h_depart}
📋 Programme : {programme}
━━━━━━━━━━━━━━━━━━━━
⚠️ _Ce départ est annulé : ne pas tenir compte du message précédent._$msg$)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Le droit de réécrire les messages
-- Le droit n'est posé qu'au moment où la permission naît : rejouer cette
-- migration ne le rend pas à un rôle dont on l'a retiré depuis.
-- ---------------------------------------------------------------------------
with nouvelle as (
  insert into public.permissions (code, libelle, module, ordre) values
    ('messages.gerer', 'Modifier les messages envoyés aux agences', 'Administration', 50)
  on conflict (code) do nothing
  returning code
)
insert into public.role_permissions (role, permission)
select r.code, n.code
from nouvelle n
join public.roles r on r.code = 'DIRECTION'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Lecture pour tous les comptes, écriture pour le seul droit ci-dessus
-- ---------------------------------------------------------------------------
alter table public.messages enable row level security;

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select to authenticated
  using (true);

drop policy if exists messages_write on public.messages;
create policy messages_write on public.messages for all to authenticated
  using (public.a_permission('messages.gerer'))
  with check (public.a_permission('messages.gerer'));

grant select on public.messages to authenticated;
grant insert, update, delete on public.messages to authenticated;

commit;

-- Contrôle : une seule cellule qui nomme ses valeurs — attendu
-- « messages=3 droit=1 liens=1 policies=2 ».
select format('messages=%s droit=%s liens=%s policies=%s',
  (select count(*) from public.messages),
  (select count(*) from public.permissions where code = 'messages.gerer'),
  (select count(*) from public.role_permissions where permission = 'messages.gerer'),
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'messages')
) as controle;
