# Leveraged DCA App

Aplicación full-stack que operacionaliza la estrategia de DCA condicional con apalancamiento dinámico.

## Tech stack

- **Backend:** NestJS 10 + TypeScript + Prisma 5 + PostgreSQL (Supabase)
- **Frontend:** Next.js 14 + React 19 + SWR + lucide-react
- **Auth:** Supabase Auth (magic link passwordless)
- **Infra:** Docker (Node 20 Alpine), Vercel (frontend), Render (backend)
- **Monorepo:** npm workspaces

## Estructura

```
leveraged-dca-app/
├── apps/
│   ├── backend/                # NestJS API (puerto 3003)
│   │   ├── src/
│   │   │   ├── auth/           # Supabase JWT auth, guards, decorators
│   │   │   ├── users/          # Perfiles y preferencias de notificación
│   │   │   ├── portfolios/     # CRUD portfolios, recomendaciones, onboarding
│   │   │   ├── contributions/  # Tracking de contribuciones DCA
│   │   │   ├── positions/      # Gestión de posiciones
│   │   │   ├── rebalance/      # Motor de rebalanceo (~1,200 líneas)
│   │   │   ├── cron/           # Endpoints para jobs programados
│   │   │   └── prisma/         # Módulo de base de datos (PrismaService extends PrismaClient)
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # Esquema completo de datos
│   │   │   └── migrations/     # Migraciones de BD
│   │   └── tests/
│   └── frontend/               # Next.js Dashboard (puerto 3002)
│       ├── pages/
│       │   ├── index.tsx                # Login (magic link)
│       │   └── dashboard/
│       │       ├── index.tsx            # Dashboard principal
│       │       ├── onboarding.tsx       # Wizard de creación (SSE progress)
│       │       ├── contribution.tsx     # Registro de contribuciones
│       │       ├── rebalance.tsx        # Propuesta de rebalanceo
│       │       ├── configuration.tsx    # Configuración del portfolio
│       │       ├── manual-update.tsx    # Actualización manual de posiciones
│       │       ├── profile.tsx          # Perfil de usuario
│       │       └── help.tsx             # Ayuda
│       ├── components/
│       │   ├── DashboardSidebar.tsx     # Navegación lateral colapsable (responsive: drawer en mobile, sidebar en desktop)
│       │   ├── DashboardMenu.tsx        # Menú superior
│       │   └── NumberInput.tsx          # Input numérico
│       ├── lib/
│       │   ├── api.ts                   # Cliente API con auth, retry automático de 401, y refresh de token
│       │   ├── hooks/use-portfolio-data.ts  # Hooks SWR
│       │   ├── number-format.ts         # Formato numérico (locale ES)
│       │   ├── supabase.ts              # Cliente Supabase
│       │   └── swr-config.ts            # Config SWR
│       └── contexts/
│           └── AuthContext.tsx           # Provider de autenticación (session management, token refresh cada 5 min)
├── packages/
│   └── shared/                 # Tipos compartidos (planned)
└── infra/
    └── scripts/                # Cron jobs en TypeScript
        ├── price-ingestion.ts  # Ingestión de precios (Yahoo Finance v8 API)
        ├── metrics-refresh.ts  # Recálculo de métricas (~552 líneas)
        ├── daily-check.ts      # Generación de recomendaciones (~590 líneas)
        ├── run-daily-jobs.ts   # Orquestador de jobs (secuencial, fail-fast en step 1)
        ├── reset-database.ts   # Reset de BD para desarrollo
        └── seed-demo-portfolio.ts  # Seed de datos demo
```

---

## Esquema de base de datos (Prisma)

### User
```
id            String    @id @default(uuid())
email         String    @unique
fullName      String?
notifyOnRecommendations   Boolean @default(true)
notifyOnContributions     Boolean @default(true)
notifyOnLeverageAlerts    Boolean @default(true)
notifyOnRebalance         Boolean @default(true)
portfolios    Portfolio[]
createdAt     DateTime  @default(now())
updatedAt     DateTime  @updatedAt
```

