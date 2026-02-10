# Margn

A complete web application for managing leveraged investment portfolios that implements a **Conditional DCA and Dynamic Leverage Management** strategy. The application allows users to manage leveraged portfolios with automated rebalancing strategies based on market signals, Sharpe Ratio optimization, and active risk management.

## 🎯 Project Overview

**Margn** implements an investment strategy where:
1. Users make periodic contributions (DCA - Dollar Cost Averaging)
2. The system automatically manages leverage between 2.5x and 4.0x
3. Asset weights are optimized using Sharpe Ratio algorithms
4. Contributions are deployed conditionally based on market signals (drawdown, weight deviation, volatility)
5. Clear recommendations and specific actions are provided to keep the portfolio within configured risk parameters

The strategy is based on quantitative analysis from the `leveraged-dca-simulator` project, using Monte Carlo simulation and historical backtesting to optimize leveraged portfolios.

## 🏗️ Architecture

### Monorepo Structure

```
margn/
├── apps/
│   ├── backend/          # NestJS API (Port 3003)
│   └── frontend/         # Next.js Dashboard (Port 3002)
├── packages/
│   └── shared/           # Shared types and utilities
└── infra/
    └── scripts/          # Scheduled jobs (cron)
```

### Technology Stack

**Backend:**
- NestJS 10.2.0
- Prisma ORM (PostgreSQL)
- Supabase (Auth + Database)
- TypeScript

**Frontend:**
- Next.js 14
- React 19
- TypeScript
- Supabase Client

**Infrastructure:**
- Supabase (PostgreSQL + Auth)
- Render/Railway (Backend hosting)
- Vercel (Frontend hosting)

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- PostgreSQL database (Supabase)

### Installation

```bash
# Install dependencies
npm install

# Sync database schema
cd apps/backend
npm run prisma:push
npm run prisma:generate
```

### Environment Variables

**Backend** (`apps/backend/.env`):
```bash
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres
DIRECT_URL=postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
FRONTEND_URL=http://localhost:3002
PORT=3003
ANTHROPIC_API_KEY=<anthropic-api-key>  # For AI backtest explanations
CRON_SECRET_TOKEN=<secret-token>        # For cron job authentication
```

**Frontend** (`apps/frontend/.env.local`):
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
NEXT_PUBLIC_API_URL=http://localhost:3003/api
```

### Development

```bash
# Run both backend and frontend
npm run dev

# Or run separately
npm run dev:backend   # Backend on http://localhost:3003
npm run dev:frontend  # Frontend on http://localhost:3002
```

## 📋 Features

### ✅ Implemented

- **Passwordless Authentication** - Magic link login via Supabase
- **Portfolio Management** - Create and manage leveraged portfolios
- **Monthly Contributions** - Register DCA contributions with deployment tracking
- **Manual Position Updates** - Update positions from broker data
- **Automated Rebalancing** - Sophisticated rebalancing algorithm with:
  - Sharpe Ratio optimization (Nelder-Mead)
  - Deploy signal evaluation (drawdown, weight deviation, volatility)
  - Gradual deployment (configurable factor)
- **Portfolio Configuration** - Customize strategy parameters:
  - Leverage range (min, max, target)
  - Target asset weights
  - Deploy signal thresholds
  - Sharpe optimization parameters
- **Recommendations Engine** - Actionable recommendations:
  - Leverage status alerts (low/high)
  - Specific purchase recommendations
  - Extra contribution calculations
  - Contribution day reminders
- **Analytics Dashboard** - Comprehensive metrics:
  - Equity, Exposure, Leverage tracking
  - CAGR, Sharpe Ratio, Volatility
  - Maximum Drawdown (Equity & Exposure)
  - Underwater Days calculation
  - Best/Worst day tracking
- **User Profile** - Personal information and notification preferences
- **Historical Data** - Monthly metrics history with pagination
- **Interactive Charts** - SVG-based equity history visualization
- **Historical Backtesting** - Configurable backtest simulator with:
  - Calendar-based rolling windows (consistent across crypto and traditional assets)
  - Sharpe optimization with optional dynamic monthly re-optimization
  - P10/P50/P90 percentile results sorted by Sharpe ratio
  - Proper margin call handling
- **Saved Strategies** - Save backtest configurations and results:
  - List with P10/P50/P90 metrics
  - Trajectory charts visualization
  - Create new portfolio from strategy configuration
- **AI Analysis** - Claude-powered backtest explanations with streaming responses
- **Auto-fill Price Gaps** - Automatic detection and download of missing historical data

### 🚧 In Progress / Planned

- Email/SMS notifications for urgent alerts
- Broker API integration (webhooks)
- Recommendation history tracking
- Data export (CSV/Excel)
- "What if" simulator before rebalancing

## 📡 API Endpoints

Base URL: `http://localhost:3003/api`

