# Docker Compose Production Deployment on Linode Nanode

## Overall Objective

Containerize the NestJS API and deploy it to a Linode Nanode ($5/mo, 1 vCPU, 1GB RAM) using Docker Compose with Caddy as a reverse proxy. The deployment must be production-grade: automated via CI/CD, secured with auto-TLS, observable via the existing Sentry/OpenTelemetry/Pino stack, and recoverable via image-tagged rollbacks. MongoDB is hosted on Atlas (not on-box). No code changes to the application — this is purely infrastructure.

### Target Architecture

```
┌─────────────────────────── Linode Nanode ───────────────────────────┐
│                                                                     │
│  ┌─────────┐    :443     ┌──────────────────────────────────┐      │
│  │  Caddy   │───────────▶│  NestJS API Container             │      │
│  │ (proxy)  │    :3001   │                                    │      │
│  └─────────┘             │  instrument.ts → Sentry  ──────────────▶ Sentry Cloud
│                          │  tracing.ts    → OTLP    ──────────────▶ Grafana Cloud
│                          │  pino          → stdout  ──┐       │      (traces + metrics)
│                          │  /api/health   → HTTP    ──────────────▶ UptimeRobot
│                          └──────────────────────────┼─┘       │
│                                                     │         │
│                              docker logs ◀──────────┘         │
│                                                               │
└───────────────────────────────────────────────────────────────┘

External: MongoDB Atlas, Cloudflare R2, Sentry Cloud, Grafana Cloud
```

### Memory Budget (1GB RAM)

| Component          | Estimated RAM |
| ------------------ | ------------- |
| Linux OS + systemd | ~100MB        |
| Docker engine      | ~50MB         |
| Caddy              | ~15MB         |
| Node.js API        | ~150-300MB    |
| **Total**          | **~315-465MB** |
| Remaining          | ~535-685MB    |

---

## Open Questions

Resolve these before starting implementation:

1. **Domain name** — Do you already have a domain (e.g., `api.yourapp.com`) pointed at Linode, or do we need to set that up? Caddy needs a real domain for automatic TLS.
2. **Container registry** — Do you have a preference? GitHub Container Registry (GHCR) is free for private repos with GitHub Actions. Docker Hub is also fine.
3. **MongoDB Atlas** — Are you already running Atlas, or do we need to set that up too? (Free M0 tier works for dev, M10 for prod.)
4. **GitHub Actions** — Is your repo on GitHub with Actions enabled? This determines the CI/CD approach.
5. **SSH access** — Do you already have a Linode Nanode provisioned, or are we starting from scratch?
6. **Cloudflare** — Are you using Cloudflare in front of Linode? This affects TLS strategy (Caddy auto-TLS vs Cloudflare origin certs).

---

## Phase 1: Dockerfile & Local Docker Compose

### Objective

Create a production-optimized Docker image for the NestJS API and a Docker Compose stack that runs locally, validating the containerized app works identically to `pnpm dev:api`.

### Scope

- **Included:** Multi-stage Dockerfile, docker-compose.yml, .dockerignore, Caddyfile, local testing
- **Excluded:** CI/CD, Linode provisioning, TLS (local only uses HTTP)

### Implementation Plan

1. **Create `.dockerignore`** at repo root — exclude `node_modules`, `.git`, `dist`, `.env`, test files, mobile app, web app. Keeps build context small, prevents secrets in layers.

2. **Create multi-stage `Dockerfile`** in `apps/api/`:
   - **Stage 1 (deps):** `node:20-alpine`, install pnpm, copy root `package.json` + `pnpm-lock.yaml` + `pnpm-workspace.yaml` + all workspace `package.json` files, run `pnpm install --frozen-lockfile`. Cached until dependencies change.
   - **Stage 2 (build):** Copy source, run `pnpm build` (builds shared → api-client → api via Turborepo). Output: `apps/api/dist/`.
   - **Stage 3 (runtime):** Fresh `node:20-alpine`, copy only `dist/` and production `node_modules`. Set `USER node` (non-root). Entrypoint: `node dist/main`.
   - Target image size: ~150-200MB.