### Portfolio
```
id                        String  @id @default(uuid())
userId                    String  → User
name                      String
baseCurrency              String  @default("USD")

// Leverage
leverageMin               Float   @default(2.5)
leverageMax               Float   @default(4.0)
leverageTarget            Float   @default(3.0)
initialCapital            Float

// Contribuciones
monthlyContribution       Float?
contributionFrequency     String  @default("monthly")
contributionDayOfMonth    Int     @default(1)
contributionEnabled       Boolean @default(true)

// Pesos (JSON string)
targetWeightsJson         String? @db.Text
equalWeightsJson          String? @db.Text
maxWeight                 Float   @default(0.4)
minWeight                 Float   @default(0.05)

// Riesgo
maintenanceMarginRatio    Float   @default(0.05)
drawdownRedeployThreshold Float   @default(0.12)
weightDeviationThreshold  Float   @default(0.05)
volatilityLookbackDays    Int     @default(63)
volatilityRedeployThreshold Float @default(0.18)
gradualDeployFactor       Float   @default(0.5)

// Optimización
useDynamicSharpeRebalance Boolean @default(true)
meanReturnShrinkage       Float   @default(0.6)
riskFreeRate              Float   @default(0.02)

Relations: positions, contributions, rebalanceEvents, metricsTimeseries, dailyMetrics
```

### Asset
```
id            String  @id @default(uuid())
symbol        String  @unique
name          String
assetType     String  // 'crypto', 'commodity', 'index', 'bond', 'stock'
metadataJson  String? @db.Text
createdAt     DateTime
Relations: positions, prices, rebalancePositions
```

### PortfolioPosition
```
id            String  @id @default(uuid())
portfolioId   String  → Portfolio
assetId       String  → Asset
quantity      Float
avgPrice      Float
exposureUsd   Float
updatedAt     DateTime @updatedAt
@@unique([portfolioId, assetId])
```

### MonthlyContribution
```
id              String    @id @default(uuid())
portfolioId     String    → Portfolio
amount          Float
contributedAt   DateTime  @default(now())   // Full timestamp, no solo date
note            String?
deployed        Boolean   @default(false)
deployedAmount  Float     @default(0)
deploymentReason String?  // 'drawdown', 'weight_deviation', 'volatility', 'manual', 'leverage_low'
```

### RebalanceEvent
```
id              String  @id @default(uuid())
portfolioId     String  → Portfolio
contributionId  String?
triggeredBy     String  // 'user', 'auto'
targetLeverage  Float
createdAt       DateTime
positions       RebalancePosition[]
```

### RebalancePosition
```
id                String  @id @default(uuid())
rebalanceEventId  String  → RebalanceEvent
assetId           String  → Asset
targetWeight      Float
targetUsd         Float
deltaQuantity     Float
```

### AssetPrice
```
id        String    @id @default(uuid())
assetId   String    → Asset
date      DateTime  @db.Date
close     Float
adjClose  Float?
source    String    @default("yfinance")
createdAt DateTime
@@unique([assetId, date])
@@index([assetId, date])
```

### MetricsTimeseries
```
id              String    @id @default(uuid())
portfolioId     String    → Portfolio
date            DateTime  @db.Date
equity          Float
exposure        Float
leverage        Float
sharpe          Float?
drawdown        Float?
borrowedAmount  Float?
marginRatio     Float?
metadataJson    String?   @db.Text   // Ver "Estructura de metadataJson" abajo
createdAt       DateTime
updatedAt       DateTime  @updatedAt
@@unique([portfolioId, date])
@@index([portfolioId, date])
```

### DailyMetric
```
id              String    @id @default(uuid())
portfolioId     String    → Portfolio
date            DateTime  @db.Date
equity          Float
exposure        Float
leverage        Float
drawdown        Float?
borrowedAmount  Float?
marginRatio     Float?
peakEquity      Float?
createdAt       DateTime
@@unique([portfolioId, date])
@@index([portfolioId, date])
```