### Authentication
- `POST /auth/login` - Send magic link
- `GET /auth/me` - Get current user

### Users
- `GET /users/profile` - Get user profile
- `PUT /users/profile` - Update user profile

### Portfolios
- `GET /portfolios?email=...` - List user portfolios
- `GET /portfolios/:id` - Get portfolio details
- `GET /portfolios/:id/summary` - Get portfolio summary with analytics
- `GET /portfolios/:id/metrics` - Get monthly metrics history
- `GET /portfolios/:id/daily-metrics` - Get daily metrics

### Configuration
- `GET /portfolios/:portfolioId/configuration` - Get portfolio configuration
- `PUT /portfolios/:portfolioId/configuration` - Update configuration
- `GET /portfolios/:portfolioId/configuration/target-weights` - Get target weights
- `GET /portfolios/:portfolioId/configuration/is-contribution-day` - Check if today is contribution day

### Recommendations
- `GET /portfolios/:portfolioId/recommendations` - Get current recommendations

### Contributions
- `POST /contributions` - Register monthly contribution

### Positions
- `POST /positions` - Update portfolio positions (upsert)
- `GET /positions/search-symbols?q=...` - Search asset symbols

### Rebalancing
- `GET /portfolios/:portfolioId/rebalance/proposal` - Get rebalancing proposal
- `POST /portfolios/:portfolioId/rebalance/accept` - Accept and save rebalancing

### Strategies
- `GET /strategies` - List saved strategies
- `POST /strategies` - Save new strategy
- `GET /strategies/:id` - Get strategy detail
- `PATCH /strategies/:id` - Update strategy name
- `DELETE /strategies/:id` - Delete strategy
- `POST /strategies/:id/create-portfolio` - Create portfolio from strategy

### Backtest
- `GET /backtest/prices` - Get historical prices for backtest
- `POST /backtest/explain` - Get AI explanation for backtest results (SSE)

For complete API documentation, see `CLAUDE.md` (section "API endpoints").

## 🛠️ Infrastructure Scripts

### Price Ingestion
```bash
cd infra/scripts
npm run price:ingest
```
Fetches daily asset prices from Yahoo Finance and stores in `asset_prices` table.

**Cron:** Daily (e.g., 6 AM UTC)

### Metrics Refresh
```bash
cd infra/scripts
npm run metrics:refresh
```
Recalculates daily metrics for all portfolios and writes to `metrics_timeseries` and `daily_metrics`.

**Cron:** Daily (e.g., 7 AM UTC, after price-ingestion)

### Daily Check
```bash
cd infra/scripts
npm run daily:check
```
Daily portfolio verification:
- Calculates current state (equity, exposure, leverage)
- Evaluates deploy signals
- Detects leverage out of range
- Generates recommendations
- Stores daily metrics

**Cron:** Daily (e.g., 9 AM UTC, after metrics-refresh)

## 🗄️ Database Schema

The database schema is defined in `apps/backend/prisma/schema.prisma`. Main models:

- **User** - User accounts with notification preferences
- **Portfolio** - Portfolio configuration and strategy parameters
- **Asset** - Financial assets (crypto, commodities, indices, etc.)
- **PortfolioPosition** - Current holdings
- **MonthlyContribution** - DCA contributions with deployment tracking
- **RebalanceEvent** - Rebalancing history
- **RebalancePosition** - Target positions for rebalancing
- **AssetPrice** - Historical daily prices
- **MetricsTimeseries** - Monthly portfolio metrics
- **DailyMetric** - Daily portfolio metrics

See `CLAUDE.md` (section "Esquema de base de datos") for complete schema documentation.

## 🧮 Core Algorithms

### Rebalancing Algorithm

The rebalancing algorithm replicates the logic from `BacktestHistorical.ipynb`:

1. **Deploy Signal Evaluation:**
   - Drawdown > 12% → Full deploy
   - Weight deviation > 5% → Full deploy
   - Volatility < 18% → Full deploy
   - Gradual deploy factor (default: 0.5)

2. **Weight Optimization:**
   - Static weights for first 3 months
   - Dynamic Sharpe optimization after 3 months (Nelder-Mead)
   - 60% shrinkage to mean returns (conservatism)
   - Constraints: min 5%, max 40% per asset

3. **Target Exposure Calculation:**
   - Based on target leverage and available equity
   - Clamped between min/max leverage bounds