3. **Create `Caddyfile`** at repo root:
   - Local: reverse proxy `localhost:80` → `api:3001`
   - Production config added in Phase 3

4. **Create `docker-compose.yml`** at repo root:
   - `api` service: builds from Dockerfile, `env_file: .env`, healthcheck on `/api/health`, log rotation (`max-size: 10m`, `max-file: 3`), `restart: unless-stopped`
   - `caddy` service: official Caddy image, mounts Caddyfile, ports 80/443, depends_on api healthy
   - Internal Docker network, named volume for Caddy data

5. **Create `.env.example`** — document all required env vars with placeholder values

6. **Test locally:** `docker compose up --build`, verify `/api/health` returns OK through Caddy

### Deliverables

- `apps/api/Dockerfile`
- `.dockerignore`
- `docker-compose.yml`
- `Caddyfile`
- Updated `.env.example`

### Best Industry Patterns

- **Multi-stage builds** — separates build tooling from runtime, reduces image size and attack surface
- **Layer caching** — dependency install cached separately from source, rebuilds skip slow `pnpm install`
- **Non-root container user** — Node's `node` user (UID 1000) prevents container breakout escalation
- **Health checks in Compose** — Docker auto-restarts unhealthy containers

### Code Guidance

- Dockerfile: readable with comments per stage
- Caddyfile: minimal — Caddy's strength is convention over configuration
- docker-compose.yml: use `profiles` to separate local vs production config
- No Makefile or wrapper scripts — `docker compose up` is the interface

### Risks & Tradeoffs

- **Monorepo build context:** Dockerfile needs `packages/shared` and `packages/api-client`. Build context must be repo root. `.dockerignore` is critical.
- **pnpm in Docker:** Workspace hoisting can be tricky. May need `pnpm deploy` for production-only deps.
- **Image size:** LangChain/OpenAI SDK deps are heavy (~50MB). Alpine helps but image won't be tiny.

---

## Phase 2: CI/CD Pipeline (GitHub Actions)

### Objective

Automate building, tagging, pushing the Docker image to a container registry, and deploying to the Linode via SSH — triggered on push to `main`.

### Scope

- **Included:** GitHub Actions workflow, image tagging, SSH deploy script, rollback mechanism
- **Excluded:** Linode provisioning (Phase 3), preview environments, test execution in CI

### Implementation Plan

1. **Create `.github/workflows/deploy.yml`:**
   - **Trigger:** Push to `main`
   - **Job 1 — Build & Push:**
     - Checkout, Docker Buildx setup, GHCR login
     - Build with cache-from/cache-to (GitHub Actions cache)
     - Tag: git SHA (immutable) + `latest` (convenience)
     - Push to `ghcr.io/<org>/portfolio-api:<sha>` and `:latest`
   - **Job 2 — Deploy (depends on Job 1):**
     - SSH into Linode
     - `docker compose pull && docker compose up -d --remove-orphans`
     - Smoke test: `wget -qO- http://localhost:3001/api/health`
     - On failure: rollback to previous image tag

2. **GitHub Actions secrets required:**
   - `LINODE_SSH_KEY` — private key for deploy user
   - `LINODE_HOST` — IP or hostname
   - `GHCR_TOKEN` — or use default `GITHUB_TOKEN`

3. **Create `scripts/deploy.sh`** (lives on Linode):
   - Pulls latest image, recreates containers, health check
   - Writes current SHA to `.last-deploy` for rollback
   - On failure: reverts to previous SHA

4. **Rollback:** `IMAGE_TAG=<previous-sha> docker compose up -d`

### Deliverables

- `.github/workflows/deploy.yml`
- `scripts/deploy.sh`
- Documentation for required GitHub Actions secrets

### Best Industry Patterns

- **Immutable image tags** (git SHA) — every deploy traceable to a commit
- **Build once, deploy anywhere** — same image in all environments, only env vars change
- **Smoke test after deploy** — health check catches boot failures immediately
- **Pin Actions by SHA** — prevents supply chain attacks on third-party actions

### Code Guidance

- Single workflow file (no reusable workflow abstraction for one target)
- Deploy script must be idempotent
- Use `docker compose` v2 plugin, not `docker-compose` v1

