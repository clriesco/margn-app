# README for LLM - Leveraged DCA App

## 📋 Project Overview

**Leveraged DCA App** is a complete web application for managing leveraged investment portfolios that implements a **Conditional DCA and Dynamic Leverage Management** strategy. The application allows users to manage leveraged portfolios with automated rebalancing strategies based on market signals, Sharpe Ratio optimization, and active risk management.

### Main Purpose

The application implements an investment strategy where:
1. Users make periodic contributions (DCA - Dollar Cost Averaging)
2. The system automatically manages leverage between 2.5x and 4.0x
3. Asset weights are optimized using Sharpe Ratio algorithms
4. Contributions are deployed conditionally based on market signals (drawdown, weight deviation, volatility)
5. Clear recommendations and specific actions are provided to keep the portfolio within configured risk parameters

### Strategy Context

The strategy is based on quantitative analysis performed in the `leveraged-dca-simulator` project, which uses Monte Carlo simulation and historical backtesting to optimize leveraged portfolios. Key principles are:

- **Priority:** Reduce liquidation risk over maximizing growth
- **Non-automatic contributions:** Contributions are recorded but deployed conditionally
- **Dynamic leverage management:** Reborrow when equity increases, reduction when leverage is high
- **Conditional deployment:** Based on drawdown signals (>12%), weight deviation (>5%), and volatility (<18%)

---

## 🏗️ Project Architecture

### Monorepo Structure

```
leveraged-dca-app/
├── apps/
│   ├── backend/              # NestJS API (Port 3003)
│   │   ├── src/
│   │   │   ├── auth/         # Supabase authentication
│   │   │   ├── users/        # User and profile management
│   │   │   ├── portfolios/   # Portfolio management, configuration, recommendations
│   │   │   ├── positions/    # Current positions management
│   │   │   ├── contributions/ # Contribution registration
│   │   │   ├── rebalance/    # Rebalancing and optimization logic
│   │   │   └── prisma/       # Prisma ORM service
│   │   └── prisma/
│   │       └── schema.prisma # Database schema
│   └── frontend/             # Next.js Dashboard (Port 3002)
│       ├── pages/
│       │   ├── index.tsx                    # Login
│       │   └── dashboard/
│       │       ├── index.tsx                # Main dashboard
│       │       ├── contribution.tsx         # Register contribution
│       │       ├── manual-update.tsx        # Manually update positions
│       │       ├── rebalance.tsx            # Rebalance portfolio
│       │       ├── configuration.tsx       # Configure strategy
│       │       └── profile.tsx              # User profile
│       ├── components/
│       │   ├── DashboardSidebar.tsx        # Collapsible sidebar
│       │   └── DashboardMenu.tsx           # (Deprecated, use DashboardSidebar)
│       ├── contexts/
│       │   └── AuthContext.tsx             # Authentication context
│       └── lib/
│           ├── api.ts                      # API client
│           └── supabase.ts                 # Supabase client
├── packages/
│   └── shared/              # Shared types and utilities
└── infra/
    └── scripts/             # Scheduled jobs (cron)
        ├── price-ingestion.ts    # Daily price ingestion
        ├── metrics-refresh.ts    # Recalculate metrics
        └── daily-check.ts        # Daily portfolio verification
```

### Technology Stack

**Backend:**
- **NestJS 10.2.0** - Node.js framework for APIs
- **Prisma ORM** - ORM for PostgreSQL
- **PostgreSQL** - Database (hosted on Supabase)
- **Supabase** - Passwordless authentication (magic links) + Database hosting
- **TypeScript** - Main language
- **jsonwebtoken** - JWT token decoding

**Frontend:**
- **Next.js 14** - React framework
- **React 19** - UI library
- **TypeScript** - Main language
- **Supabase Client** - Frontend authentication
- **SVG** - Custom charts (no heavy dependencies)

**Infrastructure:**
- **Supabase** - PostgreSQL database + Auth
- **Render/Railway** - Backend hosting (Docker)
- **Vercel** - Frontend hosting (Next.js)
- **Cron Jobs** - Scheduled scripts (full configuration pending)

---

## 🗄️ Data Model

### Complete Prisma Schema

The schema is located at `apps/backend/prisma/schema.prisma`. Main models:

#### User
- `id` (UUID) - Unique user ID
- `email` (String, unique) - User email (used for login)
- `fullName` (String?) - Optional full name
- `notifyOnRecommendations` (Boolean) - Notification preference
- `notifyOnContributions` (Boolean)
- `notifyOnLeverageAlerts` (Boolean)
- `notifyOnRebalance` (Boolean)
- Relation: `portfolios` (1:N)

#### Portfolio
- `id` (UUID) - Unique portfolio ID
- `userId` (UUID) - Owner user
- `name` (String) - Portfolio name
- `baseCurrency` (String, default: "USD")
- **Leverage:**
  - `leverageMin` (Float, default: 2.5)
  - `leverageMax` (Float, default: 4.0)
  - `leverageTarget` (Float, default: 3.0)
