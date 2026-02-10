-- Enable Row Level Security on all tables
-- No policies are created because the app accesses the DB exclusively
-- via Prisma using the service_role connection (which bypasses RLS).
-- This blocks any direct access through PostgREST/Supabase client APIs.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_target_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rebalance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rebalance_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metrics_timeseries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_strategies ENABLE ROW LEVEL SECURITY;