### Risks & Tradeoffs

- **SSH key security:** Deploy key scoped to non-root `deploy` user with Docker-only permissions
- **~2-5s downtime per deploy:** `docker compose up -d` restarts the container. Acceptable for Nanode. Zero-downtime would require blue-green (doubles RAM).
- **Registry storage:** Set up image retention policy to avoid unbounded GHCR storage

---

## Phase 3: Linode Server Provisioning & Hardening

### Objective

Provision and harden the Linode Nanode as a secure Docker host ready to receive deployments.

### Scope

- **Included:** OS setup, Docker install, firewall, SSH hardening, swap, deploy user, DNS/TLS
- **Excluded:** Application config (Phase 4), monitoring (Phase 5)

### Implementation Plan

1. **Provision Nanode:** Ubuntu 24.04 LTS, region closest to users

2. **Hardening (via SSH as root, one-time):**
   - Create `deploy` user with Docker group membership
   - Disable root SSH login, password auth (key-only)
   - UFW: allow 22, 80, 443 only
   - Install fail2ban with SSH jail
   - Enable unattended-upgrades

3. **Add 1GB swap:**
   - `fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`
   - Persist in `/etc/fstab`, set `vm.swappiness=10`

4. **Install Docker Engine + Compose plugin:**
   - Official Docker apt repository
   - Add `deploy` user to `docker` group
   - Daemon config: default `json-file` log driver with `max-size: 10m`, `max-file: 3`

5. **DNS:** Point `api.yourdomain.com` A record → Linode IP. If Cloudflare: "DNS only" (grey cloud) so Caddy handles TLS.

6. **Update Caddyfile** with production domain — Caddy auto-provisions Let's Encrypt cert. Certs stored in `caddy_data` Docker volume.

7. **Project directory:** `/opt/portfolio/` with `docker-compose.yml`, `Caddyfile`, `.env`, `.last-deploy`. Owned by `deploy`, `.env` permissions `600`.

8. **GHCR auth on Linode:** `docker login ghcr.io` with read:packages PAT

### Deliverables

- `scripts/provision.sh` — idempotent server setup script
- Updated `Caddyfile` with production domain
- Updated `docker-compose.yml` referencing GHCR image
- DNS setup documentation

### Best Industry Patterns

- **Least privilege** — `deploy` user can only run Docker, no sudo
- **Swap as OOM insurance** — prevents kernel OOM killer on 1GB VM during memory spikes
- **Caddy auto-TLS** — zero-config ACME, automatic renewal, OCSP stapling, HSTS
- **Infrastructure as a script** — `provision.sh` is idempotent for drift correction or replacement server

### Code Guidance

