# Build & Development Guide

## Prerequisites

- Node.js (ES2022 compatible)
- pnpm 9.15.0
- MongoDB (local or remote)
- Expo CLI (for mobile development)

## Install Dependencies

```bash
pnpm install
```

## Environment Setup

Copy and configure the API environment file:

```bash
cp apps/api/.env.example apps/api/.env
```

Required variables:

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Min 32 characters |
| `JWT_EXPIRES_IN` | e.g. `7d` |
| `OPENAI_API_KEY` | OpenAI API key |
| `ASSEMBLYAI_API_KEY` | AssemblyAI API key |
| `S3_ENDPOINT` | S3-compatible storage endpoint |
| `S3_REGION` | e.g. `auto` |
| `S3_ACCESS_KEY_ID` | S3 access key |
| `S3_SECRET_ACCESS_KEY` | S3 secret key |
| `S3_BUCKET_MEDIA` | Media bucket name |

## Development

```bash
# All apps (except mobile)
pnpm dev

# Individual apps
pnpm dev:api          # API on port 3001
pnpm dev:web          # Web on port 3000 (proxies /api to :3001)
pnpm dev:mobile       # Expo dev server
```

## Mobile

```bash
pnpm mobile:start             # Start Expo dev server
pnpm mobile:ios               # Run on physical iOS device
pnpm mobile:android            # Run on physical Android device

# Simulators/emulators
cd apps/mobile
npx expo run:ios               # iOS simulator
npx expo run:android           # Android emulator

# Native rebuild
pnpm mobile:prebuild           # Generate native projects
pnpm mobile:prebuild:clean     # Clean + regenerate native projects
```

## Build

```bash
pnpm build            # Build all packages (shared → api-client → apps)
```

To build individual packages:

```bash
cd packages/shared && pnpm build
cd packages/api-client && pnpm build
cd apps/api && pnpm build       # Outputs to dist/
cd apps/web && pnpm build       # Outputs to dist/
```

## Production

```bash
cd apps/api && node dist/main
```

## Code Quality

```bash
pnpm lint             # Lint all packages
pnpm typecheck        # Type-check all packages
```

## Testing

```bash
cd apps/api

pnpm test                     # Run all tests
pnpm test:integration         # Integration tests only (uses MongoDB Memory Server)
```

Integration tests have a 30s timeout and run in band (`--runInBand`).

## Clean

```bash
pnpm clean            # Remove dist/, node_modules/, .turbo from all packages
```