- `initialCapital` (Float) - Initial capital
- **Contributions:**
  - `monthlyContribution` (Float?) - Monthly amount
  - `contributionFrequency` (String, default: "monthly") - 'weekly', 'biweekly', 'monthly', 'quarterly'
  - `contributionDayOfMonth` (Int, default: 1) - Day of month (1-31) or day of week (0-6) depending on frequency
  - `contributionEnabled` (Boolean, default: true)
- **Target Weights:**
  - `targetWeightsJson` (String?, Text) - JSON with target weights: `{"SPY": 0.6, "GLD": 0.25, "BTC-USD": 0.15}`
- **Constraints:**
  - `maxWeight` (Float, default: 0.4) - Maximum 40% per asset
  - `minWeight` (Float, default: 0.05) - Minimum 5% per asset
- **Risk Parameters:**
  - `maintenanceMarginRatio` (Float, default: 0.05) - 5%
- **Deploy Signal Thresholds:**
  - `drawdownRedeployThreshold` (Float, default: 0.12) - 12%
  - `weightDeviationThreshold` (Float, default: 0.05) - 5%
  - `volatilityLookbackDays` (Int, default: 63) - 63 days
  - `volatilityRedeployThreshold` (Float, default: 0.18) - 18%
  - `gradualDeployFactor` (Float, default: 0.5) - Gradual factor
- **Optimization:**
  - `useDynamicSharpeRebalance` (Boolean, default: true)
  - `meanReturnShrinkage` (Float, default: 0.6) - 60% shrinkage
  - `riskFreeRate` (Float, default: 0.02) - 2%
- Relations: `positions`, `contributions`, `rebalanceEvents`, `metricsTimeseries`, `dailyMetrics`

#### Asset
- `id` (UUID)
- `symbol` (String, unique) - Asset symbol (e.g., "SPY", "GLD", "BTC-USD")
- `name` (String) - Full name
- `assetType` (String) - 'crypto', 'commodity', 'index', 'bond', 'stock'
- `metadataJson` (String?, Text) - Additional metadata in JSON
- Relations: `positions`, `prices`, `rebalancePositions`

#### PortfolioPosition
- `id` (UUID)
- `portfolioId` (UUID)
- `assetId` (UUID)
- `quantity` (Float) - Asset quantity
- `avgPrice` (Float) - Average purchase price
- `exposureUsd` (Float) - Value in USD (quantity × avgPrice)
- Unique constraint: `[portfolioId, assetId]`
- Relations: `portfolio`, `asset`

#### MonthlyContribution
- `id` (UUID)
- `portfolioId` (UUID)
- `amount` (Float) - Contribution amount
- `contributedAt` (DateTime) - Registration date
- `note` (String?) - Optional note
- **Deployment Tracking:**
  - `deployed` (Boolean, default: false) - Whether it was deployed
  - `deployedAmount` (Float, default: 0) - Deployed amount (can be partial)
  - `deploymentReason` (String?) - Reason: 'drawdown', 'weight_deviation', 'volatility', 'manual', 'leverage_low'
- Relations: `portfolio`, `rebalanceEvents`

#### RebalanceEvent
- `id` (UUID)
- `portfolioId` (UUID)
- `contributionId` (UUID?) - Associated contribution (if applicable)
- `triggeredBy` (String) - 'user', 'auto'
- `targetLeverage` (Float) - Target leverage for rebalancing
- `createdAt` (DateTime)
- Relations: `portfolio`, `contribution`, `positions`

#### RebalancePosition
- `id` (UUID)
- `rebalanceEventId` (UUID)
- `assetId` (UUID)
- `targetWeight` (Float) - Target weight
- `targetUsd` (Float) - Target value in USD
- `deltaQuantity` (Float) - Quantity change (positive = BUY, negative = SELL)
- Relations: `rebalanceEvent`, `asset`

#### AssetPrice
- `id` (UUID)
- `assetId` (UUID)
- `date` (Date) - Price date
- `close` (Float) - Closing price
- `adjClose` (Float?) - Adjusted price
- `source` (String, default: "yfinance") - Price source
- Unique constraint: `[assetId, date]`
- Index: `[assetId, date]`
- Relation: `asset`

#### MetricsTimeseries
- `id` (UUID)
- `portfolioId` (UUID)
- `date` (Date) - Metric date
- `equity` (Float) - Capital (equity)
- `exposure` (Float) - Total exposure
- `leverage` (Float) - Effective leverage (exposure / equity)
- `sharpe` (Float?) - Sharpe Ratio
- `drawdown` (Float?) - Drawdown from peak
- `borrowedAmount` (Float?) - Borrowed amount
- `marginRatio` (Float?) - Margin ratio (equity / exposure)
- `metadataJson` (String?, Text) - Additional metadata
- Unique constraint: `[portfolioId, date]`
- Index: `[portfolioId, date]`
- Relation: `portfolio`

