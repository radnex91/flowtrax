-- FlowTrax — 0002 : sécurité (RLS)
-- Principe : la clé anon est publique par construction. Tout repose ici.
-- Une agence ne lit et n'écrit que ses propres départs ; la direction voit tout.

alter table public.settings             enable row level security;
alter table public.agences              enable row level security;
alter table public.profiles             enable row level security;
alter table public.axes                 enable row level security;
alter table public.axe_agences          enable row level security;
alter table public.vehicules            enable row level security;
alter table public.agents               enable row level security;
alter table public.departures           enable row level security;
alter table public.departure_passagers  enable row level security;
alter table public.departure_crew       enable row level security;
alter table public.audit_log            enable row level security;
alter table public.reports              enable row level security;

-- ---------------------------------------------------------------------------
-- Référentiels : lecture pour tout compte connecté, écriture direction seule
-- ---------------------------------------------------------------------------
create policy agences_read     on public.agences     for select to authenticated using (true);
create policy axes_read        on public.axes        for select to authenticated using (true);
create policy axe_agences_read on public.axe_agences for select to authenticated using (true);
create policy vehicules_read   on public.vehicules   for select to authenticated using (true);
create policy agents_read      on public.agents      for select to authenticated using (true);
create policy settings_read    on public.settings    for select to authenticated using (true);

create policy agences_write     on public.agences     for all to authenticated
  using (public.my_role() = 'DIRECTION') with check (public.my_role() = 'DIRECTION');
create policy axes_write        on public.axes        for all to authenticated
  using (public.my_role() = 'DIRECTION') with check (public.my_role() = 'DIRECTION');
create policy axe_agences_write on public.axe_agences for all to authenticated
  using (public.my_role() = 'DIRECTION') with check (public.my_role() = 'DIRECTION');
create policy vehicules_write   on public.vehicules   for all to authenticated
  using (public.my_role() = 'DIRECTION') with check (public.my_role() = 'DIRECTION');
create policy agents_write      on public.agents      for all to authenticated
  using (public.my_role() = 'DIRECTION') with check (public.my_role() = 'DIRECTION');
create policy settings_write    on public.settings    for all to authenticated
  using (public.my_role() = 'DIRECTION') with check (public.my_role() = 'DIRECTION');

-- ---------------------------------------------------------------------------
-- Profils : chacun lit le sien ; personne ne peut changer son propre rôle
-- (aucune policy UPDATE pour soi — l'élévation de privilège est impossible)
-- ---------------------------------------------------------------------------
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.my_role() in ('REGULATION', 'DIRECTION'));

create policy profiles_write on public.profiles for all to authenticated
  using (public.my_role() = 'DIRECTION') with check (public.my_role() = 'DIRECTION');

-- ---------------------------------------------------------------------------
-- Départs
-- ---------------------------------------------------------------------------
create policy dep_read on public.departures for select to authenticated
  using (
    public.my_role() in ('REGULATION', 'DIRECTION')
    or agence_id = public.my_agence()
  );

create policy dep_insert on public.departures for insert to authenticated
  with check (
    public.my_role() = 'AGENCE'
    and agence_id = public.my_agence()
    and created_by = auth.uid()
  );

-- using  : quelles lignes puis-je toucher (évalué sur la ligne avant modification)
-- with check : quelles valeurs ai-je le droit d'écrire
create policy dep_update on public.departures for update to authenticated
  using (
    public.my_role() in ('REGULATION', 'DIRECTION')
    or (
      public.my_role() = 'AGENCE'
      and agence_id = public.my_agence()
      and now() < public.departure_limite(date_service, h_depart)
    )
  )
  with check (
    public.my_role() in ('REGULATION', 'DIRECTION')
    or agence_id = public.my_agence()
  );

-- Aucune policy DELETE : on annule, on ne supprime pas.

-- ---------------------------------------------------------------------------
-- Lignes filles : visibles et modifiables seulement si le départ l'est,
-- et dans la même fenêtre de modification que le parent.
-- ---------------------------------------------------------------------------
create policy passagers_all on public.departure_passagers for all to authenticated
  using (
    exists (
      select 1 from public.departures d
      where d.id = departure_id
        and (
          public.my_role() in ('REGULATION', 'DIRECTION')
          or (d.agence_id = public.my_agence()
              and now() < public.departure_limite(d.date_service, d.h_depart))
        )
    )
  )
  with check (
    exists (
      select 1 from public.departures d
      where d.id = departure_id
        and (
          public.my_role() in ('REGULATION', 'DIRECTION')
          or (d.agence_id = public.my_agence()
              and now() < public.departure_limite(d.date_service, d.h_depart))
        )
    )
  );

create policy crew_all on public.departure_crew for all to authenticated
  using (
    exists (
      select 1 from public.departures d
      where d.id = departure_id
        and (
          public.my_role() in ('REGULATION', 'DIRECTION')
          or (d.agence_id = public.my_agence()
              and now() < public.departure_limite(d.date_service, d.h_depart))
        )
    )
  )
  with check (
    exists (
      select 1 from public.departures d
      where d.id = departure_id
        and (
          public.my_role() in ('REGULATION', 'DIRECTION')
          or (d.agence_id = public.my_agence()
              and now() < public.departure_limite(d.date_service, d.h_depart))
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Journal d'audit et rapports : lecture seule
-- ---------------------------------------------------------------------------
create policy audit_read on public.audit_log for select to authenticated
  using (
    public.my_role() in ('REGULATION', 'DIRECTION')
    or exists (
      select 1 from public.departures d
      where d.id = audit_log.entity_id
        and audit_log.entity = 'departures'
        and d.agence_id = public.my_agence()
    )
  );

create policy reports_read on public.reports for select to authenticated
  using (public.my_role() in ('REGULATION', 'DIRECTION'));

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------
grant select on public.agences, public.axes, public.axe_agences,
                public.vehicules, public.agents, public.settings
  to authenticated;

grant select, insert, update on public.departures to authenticated;
grant select, insert, update, delete on public.departure_passagers to authenticated;
grant select, insert, update, delete on public.departure_crew to authenticated;
grant select on public.audit_log, public.reports to authenticated;
grant select on public.v_departures, public.v_kpis_jour, public.v_kpis_agence_jour
  to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke insert, update, delete on public.audit_log from anon, authenticated;