---

## Modelo de equity y borrowedAmount

Invariante fundamental:

```
equity = exposure - borrowedAmount + contribuciones_pendientes
```

- **borrowedAmount**: deuda con el broker. Solo cambia en rebalanceo, contribución desplegada o actualización manual.
- **exposure**: `Σ(quantity × currentPrice)` por posición. Cambia con precios de mercado.
- Entre eventos, equity fluctúa solo por precios: `newEquity = newExposure - borrowedAmount`.
- El cron de metrics-refresh **nunca recalcula** borrowedAmount desde el leverage target; siempre lo preserva del metric anterior.

### Estructura de metadataJson (MetricsTimeseries)

```json
{
  "source": "metrics-refresh | contribution | rebalance | manual_update",
  "contributions": ["uuid-1", "uuid-2"],
  "rebalances": ["uuid-1"],
  "manualUpdates": ["uuid-1"],
  "composition": [
    { "symbol": "SPY", "weight": 0.25, "value": 15000, "quantity": 30 }
  ]
}
```

Los arrays de IDs evitan el doble procesamiento. Al buscar IDs ya procesados, se consultan los últimos 5 metrics (no solo el último) para evitar pérdida de IDs si otro servicio escribió un metric intermedio.

---

## Pipeline de jobs diarios

Ejecutados por `run-daily-jobs.ts` en orden secuencial estricto. Si el paso 1 falla, se aborta. Si pasos 2-3 fallan, se continúa con warning.

**Schedule recomendado (UTC):**
```
0 6 * * *   # Price Ingestion
0 7 * * *   # Metrics Refresh (después de precios)
0 9 * * *   # Daily Check (después de métricas)
```

### 1. Price Ingestion (`price-ingestion.ts`)

1. Obtiene todos los activos de BD
2. Para cada activo: fetch precio de `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=1d`
3. Extrae `chart.result[0].meta.regularMarketPrice`
4. Upsert en `AssetPrice` con constraint `assetId_date`
5. Rate limit: 500ms entre requests

**Tablas:** Lee `Asset` → Escribe `AssetPrice`

### 2. Metrics Refresh (`metrics-refresh.ts`, ~552 líneas)

1. Para cada portfolio: obtiene posiciones con activos y precios más recientes
2. Calcula `totalExposure = Σ(quantity × currentPrice)`
3. Sincroniza `exposureUsd` en `PortfolioPosition` si cambió
4. Busca contribuciones nuevas no procesadas (comparando con `metadataJson.contributions[]` de los últimos 5 metrics)
5. **Calcula equity:**
   - Si `latestMetric.borrowedAmount` existe: `equity = totalExposure - borrowedAmount + newContributions`
   - Fallback: deriva borrowedAmount de `latestMetric.exposure - latestMetric.equity`
   - Portfolio nuevo: `equity = totalExposure / leverageTarget + contributions`
6. Calcula leverage, marginRatio, composición
7. **Preservación same-day:** si ya existe metric de hoy con source ≠ 'metrics-refresh' (contribution/rebalance/manual_update), preserva equity ajustando solo por cambio de exposición: `preservedEquity = existingMetric.equity + (newExposure - oldExposure)`
8. Merge de arrays de metadata (contributions, rebalances, manualUpdates)
9. Upsert `MetricsTimeseries` y `DailyMetric` (con `peakEquity`)

**Tablas:** Lee `Portfolio`, `PortfolioPosition`, `Asset`, `AssetPrice`, `MonthlyContribution`, `MetricsTimeseries` → Escribe `PortfolioPosition`, `MetricsTimeseries`, `DailyMetric`

### 3. Daily Check (`daily-check.ts`, ~590 líneas)