#### DailyMetric
- Similar to `MetricsTimeseries` but for daily tracking
- Additional fields: `peakEquity` (Float?) - Historical equity peak
- Unique constraint: `[portfolioId, date]`
- Index: `[portfolioId, date]`

---

## 🔐 Authentication and Authorization

### Authentication Flow

1. **Passwordless Login:**
   - User enters email in frontend (`/`)
   - Frontend calls `POST /api/auth/login` with email
   - Backend sends magic link via Supabase
   - User clicks link → Supabase redirects to `/dashboard`
   - Frontend saves token in `localStorage` as `supabase_token`

2. **Session Verification:**
   - Frontend sends token in header `Authorization: Bearer <token>`
   - Backend decodes JWT directly (no HTTP call to Supabase)
   - Searches for user by email in local database
   - Returns user data

### Technical Implementation

**Backend (`auth.service.ts`):**
- `verifySession(token: string)` - Decodes JWT and searches for user by email
- Does not make HTTP calls to Supabase (avoids connectivity issues)
- Verifies token expiration
- Returns `null` if token invalid or user doesn't exist

**Frontend (`AuthContext.tsx`):**
- Manages session with Supabase Client
- Saves token in `localStorage`
- Provides `useAuth()` context to entire app
- Redirects to login if not authenticated

**Important Note:** The user ID in Supabase (`sub` from JWT) may differ from the ID in the local database. That's why we search by email, which is the common field.

---

## 📡 API Endpoints

Base URL: `http://localhost:3003/api` (development) or environment variable in production.

### Authentication

#### POST /auth/login
Sends magic link for passwordless login.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "message": "Magic link sent to your email",
  "email": "user@example.com"
}
```

#### GET /auth/me
Gets current authenticated user.

**Headers:**
```
Authorization: Bearer <supabase-token>
```

**Response:**
```json
{
  "id": "uuid",
  "email": "user@example.com"
}
```

### Users

#### GET /users/profile
Gets current user profile.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "fullName": "John Doe",
  "notifyOnRecommendations": true,
  "notifyOnContributions": true,
  "notifyOnLeverageAlerts": true,
  "notifyOnRebalance": true
}
```

#### PUT /users/profile
Updates user profile.

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "fullName": "John Doe",
  "notifyOnRecommendations": false
}
```

### Portfolios

#### GET /portfolios?email=...
Lists user portfolios by email.

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Main Portfolio",
    "userId": "uuid",
    "leverageMin": 2.5,
    "leverageMax": 4.0,
    "initialCapital": 10000
  }
]
```

#### GET /portfolios/:id
Gets portfolio details with positions.

**Response:**
```json
{
  "id": "uuid",
  "name": "Main Portfolio",
  "positions": [
    {
      "id": "uuid",
      "asset": {
        "symbol": "GLD",
        "name": "Gold ETF"
      },
      "quantity": 250,
      "avgPrice": 348,
      "exposureUsd": 87000
    }
  ]
}
```

#### GET /portfolios/:id/summary
Summary with calculated metrics and positions.

**Response:**
```json
{
  "metrics": {
    "equity": 72500,
    "exposure": 217500,
    "leverage": 3.0,
    "totalContributions": 70000,
    "absoluteReturn": 2500,
    "percentReturn": 3.57,
    "startDate": "2025-01-01",
    "lastUpdate": "2025-12-30"
  },
  "positions": [
    {
      "id": "uuid",
      "asset": {
        "symbol": "GLD",
        "name": "Gold ETF"
      },
      "quantity": 250,
      "weight": 0.33,
      "exposureUsd": 87000
    }
  ],
  "analytics": {
    "capitalFinal": 72500,
    "totalInvested": 70000,
    "absoluteReturn": 2500,
    "totalReturnPercent": 3.57,
    "cagr": 0.035,
    "volatility": 0.15,
    "sharpe": 1.85,
    "maxDrawdownEquity": -0.12,
    "maxDrawdownExposure": -0.10,
    "underwaterDays": 15,
    "bestDay": {
      "date": "2025-06-15",
      "return": 0.05
    },
    "worstDay": {
      "date": "2025-03-20",
      "return": -0.08
    }
  }
}
```

#### GET /portfolios/:id/metrics
Monthly metrics history.

**Response:**
```json
{
  "portfolioId": "uuid",
  "metrics": [
    {
      "date": "2025-11-25",
      "equity": 72500,
      "exposure": 217500,
      "leverage": 3.0,
      "sharpe": 1.85,
      "drawdown": -12.5
    }
  ]
}
```

#### GET /portfolios/:id/daily-metrics
Daily metrics.