### Recommendations System

Generates actionable recommendations based on:
- **Leverage status:** Low (needs reborrow), High (needs extra contribution), In Range
- **Deploy signals:** Drawdown, weight deviation, volatility
- **Contribution days:** Reminders for scheduled contributions

## 🎨 Frontend Pages

- `/` - Login page (passwordless)
- `/dashboard` - Main dashboard with metrics, charts, and recommendations
- `/dashboard/contribution` - Register monthly contribution
- `/dashboard/manual-update` - Update positions manually
- `/dashboard/rebalance` - View and accept rebalancing proposals
- `/dashboard/configuration` - Configure portfolio strategy
- `/dashboard/backtest` - Historical backtest simulator with configurable parameters
- `/dashboard/strategies` - List of saved strategies with metrics
- `/dashboard/strategies/[id]` - Strategy detail with trajectories and apply to portfolio
- `/dashboard/onboarding` - Portfolio creation wizard (SSE progress)
- `/dashboard/profile` - User profile and preferences
- `/dashboard/help` - Help and documentation

## 🔐 Authentication

The app uses Supabase passwordless authentication:
1. User enters email
2. Receives magic link via email
3. Clicks link → redirects to dashboard
4. Token stored in `localStorage` as `supabase_token`

Backend verifies tokens by decoding JWT directly (no HTTP calls to Supabase) and searches for users by email in the local database.

## 📊 Key Metrics

The system calculates comprehensive portfolio analytics:

- **Equity** - Current capital (exposure - borrowed)
- **Exposure** - Total position value
- **Leverage** - Effective leverage (exposure / equity)
- **CAGR** - Compound annual growth rate
- **Sharpe Ratio** - Risk-adjusted return
- **Volatility** - Annualized standard deviation
- **Maximum Drawdown** - Largest drop from peak (Equity & Exposure)
- **Underwater Days** - Days where equity < total invested
- **Best/Worst Day** - Days with highest gain/loss

## 🐛 Known Issues

1. **Notifications:** User preferences are stored but no email/SMS delivery is implemented (only logging)

## 📚 Documentation

- **`CLAUDE.md`** - Comprehensive documentation for LLMs (complete project context)
- **`apps/backend/prisma/schema.prisma`** - Database schema
- **`apps/backend/src/`** - Backend source code
- **`apps/frontend/pages/`** - Frontend pages

## 🚀 Deployment

### Backend
- **Platform:** Render/Railway (Docker)
- **Database:** Supabase PostgreSQL
- **Cron Jobs:** Configure via platform schedulers or Supabase cron

### Frontend
- **Platform:** Vercel
- **Repository:** `github.com/clriesco/margn`
- **Build:** Automatic on push to main branch

## 🧪 Testing

### Automated Tests

```bash
# Backend unit tests
npm --workspace apps/backend run test

# Frontend unit tests
npm --workspace apps/frontend run test

# E2E tests
npm --workspace apps/backend run test:e2e
```

### Manual Testing

```bash
# Frontend
http://localhost:3002

# Backend health check
http://localhost:3003/api

# Test login
POST http://localhost:3003/api/auth/login
Body: { "email": "you@example.com" }
```

## 📝 Development Commands

```bash
# Install dependencies
npm install

# Development
npm run dev              # Both backend and frontend
npm run dev:backend      # Backend only
npm run dev:frontend      # Frontend only

# Database
cd apps/backend
npm run prisma:push      # Sync schema
npm run prisma:generate  # Generate Prisma Client
npm run prisma:studio    # Open Prisma Studio

# Build
npm run build            # Build all
cd apps/backend && npm run build
cd apps/frontend && npm run build

# Lint
npm run lint
```

## 🔮 Roadmap

### Done
- [x] Real equity calculation (track `borrowedAmount`)
- [x] Auth guard and portfolio ownership validation
- [x] Auto-fetch prices in position updates
- [x] Onboarding wizard with SSE progress
- [x] Backtest simulator with calendar-based rolling windows
- [x] Saved strategies with create portfolio from strategy
- [x] AI-powered backtest explanations
- [x] Cron jobs in production (GitHub Actions)
- [x] Test suite (67 tests: unit, integration, e2e)

### Medium Priority
- [ ] Email/SMS notifications for urgent alerts
- [ ] Recommendation history (persist past recommendations)

### Low Priority
- [x] Multiple portfolios per user
- [ ] Broker API integration
- [ ] Data export (CSV/Excel)

## 📄 License

Private project - All rights reserved

---

**Last updated:** February 2026
**Status:** Functional MVP with core features implemented