1. Calcula estado actual: exposure (de precios), equity (de último DailyMetric/MetricsTimeseries ajustado por contribuciones recientes)
2. Calcula leverage y margin ratio
3. Verifica si hoy es día de contribución (`contributionDayOfMonth`, con ajuste de fin de mes)
4. Genera alertas:
   - **contribution_due** (medium): si hoy es día de contribución y no ha contribuido hoy
   - **leverage_low** (high): si leverage < leverageMin
   - **leverage_high** (urgent): si leverage > leverageMax, calcula `extraNeeded = exposure/leverageMax - equity`
   - **margin_warning** (urgent/high): si marginRatio ≤ criticalMargin (0.1) o ≤ safeMargin (0.15)
5. Upsert `DailyMetric` con `peakEquity`

**Tablas:** Lee `Portfolio`, `PortfolioPosition`, `Asset`, `AssetPrice`, `MetricsTimeseries`, `MonthlyContribution` → Escribe `DailyMetric`

---

## Servicios backend

### Auth (`auth/`)

**AuthService:**
- `sendMagicLink(email)`: Envía OTP vía `supabase.auth.signInWithOtp`. Crea usuario en BD local si no existe.
- `verifySession(token)`: Decodifica JWT (sin verificar firma — confía en frontend), extrae email y exp, busca/crea usuario en BD.

**AuthGuard:**
- Extrae token de header `Authorization: Bearer {token}`
- Llama a `verifySession`. Si válido, adjunta user a `request.user`.

**Frontend (AuthContext):**
- Al montar: `supabase.auth.getSession()` → guarda `access_token` en localStorage
- Escucha `onAuthStateChange` para TOKEN_REFRESHED
- Refresh periódico cada 5 minutos
- Token storage: `localStorage.getItem/setItem('supabase_token')`

**API Client (`lib/api.ts`):**
- `fetchAPI(endpoint, options)`: añade Bearer token, hace fetch
- Si 401: obtiene sesión fresca de Supabase, actualiza token, reintenta 1 vez
- Si sigue fallando: lanza error

### Onboarding (`portfolios/onboarding.service.ts`, ~566 líneas)

`createPortfolioWithAssets(userId, dto, progressCallback)` — flujo con SSE:

1. Valida usuario
2. Valida y crea assets (verifica ticker contra Yahoo Finance)
3. Descarga precios históricos (24+ meses) para cada activo → `AssetPrice`
4. Calcula pesos: `sharpe` → equal weights iniciales (optimización real en rebalanceo), `manual` → pesos del usuario, `equal` → iguales
5. Crea Portfolio con toda la configuración
6. Crea PortfolioPositions iniciales (quantity=0, avgPrice=0)
7. Crea MetricsTimeseries y DailyMetric iniciales (equity=initialCapital, exposure=0, leverage=0)
8. Envía progreso por SSE en cada paso

### Contributions (`contributions/contributions.service.ts`, ~262 líneas)

`recordContribution(dto)`:

1. Crea registro `MonthlyContribution` con `deployed=true`, `deploymentReason='manual'`
2. Calcula nuevo equity: `currentEquity + amount`
3. Preserva borrowedAmount del metric anterior
4. Upsert `DailyMetric` y `MetricsTimeseries` con source='contribution'
5. Añade contribution ID a `metadataJson.contributions[]`

**Nota:** Las contribuciones van directamente a equity (no hay estado "pendiente").

### Positions (`positions/positions.service.ts`, ~953 líneas)

`upsert(dto)`:

1. Detecta activos nuevos y eliminados (quantity=0)
2. Para activos nuevos: valida ticker en Yahoo Finance, descarga 730 días de precios históricos
3. Upsert de cada PortfolioPosition
4. Elimina posiciones con quantity=0
5. Actualiza `targetWeightsJson` (redistribuye pesos para nuevos activos, normaliza al eliminar)
6. Si se proporciona equity: calcula `borrowedAmount = exposure - equity`, crea contribución implícita si equity cambió, upsert métricas con source='manual_update'

### Portfolios (`portfolios/portfolios.service.ts`, ~649 líneas)