### Portfolio Configuration

#### GET /portfolios/:portfolioId/configuration
Gets complete portfolio configuration.

**Response:**
```json
{
  "id": "uuid",
  "name": "Main Portfolio",
  "monthlyContribution": 1000,
  "contributionFrequency": "monthly",
  "contributionDayOfMonth": 1,
  "contributionEnabled": true,
  "leverageMin": 2.5,
  "leverageMax": 4.0,
  "leverageTarget": 3.0,
  "targetWeights": [
    { "symbol": "GLD", "weight": 0.33 },
    { "symbol": "BTC-USD", "weight": 0.34 },
    { "symbol": "SPY", "weight": 0.33 }
  ],
  "drawdownRedeployThreshold": 0.12,
  "weightDeviationThreshold": 0.05,
  "volatilityRedeployThreshold": 0.18,
  "useDynamicSharpeRebalance": true
}
```

#### PUT /portfolios/:portfolioId/configuration
Updates configuration.

**Request:**
```json
{
  "monthlyContribution": 1500,
  "contributionDayOfMonth": 15,
  "targetWeights": [
    { "symbol": "GLD", "weight": 0.25 },
    { "symbol": "BTC-USD", "weight": 0.40 },
    { "symbol": "SPY", "weight": 0.35 }
  ]
}
```

#### GET /portfolios/:portfolioId/configuration/target-weights
Gets only target weights.

#### GET /portfolios/:portfolioId/configuration/is-contribution-day
Checks if today is contribution day.

**Response:**
```json
{
  "isContributionDay": true,
  "nextContributionDate": "2025-01-01T00:00:00.000Z"
}
```

### Recommendations

#### GET /portfolios/:portfolioId/recommendations
Gets current recommendations based on portfolio state.

**Response:**
```json
{
  "portfolioId": "uuid",
  "currentState": {
    "equity": 72500,
    "exposure": 217500,
    "leverage": 3.0,
    "marginRatio": 0.33,
    "peakEquity": 75000,
    "pendingContributions": 1000
  },
  "signals": {
    "drawdown": -0.05,
    "drawdownTriggered": false,
    "weightDeviation": 0.02,
    "weightDeviationTriggered": false,
    "volatility": 0.22,
    "volatilityTriggered": false,
    "anySignalTriggered": false,
    "deployFraction": 0
  },
  "recommendations": [
    {
      "type": "in_range",
      "priority": "low",
      "title": {
        "code": "IN_RANGE_TITLE",
        "params": {}
      },
      "description": {
        "code": "IN_RANGE_DESCRIPTION",
        "params": { "leverage": 3.0 }
      }
    }
  ],
  "isContributionDay": true,
  "nextContributionDate": "2025-01-01T00:00:00.000Z"
}
```

**Recommendation Types:**
- `in_range` - Portfolio in range, no action required
- `contribution_due` - Monthly contribution reminder
- `leverage_low` - Low leverage, needs reborrow (includes specific purchases)
- `leverage_high` - High leverage, needs extra contribution
- `deploy_signal` - Deploy signal activated
- `rebalance_needed` - Rebalancing recommended

**Priorities:**
- `low` - Informational
- `medium` - Recommended action
- `high` - Important action
- `urgent` - Urgent action

### Contributions

#### POST /contributions
Registers a monthly contribution.

**Request:**
```json
{
  "portfolioId": "uuid",
  "amount": 1000,
  "note": "Monthly DCA - November 2025"
}
```

**Response:**
```json
{
  "id": "uuid",
  "portfolioId": "uuid",
  "amount": 1000,
  "contributedAt": "2025-11-25T22:00:00.000Z",
  "note": "Monthly DCA - November 2025",
  "deployed": false
}
```

### Positions

#### POST /positions
Updates portfolio positions (upsert).

**Request:**
```json
{
  "portfolioId": "uuid",
  "positions": [
    {
      "assetId": "uuid-for-gold",
      "quantity": 250,
      "avgPrice": 348
    }
  ]
}
```

**Response:**
```json
{
  "portfolioId": "uuid",
  "updated": 3,
  "positions": [...]
}
```

#### GET /positions/search-symbols?q=SPY
Searches for asset symbols.

### Rebalancing

#### GET /portfolios/:portfolioId/rebalance/proposal
Gets rebalancing proposal.

**Response:**
```json
{
  "portfolioId": "uuid",
  "currentState": {
    "equity": 72500,
    "exposure": 217500,
    "leverage": 3.0
  },
  "targetState": {
    "equity": 75000,
    "exposure": 225000,
    "leverage": 3.0
  },
  "signals": {
    "drawdown": -0.05,
    "drawdownTriggered": false,
    "weightDeviation": 0.02,
    "weightDeviationTriggered": false,
    "volatility": 0.22,
    "volatilityTriggered": false,
    "deployFraction": 0
  },
  "instructions": [
    {
      "assetSymbol": "GLD",
      "action": "BUY",
      "currentQuantity": 250,
      "targetQuantity": 260,
      "deltaQuantity": 10,
      "currentWeight": 0.33,
      "targetWeight": 0.33,
      "valueUsd": 3480
    }
  ],
  "equityUsed": 2500,
  "borrowUsed": 0,
  "pendingContributionUsed": 2500
}
```

