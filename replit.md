# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── gym-manager/        # Expo React Native mobile app
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## Gym Manager App (artifacts/gym-manager)

A full-featured gym management mobile app built with Expo React Native.

### Features
- **Auth**: Gym owner login/register with AsyncStorage persistence
- **Customer Management**: Add, view, update, delete gym members
- **Photo**: Camera and gallery integration for member photos
- **Membership Types**: Weekly, Monthly, Quarterly, Yearly with auto-expiry dates
- **Payment Tracking**: Record payments per member, track paid/unpaid status
- **SMS Notifications**: Opens SMS app pre-filled when recording payments or on expiry
- **Auto-Delete**: Members unpaid for 7+ days are automatically removed on app load
- **Search & Filter**: Filter members by active/expired/unpaid status

### App Structure
```
artifacts/gym-manager/
├── app/
│   ├── _layout.tsx           # Root layout with auth check
│   ├── (auth)/               # Auth modal flow (login/register)
│   ├── (tabs)/               # Main tabs (Members list + Settings)
│   └── customer/             # Customer detail and add screens
├── components/
│   └── CustomerCard.tsx      # Member list item component
├── context/
│   ├── AuthContext.tsx       # Auth state (gym owner session)
│   └── GymContext.tsx        # Customer/member data management
└── constants/colors.ts       # App theme colors
```

### Data Storage
- Fully offline, all data in AsyncStorage
- Key: `gym_owner` — array of gym owner accounts
- Key: `gym_session` — current logged-in owner ID
- Key: `gym_customers` — array of all customers across all owners

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages.

Run codegen: `pnpm --filter @workspace/api-spec run codegen`
