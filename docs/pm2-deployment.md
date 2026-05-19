# Production Deployment with PM2

This guide covers building the API for production and running it with [PM2](https://pm2.keymetrics.io/).

## 1. Build for production

On the server (or in CI, then ship the artifact):

```bash
pnpm install --frozen-lockfile
pnpm build                           # builds shared, api-client, then api → apps/api/dist/main.js
```

For prod you want `deleteOutDir: true` and `typeCheck: true` (the opposite of the dev config, which disables both for fast restarts). Keep the dev config fast and add a separate prod config.

Create `apps/api/nest-cli.prod.json`:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "builder": "swc",
    "typeCheck": true
  }
}
```

Add a script in `apps/api/package.json`:

```json
"build:prod": "nest build -c nest-cli.prod.json"
```

## 2. PM2 ecosystem file

Create `ecosystem.config.js` at the repo root (or under `apps/api/`):

```js
module.exports = {
  apps: [
    {
      name: 'portfolio-api',
      script: 'apps/api/dist/main.js',
      cwd: '/var/www/portfolio',          // wherever you deploy
      instances: 'max',                   // or a number; uses Node cluster mode
      exec_mode: 'cluster',
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      env_file: '.env.production',        // PM2 v5+; or load via dotenv in main.ts
      out_file: '/var/log/portfolio/api.out.log',
      error_file: '/var/log/portfolio/api.err.log',
      time: true,                         // prefix logs with timestamps
    },
  ],
};
```

### Caveats specific to this app

- **Cluster mode + outbox**: the outbox consumer polls every 500ms. Running `instances: 'max'` means every worker polls. The consumer claims rows with a lock (stale-lock reset at 30s), so it is safe — but if you want to be cautious, run the API in cluster mode and a separate single-instance "worker" process that is the only one with the outbox enabled. Gate the outbox behind an env flag if you go this route.
- **`@nestjs/schedule`**: any cron jobs will fire on every worker in cluster mode. Same fix — gate them behind an env flag and run them only in a single worker.

## 3. Deploy & run

```bash
# on the server, after build
pm2 start ecosystem.config.js --env production
pm2 save                       # persist process list
pm2 startup                    # generate the systemd unit so it survives reboot
```

Updates:

```bash
git pull && pnpm install --frozen-lockfile && pnpm build:prod
pm2 reload portfolio-api       # zero-downtime reload (cluster mode)
```

Useful commands:

```bash
pm2 status
pm2 logs portfolio-api --lines 200
pm2 monit
pm2 restart portfolio-api      # hard restart (drops connections briefly)
pm2 reload  portfolio-api      # graceful, cluster only
```

## 4. Pre-flight checklist

- `.env.production` has all the vars validated in `apps/api/src/config/app.config.ts` (MONGODB_URI, JWT_SECRET ≥32 chars, OPENAI_API_KEY, S3 credentials, SMTP, etc.).
- API runs behind nginx/Caddy for TLS and as a real reverse proxy; set `TRUST_PROXY` accordingly (startup log reports `Trust proxy hops: N`).
- MongoDB connection string points at the prod cluster, not dev.
- Sentry DSN and OpenTelemetry exporters configured.
- A single owner for outbox/cron in multi-instance setups (see caveats above).