#### POST /portfolios/:portfolioId/rebalance/accept
Accepts and saves a rebalancing.

**Request:**
```json
{
  "targetLeverage": 3.0,
  "instructions": [
    {
      "assetId": "uuid",
      "targetWeight": 0.33,
      "targetUsd": 75000,
      "deltaQuantity": 10
    }
  ]
}
```

**Response:**
```json
{
  "rebalanceEventId": "uuid",
  "updated": true
}
```

---

## 🧮 Core Business Logic

### Metrics Calculation

#### Equity (Capital)
```typescript
equity = exposure - borrowedAmount
```
If `borrowedAmount` is not available, it's approximated as:
```typescript
equity = exposure / leverage
```

#### Leverage
```typescript
leverage = exposure / equity
```

#### Margin Ratio
```typescript
marginRatio = equity / exposure
```

#### Drawdown
```typescript
drawdown = (currentEquity - peakEquity) / peakEquity
```

### Rebalancing Algorithm

The algorithm is implemented in `rebalance.service.ts` and replicates the logic from the `BacktestHistorical.ipynb` notebook.

#### 1. Deploy Signal Evaluation

**Drawdown Signal:**
```typescript
if (drawdown < -drawdownRedeployThreshold) {
  // Drawdown > 12% → Full deploy
  deployFraction = 1.0
}
```

**Weight Deviation Signal:**
```typescript
weightDeviation = max(|currentWeight[i] - targetWeight[i]|)
if (weightDeviation > weightDeviationThreshold) {
  // Deviation > 5% → Full deploy
  deployFraction = 1.0
}
```

**Volatility Signal:**
```typescript
volatility = calculateRealizedVolatility(63 days)
if (volatility < volatilityRedeployThreshold) {
  // Volatility < 18% → Full deploy
  deployFraction = 1.0
}
```

**Gradual Deploy:**
```typescript
if (deployFraction > 0) {
  deployFraction = deployFraction * gradualDeployFactor // 0.5
}
```

#### 2. Weight Optimization

**Static Weights (First 3 months):**
- Uses portfolio's `targetWeightsJson` directly

**Dynamic Sharpe Optimization (After 3 months):**
- Maximizes Sharpe Ratio using Nelder-Mead algorithm
- Applies 60% shrinkage to mean returns (conservatism)
- Considers constraints: `minWeight` and `maxWeight`
- Risk-free rate: 2%

**Sharpe Calculation:**
```typescript
sharpe = (meanReturn - riskFreeRate) / volatility
```

#### 3. Target Exposure Calculation

```typescript
// Available equity
availableEquity = currentEquity + pendingContributions * deployFraction

// Target exposure based on target leverage
targetExposure = availableEquity * targetLeverage

// Ensure it's within min/max
minExposure = currentEquity * leverageMin
maxExposure = currentEquity * leverageMax
targetExposure = clamp(targetExposure, minExposure, maxExposure)
```

#### 4. Weight Distribution

```typescript
for each asset in targetWeights:
  targetUsd = targetExposure * targetWeight
  currentUsd = currentQuantity * currentPrice
  deltaQuantity = (targetUsd - currentUsd) / currentPrice
  
  if (deltaQuantity > 0):
    action = "BUY"
  else if (deltaQuantity < 0):
    action = "SELL"
  else:
    action = "HOLD"
```

### Recommendations System

Implemented in `portfolio-recommendations.service.ts`.

#### Recommendation Cases

**Case 1: In Range (Leverage between min and max)**
- No action required
- Only reminder if it's contribution day

**Case 2: Low Leverage (< minimum)**
- Calculates additional exposure needed
- Distributes according to target weights
- Provides specific purchases (quantity, price, USD value)

**Case 3: High Leverage (> maximum)**
- Calculates extra contribution needed
- Formula: `extraContribution = (exposure / maxLeverage) - equity`
- The contribution is used as additional collateral without increasing exposure

**Case 4: Deploy Signal Activated**
- Recommends complete rebalancing
- Shows which signal was activated

### Analytics Calculation

Implemented in `portfolios.service.ts`.

**Calculated Metrics:**
- `capitalFinal` - Current equity
- `totalInvested` - Initial capital + all contributions
- `absoluteReturn` - `capitalFinal - totalInvested`
- `totalReturnPercent` - `(capitalFinal - totalInvested) / totalInvested`
- `cagr` - Compound annual growth rate
- `volatility` - Annualized standard deviation of daily returns
- `sharpe` - `(meanReturn - riskFreeRate) / volatility`
- `maxDrawdownEquity` - Maximum drop from peak equity
- `maxDrawdownExposure` - Maximum drop from peak exposure
- `underwaterDays` - Days where equity < accumulated total invested
- `bestDay` / `worstDay` - Days with highest gain/loss

