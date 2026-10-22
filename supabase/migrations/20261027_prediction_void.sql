-- Voiding a prediction round (audit R-05): when a round can't be settled fairly (a cancelled race, a wrong round,
-- a disputed result), an admin voids it and every entrant gets their entry points back, in one transaction, with a
-- 'prediction_refund' ledger row each. Like settle_prediction: idempotent (voiding again refunds nothing) and it
-- refuses a round that has already been settled. A new 'void' status; nothing existing changes.

set local lock_timeout = '5s';

alter table public.group_predictions drop constraint if exists group_predictions_status_check;
alter table public.group_predictions add constraint group_predictions_status_check check (status in ('open', 'locked', 'resolved', 'void'));

create or replace function public.void_prediction(
  p_prediction_id uuid, p_group_id uuid, p_now timestamptz default clock_timestamp()
) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare
  pred public.group_predictions%rowtype;
  e record;
  v_refund_count integer := 0;
  v_refund_total integer := 0;
begin
  select * into pred from public.group_predictions where id = p_prediction_id and group_id = p_group_id for update;
  if not found then raise exception 'prediction_not_found' using errcode = 'P0002'; end if;
  if pred.status = 'void' then return jsonb_build_object('alreadyVoid', true, 'refundCount', 0, 'refundTotal', 0); end if;
  if pred.status = 'resolved' then raise exception 'prediction_resolved' using errcode = 'P0001'; end if;

  for e in select user_id, points_wagered from public.group_prediction_entries
            where prediction_id = p_prediction_id and points_awarded is null order by user_id for update
  loop
    update public.group_prediction_entries set points_awarded = 0 where prediction_id = p_prediction_id and user_id = e.user_id;
    if e.points_wagered > 0 then
      update public.profiles set points_balance = points_balance + e.points_wagered where id = e.user_id;
      insert into public.points_transactions (user_id, amount, reason, group_id, prediction_id)
      values (e.user_id, e.points_wagered, 'prediction_refund', p_group_id, p_prediction_id);
      v_refund_count := v_refund_count + 1;
      v_refund_total := v_refund_total + e.points_wagered;
    end if;
  end loop;

  update public.group_predictions set status = 'void', resolved_at = p_now where id = p_prediction_id;
  return jsonb_build_object('alreadyVoid', false, 'refundCount', v_refund_count, 'refundTotal', v_refund_total);
end $$;

revoke all on function public.void_prediction(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.void_prediction(uuid, uuid, timestamptz) to service_role;