- `provision.sh`: flat Bash, not Ansible/Terraform (one server doesn't justify the tooling)
- Each section idempotent (check before create)
- Commented with "why" per section

### Risks & Tradeoffs

- **Memory:** Monitor swap usage in first week. Consistent swap use → upgrade to 2GB ($12/mo)
- **Single server:** No redundancy. Recovery: re-provision + redeploy (~15-30 min)
- **Caddy + Cloudflare conflict:** If Cloudflare proxy enabled, Caddy can't get Let's Encrypt certs. Choose one TLS termination point.

---

## Phase 4: Environment Configuration & First Deploy

### Objective

Configure production env vars, perform the first deploy, and validate the full stack end-to-end.

### Scope

- **Included:** Production `.env`, first image push, first deploy, smoke testing, CORS config
- **Excluded:** Monitoring dashboards (Phase 5)

### Implementation Plan

1. **Create production `.env`** on Linode (`/opt/portfolio/.env`):
   - `NODE_ENV=production`, `LOG_LEVEL=info`
   - `ALLOWED_ORIGINS=https://yourdomain.com`
   - MongoDB Atlas connection string with `retryWrites=true&w=majority`
   - All secrets: Sentry DSN, OTEL endpoint/headers, S3 creds, JWT secret, API keys

2. **Atlas network access:** Whitelist Linode IP in Atlas Network Access

3. **Trigger first deploy:** Push to `main` or manually trigger workflow

4. **Validate:**
   - `curl https://api.yourdomain.com/api/health` → `{ "status": "ok" }`
   - Check Grafana Cloud for OTEL traces
   - Check Sentry for connectivity
   - Check `docker compose logs api` for structured JSON
   - Test from mobile app (update `EXPO_PUBLIC_API_URL`)

5. **Enable Linode backups:** $2/mo for automatic snapshots

### Deliverables

- Production `.env` on Linode (never in git)
- Successful first deploy with passing health check
- Mobile app pointed at production API
- Linode backups enabled

### Best Industry Patterns

- **Secrets never in git** — `.env` on Linode + GitHub Actions secrets only
- **Atlas IP whitelisting** — defense in depth
- **Validate all telemetry paths** on first deploy before real traffic

### Code Guidance

- Use `.env.example` as checklist — every variable accounted for
- JWT_SECRET: fresh strong random value, not reused from dev
- ALLOWED_ORIGINS: strict, only actual frontend domains

### Risks & Tradeoffs

- **First deploy risk:** If app fails to boot, health check in CI catches it. Debug via `docker compose logs api` — Zod validation error will be clear.
- **Mobile cutover:** Updating `EXPO_PUBLIC_API_URL` requires a new mobile build. Plan alongside deploy.

---

## Phase 5: Production Monitoring & Alerting

### Objective

Set up external uptime monitoring and Grafana dashboards so you know when the API is down or degraded before users do.

### Scope

- **Included:** Uptime monitoring, Grafana dashboard, Sentry alerts, log access strategy
- **Excluded:** Log aggregation (defer to VM upgrade), APM profiling

### Implementation Plan

1. **External uptime monitoring:**
   - UptimeRobot free tier (50 monitors, 5-min intervals)
   - `GET https://api.yourdomain.com/api/health`
   - Alert via email/Slack

2. **Grafana Cloud dashboards:**
   - "Portfolio API" dashboard:
     - Request latency (p50, p95, p99) from OTEL traces
     - Error rate from OTEL spans
     - `outbox.queue.depth` — processing backlog indicator
     - `outbox.job.duration_ms` — async job latency
     - `llm.request.duration_ms` — OpenAI call latency
   - Alerts: queue depth > 20, error rate > 5%, p99 > 10s

3. **Sentry alerts:**
   - Default alert on new issues
   - Regression alert: same issue > 5 times in 1 hour
   - Slack/email integration

4. **Log access (no aggregation):**
   - `docker compose logs -f api --since 1h` via SSH
   - JSON logs with `trace_id` for cross-referencing Grafana traces
   - Log rotation already configured in Phase 1

5. **Auto-restart cron:**
   - `*/5 * * * * docker compose -f /opt/portfolio/docker-compose.yml ps --format json | grep -q unhealthy && docker compose restart api`

### Deliverables

- UptimeRobot monitor
- Grafana Cloud dashboard (JSON export in `infra/grafana/`)
- Sentry alert rules
- Health-based auto-restart cron

### Best Industry Patterns

- **External uptime monitoring** — monitors from outside your infra
- **USE method** — Utilization (queue depth), Saturation (latency), Errors. Three panels cover 90%
- **Logs as last resort** — traces + metrics + Sentry handle most debugging

### Code Guidance

- Commit Grafana dashboard JSON to repo for reproducibility
- 5-6 dashboard panels max — more = noise = ignored

### Risks & Tradeoffs

- **No log aggregation:** Can't search logs in Grafana. `docker compose logs | grep` is sufficient for single-server. Add Alloy on upgrade.
- **5-min uptime interval (free tier):** Up to 5 min undetected downtime. Paid ($7/mo) gives 1-min intervals.

---

## Phase Dependency Map

| Phase | What                   | Depends On    | Parallelizable |
| ----- | ---------------------- | ------------- | -------------- |
| **1** | Dockerfile & Compose   | —             | Yes (with 3)   |
| **2** | CI/CD pipeline         | Phase 1       | —              |
| **3** | Server provisioning    | —             | Yes (with 1-2) |
| **4** | First production deploy | Phases 1-3   | —              |
| **5** | Monitoring & alerting  | Phase 4       | —              |