---

## 🎨 Frontend - Pages and Components

### Main Pages

#### `/` (index.tsx)
- Login page
- Email form
- Sends magic link
- Redirects to dashboard if already authenticated

#### `/dashboard` (index.tsx)
**Main Dashboard:**
- **Main metrics:** Equity, Exposure, Leverage, Returns
- **Recommendations:** Panel with alerts and suggested actions
- **Equity Chart:** Interactive SVG history with tooltip
- **Analytics:** Grid with all metrics (CAGR, Sharpe, Drawdown, etc.)
- **Monthly History:** Paginated table (24 items per page, reverse order)
- **Current Positions:** Table with buttons to "Manual Update" and "Rebalance"
- **Skeleton Loading:** Loading states for all sections

#### `/dashboard/contribution` (contribution.tsx)
- Form to register monthly contribution
- Fields: amount, optional note
- Supports extra contribution (query params: `?extra=true&amount=X`)

#### `/dashboard/manual-update` (manual-update.tsx)
- Form to manually update positions
- Fields: current equity, quantities per asset
- Loads current positions as default values

#### `/dashboard/rebalance` (rebalance.tsx)
- Shows rebalancing proposal
- Current state vs. after rebalancing comparison
- Instructions table (BUY/SELL/HOLD) with exact quantities
- Equity/borrow breakdown
- "Accept and Save" button (disabled if no actions)
- Message if rebalancing is not necessary

#### `/dashboard/configuration` (configuration.tsx)
- Complete portfolio configuration panel
- **Contribution:** Amount, frequency, day, enabled
- **Leverage:** Min, Max, Target
- **Target Weights:** Visual editor with validation (sums to 100%)
- **Deploy Signals:** Configurable thresholds
- **Sharpe Optimization:** Advanced parameters (only visible if `useDynamicSharpeRebalance`)

#### `/dashboard/profile` (profile.tsx)
- **Personal Information:** Email (read-only), Full name
- **Notification Preferences:** Checkboxes for each type

### Reusable Components

#### DashboardSidebar
- Collapsible sidebar (similar to Supabase app)
- Shows only icons when collapsed
- Navigation items:
  - Dashboard
  - + Contribution
  - Rebalance
  - Manual Update
  - Configuration
  - My Profile
- Sign out button at the bottom

#### AnalyticsCard
- Card to display metrics with tooltip
- Information icon next to label
- Tooltip shows description on hover

#### EquityChart
- Custom SVG chart of equity history
- Interactive with tooltip
- Shows selected point (circle + vertical line)
- Width: 1200px (adjusted for better alignment)

#### DashboardRecommendationCard
- Card to display recommendations
- Colors according to priority (urgent=red, high=orange, etc.)
- Shows specific actions (purchases, extra contribution)
- "Go to action" button with dynamic URL

### Translation System

**Structure:**
- Backend sends message codes with parameters
- Frontend has `lib/translations.ts` file with translations
- `t(code, params)` function to translate

**Example:**
```typescript
// Backend
{
  "title": {
    "code": "LEVERAGE_LOW_TITLE",
    "params": { "leverage": 2.1 }
  }
}

// Frontend
t("LEVERAGE_LOW_TITLE", { leverage: 2.1 })
// → "Leverage Bajo (2.10x)"
```

---

## 🔄 Workflows

### First Use Flow

1. User accesses `/`
2. Enters email
3. Receives magic link
4. Clicks link → redirects to `/dashboard`
5. System searches for portfolio by email
6. If it doesn't exist, needs to create one (pending implementation)

### Monthly Contribution Flow

1. User goes to `/dashboard/contribution`
2. Enters amount (e.g., $1,000)
3. System saves to `monthly_contributions` with `deployed: false`
4. Contribution remains "pending" until rebalancing
5. Daily job evaluates if it should be deployed according to signals

### Manual Update Flow

1. User goes to `/dashboard/manual-update`
2. Enters current equity and quantities per asset
3. System updates `portfolio_positions`
4. System recalculates metrics (equity, exposure, leverage)
5. System evaluates signals and generates recommendations

### Rebalancing Flow

1. User goes to `/dashboard/rebalance`
2. System calculates proposal:
   - Evaluates signals (drawdown, weight deviation, volatility)
   - Calculates deploy fraction
   - Optimizes weights (Sharpe or static)
   - Calculates target positions