`getSummary(portfolioId)`:
- Obtiene equity de `DailyMetric` o `MetricsTimeseries` (stored, no recalculado)
- Calcula exposure real-time: `Σ(quantity × latestPrice)`
- Calcula leverage, retorno absoluto, posiciones con PNL y pesos
- Llama a `calculatePortfolioAnalytics` para métricas avanzadas

`calculatePortfolioAnalytics(history, contributions, portfolioCreatedAt)`:
- **CAGR:** `(finalEquity / firstEquity)^(1/years) - 1`
- **XIRR:** Newton-Raphson sobre cash flows (initial capital, contribuciones, valor final)
- **Volatilidad:** `stdDev(dailyReturns) × sqrt(252)` — daily returns excluyen contribuciones
- **Sharpe:** `(meanReturn × 252 - riskFreeRate) / volatility`
- **Max drawdown:** `min(equity / peakEquity - 1)`
- **Underwater days:** días con `equity < totalInvested`
- **Best/worst days:** max/min daily returns

### Rebalance (`rebalance/rebalance.service.ts`, ~1,210 líneas)

`calculateProposal(portfolioId)`:
1. Calcula estado actual: equity, exposure, leverage, peak equity, valores por posición
2. Evalúa señales de deploy: drawdown, desviación de pesos, volatilidad (lookback 63 días)
3. Determina pesos (Sharpe o manual)
4. Calcula target exposure según leverage actual vs bounds
5. Genera ajustes por activo: cantidades exactas, acciones (BUY/SELL/HOLD)

**Optimización Sharpe (Nelder-Mead):**
- Usa TODO el histórico de precios (no solo recientes)
- Shrinkage 0.6 en mean returns (NO en covarianza)
- Maximiza `(leveragedReturn - riskFreeRate) / leveragedVolatility`
- Constraints: `minWeight ≤ w ≤ maxWeight`, `Σw = 1`
- Parámetros NM: alpha=1.0, gamma=2.0, rho=0.5, sigma=0.5, tol=1e-8, maxIter=500
- Fallback a `targetWeights` si optimización falla

`acceptProposal()`:
1. Crea `RebalanceEvent` + `RebalancePosition` por activo
2. Upsert posiciones con cantidades objetivo
3. Upsert `MetricsTimeseries` con source='rebalance' y metadata

### Recomendaciones (`portfolios/portfolio-recommendations.service.ts`)

Tipos: `contribution_due`, `leverage_low`, `leverage_high`, `deploy_signal`, `rebalance_needed`.
Prioridades: low, medium, high, urgent.

- `contribution_due`: solo si hoy es día de contribución Y no ha contribuido hoy (verifica `MonthlyContribution` del día).
- `leverage_low/high`: incluye cantidades exactas de ajuste necesarias.
- `in_range` fue eliminado por ser ruido informativo.

---

## Frontend — páginas y componentes

### Páginas

- **`/`** — Login (magic link). Redirige a dashboard si ya autenticado.
- **`/dashboard`** — Dashboard principal: métricas (equity, exposure, leverage, returns), panel de recomendaciones, gráfica SVG de equity interactiva con tooltip, grid de analytics (CAGR, Sharpe, drawdown…), historial mensual paginado (24/página), tabla de posiciones actuales. Skeleton loading en todas las secciones.
- **`/dashboard/onboarding`** — Wizard de creación de portfolio con SSE progress.
- **`/dashboard/contribution`** — Formulario de contribución (monto, nota). Soporta contribución extra vía query params `?extra=true&amount=X`.
- **`/dashboard/manual-update`** — Actualización manual de posiciones (equity actual, cantidades por activo).
- **`/dashboard/rebalance`** — Propuesta de rebalanceo: estado actual vs objetivo, tabla BUY/SELL/HOLD con cantidades exactas, desglose equity/borrow. Botón "Accept and Save" (deshabilitado si no hay acciones).
- **`/dashboard/configuration`** — Panel completo: contribución (monto, frecuencia, día, enabled), leverage (min/max/target), editor visual de pesos (valida suma 100%), thresholds de señales, parámetros Sharpe (solo visible si `useDynamicSharpeRebalance`).
- **`/dashboard/backtest`** — Simulador de backtest con configuración, progreso y resultados (trayectorias, equity breakdown).
- **`/dashboard/profile`** — Info personal (email read-only, nombre), preferencias de notificación.
- **`/dashboard/help`** — Ayuda.

