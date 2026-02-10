# Cron Jobs Configuration

This document describes how to configure the scheduled jobs (cron) for Margn.

## Overview

The application requires three daily cron jobs to run automatically:

1. **Price Ingestion** - Fetches daily asset prices from Yahoo Finance
2. **Metrics Refresh** - Recalculates portfolio metrics (equity, exposure, leverage)
3. **Daily Check** - Generates recommendations and alerts

## Scripts Location

All scripts are located in `infra/scripts/`:

- `price-ingestion.ts` - Daily price ingestion
- `metrics-refresh.ts` - Metrics recalculation
- `daily-check.ts` - Daily portfolio verification

## Recommended Schedule

### Production Schedule (UTC)

```
0 6 * * *   # 6:00 AM UTC - Price Ingestion
0 7 * * *   # 7:00 AM UTC - Metrics Refresh (after prices)
0 9 * * *   # 9:00 AM UTC - Daily Check (after metrics)
```

### Development Schedule

For development, you can run them more frequently or manually:

```bash
cd infra/scripts
npm run prices:ingest
npm run metrics:refresh
npm run daily:check
```

## Configuration Options

### Option 1: Supabase Cron Jobs (Recommended)

Supabase supports PostgreSQL cron jobs via the `pg_cron` extension.

#### Setup

1. Enable `pg_cron` extension in Supabase:
   ```sql
   -- Run in Supabase SQL Editor
   CREATE EXTENSION IF NOT EXISTS pg_cron;
   ```

2. Create a function to run the scripts:
   ```sql
   -- Note: This requires setting up a way to execute Node.js scripts
   -- You may need to use a webhook or external service
   ```

#### Alternative: Use Supabase Edge Functions

Create Edge Functions that call your scripts via HTTP:

```typescript
// supabase/functions/price-ingestion/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  // Call your script endpoint or execute directly
  // ...
})
```

### Option 2: Render Cron Jobs

If your backend is hosted on Render:

1. Go to your Render dashboard
2. Navigate to your backend service
3. Go to "Cron Jobs" section
4. Add three cron jobs:

**Job 1: Price Ingestion**
- Schedule: `0 6 * * *`
- Command: `cd infra/scripts && npm run prices:ingest`

**Job 2: Metrics Refresh**
- Schedule: `0 7 * * *`
- Command: `cd infra/scripts && npm run metrics:refresh`

**Job 3: Daily Check**
- Schedule: `0 9 * * *`
- Command: `cd infra/scripts && npm run daily:check`

### Option 3: Railway Cron Jobs

If using Railway:

1. Create a separate service for cron jobs
2. Use Railway's cron job feature
3. Configure each job with the appropriate schedule

### Option 4: External Cron Service

Use services like:
- **Cron-job.org** - Free web-based cron service
- **EasyCron** - Reliable cron service
- **GitHub Actions** - Schedule workflows (free for public repos)

Example GitHub Actions workflow:

```yaml
# .github/workflows/daily-jobs.yml
name: Daily Jobs

on:
  schedule:
    - cron: '0 6 * * *'  # Price ingestion
    - cron: '0 7 * * *'  # Metrics refresh
    - cron: '0 9 * * *'  # Daily check
  workflow_dispatch:  # Allow manual trigger

jobs:
  price-ingestion:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd infra/scripts && npm install
      - run: npm run prices:ingest
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

  metrics-refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd infra/scripts && npm install
      - run: npm run metrics:refresh
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

  daily-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd infra/scripts && npm install
      - run: npm run daily:check
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

## Environment Variables

All scripts require the following environment variables:

```bash
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.uuxvjxdayeovhbduxmbu.supabase.co:5432/postgres
DIRECT_URL=postgresql://postgres:[PASSWORD]@db.uuxvjxdayeovhbduxmbu.supabase.co:5432/postgres
```

Make sure these are set in your cron job environment.

## Testing

Before deploying to production, test each script manually:

```bash
# Test price ingestion
cd infra/scripts
npm run prices:ingest

# Test metrics refresh
npm run metrics:refresh

# Test daily check
npm run daily:check
```

## Monitoring

### Logs

Each script logs to console. Monitor logs to ensure jobs are running successfully:

- Check for errors in script output
- Verify data is being written to database
- Monitor execution time

### Alerts

Consider setting up alerts for:
- Script failures
- Missing price data
- Portfolio metrics not updating

## Troubleshooting

### Scripts not running

1. Check cron job configuration
2. Verify environment variables are set
3. Check script permissions
4. Review logs for errors

### Missing price data

1. Verify Yahoo Finance API is accessible
2. Check rate limiting
3. Review asset symbols are valid

### Metrics not updating

1. Ensure price ingestion completed successfully
2. Check database connectivity
3. Verify portfolio positions exist

## Next Steps

1. Choose a cron job solution (recommended: Render or GitHub Actions)
2. Configure the three jobs with the recommended schedule
3. Test each job manually
4. Monitor logs for the first few days
5. Set up alerts for failures

---

**Last updated:** December 2024  
**Status:** Ready for production configuration