3. User reviews instructions (BUY/SELL/HOLD)
4. User executes trades in their broker
5. User accepts proposal → System:
   - Saves `rebalance_event`
   - Updates `portfolio_positions`
   - Marks contributions as `deployed: true`
   - Creates entry in `metrics_timeseries` (using `upsert` to avoid duplicates)

### Daily Recommendations Flow

1. Daily job (`daily-check.ts`) executes (cron)
2. For each portfolio:
   - Calculates current state (equity, exposure, leverage)
   - Evaluates deploy signals
   - Detects if leverage is out of range
   - Generates recommendations
   - Saves to `daily_metrics`
3. User opens dashboard and sees recommendations
4. User can act according to recommendations

### Configuration Flow

1. User goes to `/dashboard/configuration`
2. Modifies parameters (leverage, target weights, thresholds)
3. System validates (e.g., target weights sum to 100%)
4. System saves to `portfolios` table
5. Next recommendations use new configuration

---

## 🛠️ Infrastructure Scripts

### price-ingestion.ts

**Purpose:** Gets daily asset prices from Yahoo Finance.

**Location:** `infra/scripts/price-ingestion.ts`

**Functionality:**
- Reads asset list from database
- Gets prices from Yahoo Finance using `yfinance`
- Upserts into `asset_prices` (avoids duplicates by `[assetId, date]`)
- Rate limiting included

**Execution:**
```bash
cd infra/scripts
npm run price:ingest
```

**Cron:** Daily (e.g., 6 AM UTC)

### metrics-refresh.ts

**Purpose:** Recalculates daily metrics for all portfolios.

**Location:** `infra/scripts/metrics-refresh.ts`

**Functionality:**
- For each portfolio:
  - Gets current positions
  - Gets most recent prices
  - Calculates equity, exposure, leverage
  - Saves to `metrics_timeseries` (monthly) and `daily_metrics` (daily)

**Execution:**
```bash
cd infra/scripts
npm run metrics:refresh
```

**Cron:** Daily (e.g., 7 AM UTC, after price-ingestion)

### daily-check.ts

**Purpose:** Daily portfolio verification and recommendation generation.

**Location:** `infra/scripts/daily-check.ts`

**Functionality:**
- For each portfolio:
  - Calculates current state
  - Evaluates deploy signals
  - Detects leverage out of range
  - Generates recommendations
  - Saves to `daily_metrics`
  - (Future) Sends notifications

**Execution:**
```bash
cd infra/scripts
npm run daily:check
```

**Cron:** Daily (e.g., 9 AM UTC, after metrics-refresh)

---

## ⚙️ Configuration and Environment Variables

### Backend (.env)

```bash
# Database
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.uuxvjxdayeovhbduxmbu.supabase.co:5432/postgres
DIRECT_URL=postgresql://postgres:[PASSWORD]@db.uuxvjxdayeovhbduxmbu.supabase.co:5432/postgres

# Supabase
SUPABASE_URL=https://uuxvjxdayeovhbduxmbu.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# App
FRONTEND_URL=http://localhost:3002
PORT=3003
```

### Frontend (.env.local)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://uuxvjxdayeovhbduxmbu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
NEXT_PUBLIC_API_URL=http://localhost:3003/api
```

---

## 🚀 Development Commands

### Installation

```bash
# From project root
npm install
```

### Development

```bash
# Backend and frontend in parallel
npm run dev

# Backend only
npm run dev:backend

# Frontend only
npm run dev:frontend
```

### Database

```bash
cd apps/backend

# Sync schema
npm run prisma:push

# Generate Prisma Client
npm run prisma:generate

# Open Prisma Studio
npm run prisma:studio
```

### Build

```bash
# Build everything
npm run build

# Build backend
cd apps/backend && npm run build