### Componentes reutilizables

- **DashboardSidebar** — Sidebar colapsable (icons only cuando colapsado). Items: Dashboard, +Contribution, Rebalance, Manual Update, Configuration, Profile. Sign out al fondo. Responsive: drawer en mobile, sidebar en desktop.
- **AnalyticsCard** — Card de métrica con tooltip (icono info + descripción on hover).
- **EquityChart** — Gráfica SVG custom de equity history, interactiva con tooltip y punto seleccionado.
- **DashboardRecommendationCard** — Card de recomendación con colores por prioridad (urgent=red, high=orange…), acciones específicas, botón "Go to action" con URL dinámica.
- **NumberInput** — Input numérico.
- **Backtest components** — BacktestConfig, BacktestResults, BacktestProgress, TrajectoryChart, EquityBreakdownChart.

### Sistema de traducciones

Backend envía códigos de mensaje con parámetros. Frontend traduce con `t(code, params)` desde `lib/translations.ts`.

```typescript
// Backend envía
{ "title": { "code": "LEVERAGE_LOW_TITLE", "params": { "leverage": 2.1 } } }
// Frontend traduce
t("LEVERAGE_LOW_TITLE", { leverage: 2.1 }) // → "Leverage Bajo (2.10x)"
```

Idioma actual: español (códigos preparados para múltiples idiomas).

---

## API endpoints

```
POST   /api/auth/login                          # Magic link
GET    /api/auth/me                              # Usuario actual

POST   /api/portfolios                           # Crear portfolio (SSE progress)
GET    /api/portfolios                           # Listar portfolios
GET    /api/portfolios/:id                       # Detalle
GET    /api/portfolios/:id/metrics               # Métricas (CAGR, XIRR, Sharpe, drawdown, etc.)
GET    /api/portfolios/:id/summary               # Resumen completo para dashboard
GET    /api/portfolios/:id/recommendations       # Recomendaciones accionables
GET    /api/portfolios/:id/configuration         # Obtener configuración
PUT    /api/portfolios/:id/configuration         # Actualizar configuración
GET    /api/portfolios/:id/rebalance/proposal    # Propuesta de rebalanceo
POST   /api/portfolios/:id/rebalance/accept      # Aceptar rebalanceo
POST   /api/portfolios/:id/contributions         # Registrar contribución
GET    /api/portfolios/:id/contributions         # Listar contribuciones
PUT    /api/portfolios/:id/positions             # Actualizar posiciones (+ descarga histórica de nuevos tickers)
GET    /api/portfolios/:id/positions             # Listar posiciones

GET    /api/users/profile                        # Perfil
PUT    /api/users/profile                        # Actualizar perfil

POST   /api/cron/price-ingestion                 # Trigger ingestión precios
POST   /api/cron/metrics-refresh                 # Trigger recálculo métricas
POST   /api/cron/daily-check                     # Trigger recomendaciones
```

---

## Variables de entorno

### Backend (.env)

```bash
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres
DIRECT_URL=postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
FRONTEND_URL=http://localhost:3002
PORT=3003
```

### Frontend (.env.local)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
NEXT_PUBLIC_API_URL=http://localhost:3003/api
```

---

## Comandos de desarrollo

```bash
npm run dev              # Backend + Frontend (concurrently)
npm run dev:backend      # Solo backend (puerto 3003)
npm run dev:frontend     # Solo frontend (puerto 3002)
npm run build            # Build todos los workspaces
npm run prisma:push      # Sync schema a BD
npm run prisma:generate  # Generar Prisma Client
npm run prisma:studio    # GUI de Prisma
```

### Pre-push: pasar CI localmente

**OBLIGATORIO** antes de hacer `git push`, ejecutar lint y build para evitar fallos en CI:

```bash
# Backend lint
npm --workspace apps/backend run lint

