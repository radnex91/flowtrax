-- FlowTrax — 0006 : contrôle et rattrapage des droits d'écriture
--
-- 0004 pose ces GRANT. Ce lot les repose (sans effet s'ils existent déjà) et
-- surtout *vérifie* : PostgreSQL contrôle le privilège de table AVANT la RLS,
-- donc une policy « for all » de la direction ne suffit pas. Sans les GRANT,
-- l'enregistrement d'un itinéraire — et de tout référentiel — échoue en 42501.
--
-- Rejouable sans risque : uniquement des GRANT et des lectures.

do $$
begin
  if to_regprocedure('public.set_axe_itineraire(int,int[])') is null then
    raise exception
      'La fonction set_axe_itineraire est absente : 0004 n''a pas été appliquée en entier. Rejouez 0004 avant 0006.';
  end if;
end $$;

grant insert, update, delete on
  public.agences, public.axes, public.axe_agences,
  public.vehicules, public.agents, public.settings, public.profiles
  to authenticated;

grant execute on function public.set_axe_itineraire(int, int[]) to authenticated;

-- Contrôle : attendu « 1 | true | true | true | true | true | true »
select
  (select count(*) from pg_trigger where tgname = 'profiles_guard')                       as garde_profils,
  has_function_privilege('authenticated', 'public.set_axe_itineraire(int,int[])', 'execute') as exec_itineraire,
  has_table_privilege('authenticated', 'public.axe_agences', 'insert')                    as ins_axe_agences,
  has_table_privilege('authenticated', 'public.axe_agences', 'delete')                    as del_axe_agences,
  has_table_privilege('authenticated', 'public.agences', 'insert')                        as ins_agences,
  has_table_privilege('authenticated', 'public.vehicules', 'update')                      as upd_vehicules,
  has_table_privilege('authenticated', 'public.profiles', 'update')                       as upd_profils;