# Build frontend
cd apps/frontend && npm run build
```

---

## 🐛 Known Issues and Limitations

### Known Issues

1. **Portfolio ownership not validated:**
   - Auth guard exists on all controllers, but individual portfolio endpoints don't verify the portfolio belongs to the requesting user
   - Anyone with a valid token and a `portfolioId` can access any portfolio

2. **Cron jobs not scheduled in production:**
   - Scripts exist in `infra/scripts/` and work correctly
   - No Render cron job or external scheduler configured yet

### Current Limitations

1. **Single portfolio per user:**
   - System assumes one portfolio per user
   - No support for multiple portfolios

2. **No broker integration:**
   - Everything is manual
   - No webhooks or broker APIs (Quantfury, etc.)

3. **No real notifications:**
   - User notification preferences are stored in database but not used
   - System generates recommendations but doesn't send emails/SMS
   - Only shows in dashboard

4. **No recommendation history:**
   - Recommendations are calculated on-the-fly
   - No history of previous recommendations is saved

---

## 📊 Implementation Status

| Module | Status | Notes |
|--------|--------|-------|
| Authentication | ✅ Complete | Passwordless with Supabase, auth guard on all endpoints |
| User Management | ✅ Complete | Profile + notification preferences |
| Portfolio Management | ✅ Complete | CRUD, onboarding wizard with SSE, summary, analytics |
| Contributions | ✅ Complete | Recording, history endpoint, deployed tracking |
| Position Updates | ✅ Complete | Auto-fetch prices, historical download for new tickers |
| Rebalancing | ✅ Complete | Sharpe optimization (Nelder-Mead), deploy signals |
| Configuration | ✅ Complete | Full panel with all strategy parameters |
| Recommendations | ✅ Complete | Real-time alerts, missing persistence of history |
| Visualizations | ✅ Complete | Dashboard charts, backtest simulator page |
| Analytics | ✅ Complete | CAGR, XIRR, Sharpe, drawdown, underwater days |
| Equity Model | ✅ Complete | borrowedAmount tracked across all services |
| Infrastructure Scripts | ⚠️ Partial | Scripts work, cron scheduling not configured |
| Portfolio Ownership | ⚠️ Missing | Auth guard exists but no per-portfolio ownership check |
| Notifications | ⚠️ Missing | Preferences stored, no delivery (email/SMS) |
| Testing | ❌ Not implemented | No tests |

---

## 🎯 Conventions and Patterns

### Naming Conventions

- **Backend:** camelCase for variables, PascalCase for classes
- **Frontend:** camelCase for variables, PascalCase for components
- **Database:** snake_case for columns (mapped from camelCase in Prisma)
- **API Endpoints:** kebab-case (e.g., `/portfolios/:id/daily-metrics`)

### Code Structure

- **Backend:** NestJS modules with Controller, Service, DTOs
- **Frontend:** Pages in `pages/`, components in `components/`, utilities in `lib/`
- **Shared:** Shared types and interfaces in `packages/shared`

### Error Handling

- **Backend:** Uses NestJS exceptions (`UnauthorizedException`, `NotFoundException`, etc.)
- **Frontend:** Try/catch with user-friendly error messages
- **API:** Standard error responses: `{ statusCode, message, error }`

### Authentication

- Supabase JWT token in `localStorage` as `supabase_token`
- `Authorization: Bearer <token>` header in all requests
- Backend decodes JWT directly (no HTTP calls to Supabase)

### Internationalization

- Backend sends message codes with parameters
- Frontend translates using `t(code, params)` function
- Current language: Spanish (codes prepared for multiple languages)

---

## 📚 References and Additional Documentation

### Documentation Files

- `README.md` - Basic project documentation
- `ENDPOINTS.md` - Complete API endpoints documentation
- `ANALISIS_PROYECTO.md` - Detailed project analysis
- `PLAN_ACCION_ESTRATEGIA.md` - Strategy implementation plan
- `PLAN_INTERNACIONALIZACION.md` - Internationalization plan

### Related Projects

- `leveraged-dca-simulator/` - Notebooks with original quantitative analysis
  - `MonteCarloSimulator.ipynb` - Simulation and optimization
  - `BacktestHistorical.ipynb` - Comparative backtest

### External Resources

- **Supabase Docs:** https://supabase.com/docs
- **NestJS Docs:** https://docs.nestjs.com
- **Next.js Docs:** https://nextjs.org/docs
- **Prisma Docs:** https://www.prisma.io/docs

---

## 🔮 Next Steps and Future Improvements

### High Priority

1. **Portfolio ownership validation** — verify user owns portfolio on each request
2. **Configure cron jobs** in production (Render/Supabase)

### Medium Priority

3. **Email/SMS notifications** for urgent alerts
4. **Add basic tests** (at least for rebalancing)
5. **Recommendation history** (persist past recommendations)

### Low Priority

6. **Multiple portfolios per user**
7. **Broker API integration** (webhooks)
8. **Data export** (CSV/Excel)

---

## 📝 Important Technical Notes

### Rebalancing Algorithm

The algorithm is very sophisticated and replicates the logic from the `BacktestHistorical.ipynb` notebook:
- Sharpe optimization with Nelder-Mead
- 60% shrinkage to mean returns (conservatism)
- Multiple signals (drawdown, weight deviation, volatility)
- Gradual deploy (factor 0.5)

### Database

- Well-designed schema with appropriate relationships
- Indexes on key fields (`[portfolioId, date]`, `[assetId, date]`)
- Support for JSON metadata in metrics
- Unique constraints to avoid duplicates

### Frontend

- Modern UI with dark theme
- Reusable components
- State management with hooks and context
- Custom SVG charts (no heavy dependencies)
- Skeleton loading for better UX
- Collapsible sidebar for navigation

### Security

- Passwordless authentication (magic links)
- JWT tokens verified in backend
- Auth guard on all controllers
- Data validation in DTOs
- (Pending) Portfolio ownership validation per request

---

**Last updated:** February 2026
**Document version:** 1.1
**Project status:** Functional MVP with core features implemented
