-- Free trial + membership cancellation for manager subscriptions.
--
-- trial_ends_at    — when a manager starts on the 7-day free trial, this is when
--                    it ends (and the first charge would fall due). While it's in
--                    the future and no installment has been paid, the plan is "on
--                    trial": full access, nothing charged yet.
-- plan_canceled_at — set when the manager cancels. The plan stays active until the
--                    current paid period ends, then it does not renew. Cleared if
--                    they resume or re-activate.
alter table public.managers
  add column if not exists trial_ends_at    timestamptz,
  add column if not exists plan_canceled_at timestamptz;

comment on column public.managers.trial_ends_at is
  '7-day free-trial end / first-charge date. In the future with no installment paid = plan is on trial.';
comment on column public.managers.plan_canceled_at is
  'Set when the manager cancels; plan stays active until the paid period ends, then does not renew.';
