# Margn Landing Page

Marketing landing page for [margn.es](https://margn.es). The app itself is at [app.margn.es](https://app.margn.es).

## Tech Stack

- **Framework:** Astro 6 (static site generation)
- **Styling:** Tailwind CSS 4 via `@tailwindcss/vite`
- **Font:** Inter Variable
- **Icons:** Heroicons (inline SVG)
- **Deployment:** Vercel (planned)

## Structure

```
landing/
├── src/
│   ├── components/
│   │   ├── Navbar.astro        # Fixed nav, blur-on-scroll, mobile drawer
│   │   ├── Hero.astro          # Main hero with stats
│   │   ├── Features.astro      # 8-card grid
│   │   ├── Metrics.astro       # Backtest comparison panel
│   │   ├── HowItWorks.astro    # 4-step flow
│   │   ├── Pricing.astro       # 3 tiers with monthly/annual toggle
│   │   ├── FAQ.astro           # 9 expandable questions
│   │   ├── CTA.astro           # Final conversion section
│   │   └── Footer.astro        # Links + legal disclaimer
│   ├── layouts/
│   │   └── Layout.astro        # Base layout, meta, OG tags, animations
│   ├── pages/
│   │   └── index.astro         # Main page assembling all components
│   └── styles/
│       └── global.css          # Tailwind + brand tokens + custom styles
└── public/
    ├── favicon.svg
    └── robots.txt
```

## Design System

- **Dark theme** with deep navy (#0b0d1a) background
- **Brand blue** palette (#4c6ef5 primary)
- **Accent colors:** green (#12b886), red (#fa5252), amber (#fab005)
- Scroll-triggered fade-in animations via IntersectionObserver
- `prefers-reduced-motion` respected

## Pricing Tiers

| | Starter | Pro | Institutional |
|---|---|---|---|
| Monthly | Free | €19/mo | €49/mo |
| Annual | Free | €15/mo | €39/mo |

## Commands

```bash
npm run dev     # Dev server (default port 4321)
npm run build   # Static build to dist/
npm run preview # Preview built site
```

## Regulatory Note

Margn is a calculation tool, NOT a financial advisor. All copy reinforces this positioning naturally throughout the page (hero, FAQ, footer disclaimer). This is both the product philosophy and the regulatory requirement.

## Brand Voice

- Precise, not jargon-heavy
- Confident, not aggressive — let the math speak
- Empowering, not prescriptive — "you decide, we calculate"
- Use numbers and data, avoid hype words
