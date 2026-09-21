-- How the product tour ended, alongside the existing `onboarding_completed_at`.
--
-- The old column only recorded THAT onboarding stopped being shown, not whether the person
-- actually walked through it or dismissed it on sight. Both mean "don't show this again
-- automatically", so the existing behaviour is unchanged - but they are different facts, and only
-- one of them means the tour was ever seen.
--
-- Additive and nullable: every existing row keeps its current value, and a row that completed
-- onboarding before this column existed simply reports null (unknown), which is the truth rather
-- than a guess in either direction.
alter table profiles add column if not exists onboarding_outcome text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_onboarding_outcome_check') then
    alter table profiles
      add constraint profiles_onboarding_outcome_check
      check (onboarding_outcome is null or onboarding_outcome in ('completed', 'skipped'));
  end if;
end $$;