# Frontend lint + build (incluye verificación de tipos)
npm --workspace apps/frontend run lint
npm --workspace apps/frontend run build
```

No pushear si alguno de estos comandos falla.

### Proceso de release

Al crear un release, seguir este orden estricto:

1. Actualizar `version` en los 3 `package.json`:
   - `/package.json` (raíz)
   - `/apps/frontend/package.json`
   - `/apps/backend/package.json`
2. Commit con mensaje `chore: bump version to X.Y.Z`
3. Push a main
4. Crear tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
5. Crear release en GitHub: `gh release create vX.Y.Z --title "vX.Y.Z" --notes "..."`

---

## Convenciones

- **Backend:** camelCase variables, PascalCase clases. NestJS modules con Controller, Service, DTOs.
- **Frontend:** camelCase variables, PascalCase componentes. Pages en `pages/`, components en `components/`, utils en `lib/`.
- **Database:** snake_case columnas (mapeado desde camelCase en Prisma).
- **Migraciones:** NUNCA usar el MCP tool de Supabase (`apply_migration`) para DDL. Siempre crear el archivo `migration.sql` en `apps/backend/prisma/migrations/<timestamp>_<name>/` y ejecutarlo con `prisma migrate deploy` o `prisma db push`. Si se aplica solo vía MCP, la migración no existe en el repo y producción (Render) falla al desplegar.
- **API Endpoints:** kebab-case (e.g., `/portfolios/:id/daily-metrics`).
- **Errores backend:** NestJS exceptions (`UnauthorizedException`, `NotFoundException`, etc.). Responses: `{ statusCode, message, error }`.
- **Errores frontend:** try/catch con mensajes user-friendly.
- **Git:** Commit messages and release notes MUST be in English. Use conventional commits format (feat:, fix:, chore:, docs:).

---

## Estado y roadmap

### Completado
- Auth (magic link + guard en todos los endpoints)
- Portfolio management (CRUD, onboarding wizard SSE, summary, analytics)
- Contributions (recording, history endpoint, deployed tracking)
- Position updates (auto-fetch prices, descarga histórica de nuevos tickers)
- Rebalanceo (Sharpe Nelder-Mead, deploy signals)
- Configuración (panel completo con todos los parámetros)
- Recomendaciones (alertas en tiempo real)
- Visualizaciones (dashboard charts, backtest simulator)
- Analytics (CAGR, XIRR, Sharpe, drawdown, underwater days)
- Modelo de equity (borrowedAmount tracked en todos los servicios)

### Pendiente — Alta prioridad
- ~~Portfolio ownership validation~~ — Completado: `PortfolioOwnershipGuard` en todos los endpoints con `:id`/`:portfolioId`/`body.portfolioId`
- ~~Configurar cron jobs en producción~~ — Completado: GitHub Actions (ver `infra/CRON_JOBS.md`)

### Pendiente — Media prioridad
- Notificaciones email/SMS para alertas urgentes
- ~~Tests (al menos para rebalanceo)~~ — Completado: unit tests para `RebalanceService` (17 tests) y `PortfolioOwnershipGuard` (6 tests) en `tests/unit/`
- Persistencia de historial de recomendaciones

### Pendiente — Baja prioridad
- Múltiples portfolios por usuario
- Integración con broker API
- Export de datos (CSV/Excel)

---

## Limitaciones conocidas

- `avgPrice` en posiciones viene de Yahoo Finance, no del precio real de compra en el broker.
- CAGR sobreestima rendimiento en portfolios con DCA; usar XIRR como referencia principal.
- Backend no verifica firma JWT de Supabase (confía en frontend).
- Notificaciones por email no implementadas (solo logging).
