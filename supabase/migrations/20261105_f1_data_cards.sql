-- Level 3.2: Interactive F1 Telemetry, Strategy Stints, and Simulation Data Cards Embeds
alter table public.group_posts add column if not exists data_card jsonb;
