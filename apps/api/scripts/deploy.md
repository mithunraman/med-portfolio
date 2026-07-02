# Portfolio API — Server Deployment & Operations Guide

A runbook for provisioning, deploying, and operating the `apps/api` (NestJS) service
on an Oracle Cloud (OCI) Ubuntu VM. Written so a junior engineer can go from a blank
server to a running, self-healing, publicly-served service — and handle day-to-day
deploys, restarts, and log inspection.

> **Scope:** Covers the full stack — the **application tier** (the box running NestJS)
> and the **edge tier** (Caddy reverse proxy + Cloudflare + firewall). The service is
> live at `https://api.logdit.app`, with Authenticated Origin Pulls (mTLS) enforced
> ([§9.8](#98-authenticated-origin-pulls-mtls--done)) and SSH hardened — key-only auth, root
> login disabled, and fail2ban ([§9.9](#99-ssh-hardening)). Remaining hardening (uptime monitor)
> is tracked in [§9.10](#910-remaining--todo).

---

## 1. Architecture at a glance

```
Internet ──▶ Cloudflare (proxied, Full strict) ──▶ Caddy :443 ──▶ NestJS 127.0.0.1:3001
                                                                       │
                        ┌──────────────────────────────────────────────┼───────────────────────┐
                        ▼                                              ▼                        ▼
                  MongoDB Atlas                              OCI Object Storage         Grafana Cloud
                  (data)                                     (media, S3-compatible)     (traces + metrics)
                                                                                        Sentry (errors)
```

**Key facts**

| Thing | Value |
|---|---|
| Cloud / region | OCI, `uk-london-1` (UK South, London) |
| Instance | `portfolio-api` · VM.Standard.A1.Flex (ARM/aarch64) · 2 OCPU / 12 GB · Ubuntu 24.04 |
| Public IP | `193.123.183.36` (**reserved** — stable across reboots/rebuilds) |
| Public URL | `https://api.logdit.app` (Cloudflare-proxied; origin IP hidden) |
| Repo | `github.com/mithunraman/med-portfolio` (SSH deploy key, read-only) |
| App path | `/srv/portfolio/app` (monorepo root) |
| Built entrypoint | `/srv/portfolio/app/apps/api/dist/main.js` |
| Runtime | Node 24 LTS (`/usr/bin/node`) · pnpm 9.15.0 (Corepack) |
| Admin user | `ubuntu` (SSH + sudo) |
| Service user | `portfolio` (runs the app; no login, no sudo) |
| Env / secrets | `/etc/portfolio-api.env` (root:root, `600`) |
| systemd unit | `/etc/systemd/system/portfolio-api.service` |
| Deploy script | `/usr/local/bin/deploy-portfolio` |
| App port | `127.0.0.1:3001` (localhost only) |
| Reverse proxy | Caddy → `127.0.0.1:3001`; cert at `/etc/ssl/cloudflare/origin.{pem,key}` |
| Edge | Cloudflare `logdit.app` zone · SSL **Full (strict)** · Origin CA cert |
| Host firewall | **UFW** (allows 22, 443) — the sole host-firewall manager |
| Network firewall | OCI Security List: 443 ← Cloudflare IPs; 22 ← (to tighten) |
| Health check | `GET /api/health` |

**Design principles** (why it's built this way)

- **Least privilege:** app runs as `portfolio` (no shell login, no sudo); admin is a
  separate `ubuntu` user; secrets file is root-owned and unreadable by the app user.
- **Reproducible:** system-wide Node, Corepack-pinned pnpm, `--frozen-lockfile`.
- **Self-healing:** systemd restarts on crash, starts on boot, with a crash-loop guard.
- **Hidden origin, defense in depth:** public DNS → Cloudflare only; origin reachable
  solely via Cloudflare; two firewall layers (OCI Security List + host UFW).
- **Stateless box:** all data lives in Atlas + Object Storage, so the server is
  disposable and can be rebuilt from scratch using this guide.

---

## 2. Provision a new server from scratch

Do this only when standing up a **brand-new** box. For routine deploys, skip to [§6](#6-day-to-day-deploys).

### 2.1 Create the OCI instance
- Shape **VM.Standard.A1.Flex**, **2 OCPU / 12 GB** (Always Free-eligible), image
  **Canonical Ubuntu 24.04 (aarch64)**, boot volume ~100 GB.
- Networking: a VCN with a **public subnet** + internet gateway (use the
  "Create VCN with Internet Connectivity" wizard).
- **Reserve the public IP** (Networking → Reserved Public IPs) and assign it to the
  instance's primary VNIC, so the address survives termination/rebuild.
- SSH key: your admin key (recommended: keep the private key in 1Password's SSH agent).

Connect:
```bash
ssh ubuntu@193.123.183.36     # or an ~/.ssh/config alias, e.g. `ssh portfolio-api`
```

### 2.2 System prep
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential ca-certificates gnupg
# reboot if a kernel upgrade landed:
[ -f /var/run/reboot-required ] && sudo reboot
```
> If `apt` reports the lock is held, a background auto-update is running. Wait for it,
> don't remove the lock. If it's genuinely wedged for a long time:
> `sudo systemctl stop apt-daily.service apt-daily-upgrade.service` then retry.

### 2.3 Install Node 24 (system-wide) + pnpm (Corepack)
```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
sudo corepack prepare pnpm@9.15.0 --activate
node -v && pnpm -v && npm -v            # expect v24.x, 9.15.0, 11.x
```
> **Why system-wide, not nvm:** systemd runs without a shell/PATH and needs a fixed
> `/usr/bin/node`. nvm lives in a user's home and is invisible to systemd.
> **Corepack is per-user:** run `corepack prepare … --activate` as the same user that
> builds (or rely on the repo's `packageManager` field, which pins it inside the repo).

### 2.4 Create the service user
```bash
sudo useradd --system --create-home --home-dir /srv/portfolio --shell /bin/bash portfolio
sudo -u portfolio install -d -m 700 /srv/portfolio/.ssh
```
> `portfolio` has **no password and no sudo** → it can't be logged into or escalate.
> You operate as it from your `ubuntu` shell via `sudo -u portfolio <cmd>`.
> Its home (`/srv/portfolio`) is not readable by `ubuntu`, so use `sudo`/`sudo -u portfolio`
> for anything inside it (you can't `cd` there as `ubuntu`).

### 2.5 GitHub deploy key (read-only)
```bash
# generate a deploy key owned by the service user
sudo -u portfolio ssh-keygen -t ed25519 -f /srv/portfolio/.ssh/github_deploy -N "" -C "med-portfolio-deploy@oci"
sudo cat /srv/portfolio/.ssh/github_deploy.pub     # add this to GitHub

# ssh config so git uses this key for github.com
sudo -u portfolio tee /srv/portfolio/.ssh/config > /dev/null <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile /srv/portfolio/.ssh/github_deploy
  IdentitiesOnly yes
EOF
sudo -u portfolio chmod 600 /srv/portfolio/.ssh/config

# trust GitHub's host key, then verify
sudo -u portfolio bash -c 'ssh-keyscan github.com >> /srv/portfolio/.ssh/known_hosts 2>/dev/null'
sudo -u portfolio ssh -T git@github.com            # expect the "successfully authenticated" message
```
- On GitHub: **Repo → Settings → Deploy keys → Add deploy key** → paste the `.pub`.
  **Leave "Allow write access" UNCHECKED** (the server only pulls).

### 2.6 Clone the repo
```bash
sudo -u portfolio git clone git@github.com:mithunraman/med-portfolio.git /srv/portfolio/app
sudo -u portfolio git -C /srv/portfolio/app branch --show-current   # expect: main
```

### 2.7 Install deps + first build
```bash
# install ONLY the api and its workspace deps (@acme/shared) — skips mobile/web
sudo -u portfolio bash -c 'cd /srv/portfolio/app && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile --filter=api...'
# build shared first, then the api
sudo -u portfolio bash -c 'cd /srv/portfolio/app && pnpm --filter=@acme/shared run build && pnpm --filter=api run build'
sudo ls -l /srv/portfolio/app/apps/api/dist/main.js   # confirm the entrypoint exists
```
> The API only depends on `@acme/shared`. `api-client` is for the frontend and is not
> built here.

Then continue to [§3 secrets](#3-configuration--secrets), [§4 systemd](#4-the-systemd-service),
and [§9 edge tier](#9-edge-tier-caddy--cloudflare).

---

## 3. Configuration & secrets

All config lives in **`/etc/portfolio-api.env`** — root-owned, `600`, **never committed**.
The app validates every variable at boot (Zod); a missing/invalid value aborts startup
with a clear error.

```bash
sudo nano /etc/portfolio-api.env
# ...paste the template below, fill in real values...
sudo chown root:root /etc/portfolio-api.env
sudo chmod 600 /etc/portfolio-api.env
```

**Template**
```bash
# ---- Server ----
NODE_ENV=production
PORT=3001
LOG_LEVEL=info
TRUST_PROXY_HOPS=2                 # Cloudflare -> Caddy -> app = 2 proxy hops

# ---- Database (MongoDB Atlas) ----
MONGODB_URI=mongodb+srv://USER:URLENCODED_PW@CLUSTER.mongodb.net/logdit?retryWrites=true&w=majority&appName=logdit-prod

# ---- Auth ----
JWT_ACCESS_SECRET=<openssl rand -base64 48>

# ---- Object storage (OCI Object Storage, S3-compatible) ----
S3_ENDPOINT=https://lrplpccxvkmt.compat.objectstorage.uk-london-1.oraclecloud.com
S3_REGION=uk-london-1              # NB: must be the real region, NOT "auto" (OCI signs with it)
S3_ACCESS_KEY_ID=<OCI Customer Secret Key - access key>
S3_SECRET_ACCESS_KEY=<OCI Customer Secret Key - secret>
S3_BUCKET_MEDIA=portfolio-media

# ---- OpenAI / AssemblyAI ----
OPENAI_API_KEY=<...>
ASSEMBLYAI_API_KEY=<...>

# ---- Sentry (errors) ----
SENTRY_DSN=<prod project DSN>

# ---- OpenTelemetry -> Grafana Cloud (traces + metrics) ----
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-prod-gb-south-1.grafana.net/otlp
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic%20<base64(instanceID:token)>

# ---- CORS (web origins; harmless/empty for mobile-only) ----
ALLOWED_ORIGINS=https://app.logdit.app
```

**EnvironmentFile format rules (systemd, not shell):**
- `KEY=value`, no quotes, no spaces around `=`, one per line.
- Only the *first* `=` splits key/value → the OTEL `Authorization=Basic%20...` header is fine.
- Keep the `%20` (URL-encoded space) in the OTEL header.
- **Omit** optional vars you don't use — don't leave them blank (empty string fails validation).

**List the keys present (no secrets shown):**
```bash
sudo grep -oE '^[A-Z0-9_]+=' /etc/portfolio-api.env | sort
```
> Note the `0-9` in the character class — without it, `S3_*` keys (which contain a digit)
> are silently omitted from the list.

### External services checklist
- **MongoDB Atlas:** cluster created; DB user; **Network Access allowlist includes the
  server's reserved IP `193.123.183.36/32`** (not `0.0.0.0/0`).
- **OCI Object Storage:** bucket `portfolio-media`; a **Customer Secret Key** for the
  `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`.
- **Sentry / Grafana Cloud:** production project/stack; DSN + OTLP token in the env file.

---

## 4. The systemd service

Create `/etc/systemd/system/portfolio-api.service`:
```bash
sudo tee /etc/systemd/system/portfolio-api.service > /dev/null <<'EOF'
[Unit]
Description=Portfolio API (NestJS)
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
User=portfolio
Group=portfolio
WorkingDirectory=/srv/portfolio/app/apps/api
EnvironmentFile=/etc/portfolio-api.env
ExecStart=/usr/bin/node dist/main.js

Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=30
LimitNOFILE=65535

StandardOutput=journal
StandardError=journal
SyslogIdentifier=portfolio-api

# --- sandbox / hardening (NB: no MemoryDenyWriteExecute — it breaks V8's JIT) ---
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/srv/portfolio/app
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
RestrictRealtime=true

[Install]
WantedBy=multi-user.target
EOF
```

Enable + start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now portfolio-api      # start now + on every boot
systemctl status portfolio-api --no-pager
```

**Unit cheat-sheet**
- `ExecStart=/usr/bin/node dist/main.js` — run the built artifact directly (not `pnpm start`,
  so SIGTERM reaches Node for graceful shutdown).
- `Restart=always` + `StartLimitBurst=5/60s` — auto-recover, but give up if it crash-loops.
- `EnvironmentFile` — read by systemd as root, then the process drops to `portfolio`.
- The sandbox block makes the filesystem read-only (except the app dir), isolates `/tmp`,
  and blocks privilege escalation. **Do not add `MemoryDenyWriteExecute` — Node won't start.**

---

## 5. Logs & observability

**App logs** = Pino JSON → stdout → **journald** (nothing is written to log files).
```bash
journalctl -u portfolio-api -f                     # live tail
journalctl -u portfolio-api -n 100 --no-pager      # last 100 lines
journalctl -u portfolio-api --since "1 hour ago"
journalctl -u portfolio-api -p err                 # errors only
journalctl -u portfolio-api -o cat | jq            # raw JSON -> pretty (Pino output)
```
Caddy's access/error logs: `journalctl -u caddy -f`. Retention/rotation is automatic
(tune in `/etc/systemd/journald.conf`).

**Remote observability** (wired in code, active once env vars are set):
- **Traces + metrics →** Grafana Cloud (OTLP).
- **Errors →** Sentry.
- Logs are **not** shipped remotely yet — that's the optional Grafana Alloy → Loki add-on.

---

## 6. Day-to-day deploys

### The one-command way (recommended)
```bash
deploy-portfolio
```
This runs: `git pull --ff-only` → `pnpm install` (frozen) → build `@acme/shared` + `api`
→ `systemctl restart` → verify the service is active (prints logs; non-zero exit on failure).
See the script source at [§7](#7-the-deploy-script).

### The manual way (what the script does)
```bash
# 1. pull latest (as the service user, read-only deploy key)
sudo -u portfolio git -C /srv/portfolio/app pull --ff-only

# 2. install deps (only if package.json / lockfile changed; safe to always run)
sudo -u portfolio bash -c 'cd /srv/portfolio/app && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile --filter=api...'

# 3. rebuild (shared before api)
sudo -u portfolio bash -c 'cd /srv/portfolio/app && pnpm --filter=@acme/shared run build && pnpm --filter=api run build'

# 4. restart
sudo systemctl restart portfolio-api

# 5. verify
systemctl status portfolio-api --no-pager
curl -i http://localhost:3001/api/health
```

### Service control
```bash
sudo systemctl start   portfolio-api
sudo systemctl stop    portfolio-api
sudo systemctl restart portfolio-api
sudo systemctl status  portfolio-api --no-pager
systemctl is-active    portfolio-api
systemctl is-enabled   portfolio-api
```

### Changing config
Edit `/etc/portfolio-api.env`, then:
```bash
sudo systemctl restart portfolio-api     # env changes only need a restart
# (a change to the .service unit file also needs: sudo systemctl daemon-reload)
```

---

## 7. The deploy script

Lives at `/usr/local/bin/deploy-portfolio` (run as `ubuntu`; it calls sudo internally).
To (re)create it:
```bash
sudo tee /usr/local/bin/deploy-portfolio > /dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/srv/portfolio/app
SERVICE=portfolio-api
APP_USER=portfolio

echo "==> [1/4] Pulling latest code..."
sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only

echo "==> [2/4] Installing dependencies (frozen lockfile)..."
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile --filter=api..."

echo "==> [3/4] Building @acme/shared + api..."
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && pnpm --filter=@acme/shared run build && pnpm --filter=api run build"

echo "==> [4/4] Restarting $SERVICE..."
sudo systemctl restart "$SERVICE"
sleep 3

if sudo systemctl is-active --quiet "$SERVICE"; then
  echo "✅ Deploy complete — $SERVICE is running."
  sudo journalctl -u "$SERVICE" -n 15 --no-pager || true
else
  echo "❌ $SERVICE failed to start. Recent logs:"
  sudo journalctl -u "$SERVICE" -n 40 --no-pager || true
  exit 1
fi
EOF
sudo chmod +x /usr/local/bin/deploy-portfolio
```

---

## 8. Health & troubleshooting

### Health check
```bash
curl -i http://localhost:3001/api/health         # origin, direct
curl -i https://api.logdit.app/api/health        # through Cloudflare (expect a cf-ray header)
```
Healthy = HTTP 200 with `{"status":"ok","info":{"mongodb":{"status":"up"},"storage":{"status":"up"}}}`.
A `503` means a dependency is down — the JSON says which (`mongodb` or `storage`).

### Common issues
| Symptom | Likely cause | Fix |
|---|---|---|
| `503`, `storage: down` "UnknownError" | `S3_REGION=auto` (OCI signs with the region) | set `S3_REGION=uk-london-1`, restart |
| `503`, `storage: down` `SignatureDoesNotMatch` | wrong S3 secret key (shown once — easy to mis-copy) | regenerate OCI Customer Secret Key, update env |
| `503`, `mongodb: down` / boot timeout | Atlas allowlist missing the server IP | add `193.123.183.36/32` in Atlas Network Access |
| Service `failed` at boot, Zod error in logs | missing/invalid env var | fix `/etc/portfolio-api.env`, restart |
| `active` but crash-looping | runtime error | `journalctl -u portfolio-api -n 100` |
| `cd: /srv/portfolio/app: Permission denied` | `ubuntu` can't enter the service user's home | use `sudo -u portfolio` / `git -C` / `sudo ls` |
| Cloudflare **523** "origin unreachable" | host firewall blocking 443 (OCI default iptables, or a UFW/iptables conflict) | ensure 443 is allowed on the host (`sudo ufw status`); see [§9.5](#95-host-firewall-ufw) |
| Cloudflare **521/522** | origin down, or wrong SSL mode | check `systemctl is-active caddy portfolio-api`; set Cloudflare SSL → **Full (strict)** |
| 443 open in OCI Security List but still blocked | the **host** firewall also blocks it (two layers) | open 443 on the host too (UFW) |
| UFW shows `443 ALLOW` yet still 523 | stale OCI `REJECT` rule sits *before* ufw's chains in `iptables` | remove the OCI rules so UFW is authoritative — see [§9.5](#95-host-firewall-ufw) |

### Debug an S3 credential/endpoint problem directly
```bash
sudo tee /srv/portfolio/app/apps/api/s3check.cjs > /dev/null <<'EOF'
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
  forcePathStyle: true,
});
s3.send(new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET_MEDIA, MaxKeys: 1 }))
  .then(r => console.log('SUCCESS http', r.$metadata.httpStatusCode))
  .catch(e => console.error('FAILED name=', e.name, 'code=', e.Code||e.code, 'status=', e.$metadata&&e.$metadata.httpStatusCode, 'msg=', e.message));
EOF
sudo bash -c 'set -a; source <(grep -E "^S3_" /etc/portfolio-api.env); set +a; cd /srv/portfolio/app/apps/api && node s3check.cjs'
sudo rm -f /srv/portfolio/app/apps/api/s3check.cjs
```
(`ListObjectsV2` returns a real error body, unlike the `HEAD` the health check uses.)

### Recovering SSH access if you lose your key
- Restore it from **1Password** on another device (primary path), or
- **OCI Console → instance → Run command** to append a new public key to
  `~ubuntu/.ssh/authorized_keys` (no SSH needed), or
- The box is stateless — worst case, rebuild it from this guide (data is safe in Atlas + Object Storage).

---

## 9. Edge tier (Caddy + Cloudflare)

The app binds `127.0.0.1:3001` only. Public access is **"Mode A"**: Cloudflare proxies
traffic to a hidden origin, so the server IP never appears in public DNS and all traffic
gets Cloudflare's WAF/DDoS/TLS. Live at **`https://api.logdit.app`**.

### Firewall model — TWO layers (a port must be open in BOTH)
- **OCI Security List** (network/edge) — what may reach the VM. Managed in the OCI console.
- **Host firewall on the box** (UFW) — what the OS accepts.

> ⚠️ The stock OCI Ubuntu image *also* ships **default iptables rules that block everything
> but SSH**. Opening a port in the Security List is **not enough** — it must also be open on
> the host. (This was the cause of a Cloudflare **523** during setup.)

### 9.1 Install Caddy
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
caddy version
```
Caddy installs a `caddy.service` + a non-root `caddy` user with `CAP_NET_BIND_SERVICE`
(binds 80/443 without root).

### 9.2 Cloudflare Origin CA certificate
Cloudflare → `logdit.app` zone → **SSL/TLS → Origin Server → Create Certificate**
(RSA 2048; hostnames `api.logdit.app` or `*.logdit.app`; 15-year). Write cert + key to the box:
```bash
sudo mkdir -p /etc/ssl/cloudflare
sudo nano /etc/ssl/cloudflare/origin.pem     # paste the Origin Certificate
sudo nano /etc/ssl/cloudflare/origin.key     # paste the Private Key (shown once; back up in 1Password)
sudo chown root:caddy /etc/ssl/cloudflare/origin.key
sudo chmod 640 /etc/ssl/cloudflare/origin.key    # readable by caddy group, not world
sudo chmod 644 /etc/ssl/cloudflare/origin.pem
```

### 9.3 Caddyfile
```bash
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
api.logdit.app {
    # Cloudflare Origin CA cert (explicit tls also disables ACME — correct behind Cloudflare)
    # NOTE: §9.8 upgrades this line to a client_auth block to enforce AOP (mTLS)
    tls /etc/ssl/cloudflare/origin.pem /etc/ssl/cloudflare/origin.key
    encode zstd gzip
    log {
        output stderr
        format json
    }
    # Security headers are set by the app (Helmet) — intentionally not duplicated here
    reverse_proxy 127.0.0.1:3001
}
EOF
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```
Test the origin locally (bypasses DNS/firewall via loopback):
```bash
curl -ik --resolve api.logdit.app:443:127.0.0.1 https://api.logdit.app/api/health   # expect 200
```

### 9.4 OCI Security List — open 443 to Cloudflare only
OCI → Networking → `portfolio-vcn` → Security Lists → default → **Add Ingress Rules**.
Add one **TCP / port 443** rule per Cloudflare IPv4 range (all 15 from
<https://www.cloudflare.com/ips-v4>). **Not** `0.0.0.0/0`.
> All 15 are required — Cloudflare egresses from any of its ranges; one IP causes intermittent 523s.

### 9.5 Host firewall (UFW)
The box uses **UFW** as the single host-firewall manager (we migrated off the OCI default
iptables). To reproduce on a fresh box:
```bash
# 0. SAFETY NET: auto-reset the firewall in 5 min if you lock yourself out
sudo systemd-run --on-active=5min --unit=fw-rescue /bin/sh -c 'ufw --force disable; iptables -P INPUT ACCEPT; iptables -F'

# 1. install + base rules (SSH FIRST to avoid lockout)
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 443/tcp

# 2. stop OCI's iptables manager so its rules don't reload at boot
sudo systemctl disable --now netfilter-persistent
sudo sh -c ': > /etc/iptables/rules.v4'

# 3. enable UFW
sudo ufw enable
```
> ⚠️ **Critical gotcha:** `ufw enable` appends its chains *after* the pre-existing OCI rules,
> so the OCI `REJECT` still blocks 443 (→ Cloudflare 523). Remove the stale OCI rules so
> UFW is authoritative:
```bash
sudo iptables -L INPUT -n --line-numbers    # you'll see OCI rules 1-5 (ESTABLISHED/icmp/lo/22/REJECT) then ufw-* chains
sudo iptables -D INPUT 5     # REJECT
sudo iptables -D INPUT 4     # ssh (ufw already allows 22)
sudo iptables -D INPUT 3     # lo   (ufw handles)
sudo iptables -D INPUT 2     # icmp (ufw handles)
sudo iptables -D INPUT 1     # established (ufw handles)
sudo iptables -L INPUT -n --line-numbers    # should now show ONLY ufw-* chains under policy DROP
```
> Removing OCI rule #4 matters: it allowed **SSH from anywhere** and would silently override
> any UFW SSH restriction. UFW persists its own rules; with `netfilter-persistent` disabled +
> `rules.v4` cleared, the OCI rules won't return on reboot.

Verify SSH still works from a **second** terminal, then cancel the rescue timer:
```bash
sudo systemctl stop fw-rescue.timer
sudo systemctl reset-failed 'fw-rescue*' 2>/dev/null || true
```

### 9.6 Cloudflare DNS + SSL mode
- **DNS → Add record:** `A` · name `api` · `193.123.183.36` · **Proxied (orange cloud)**.
  Public DNS then resolves to a Cloudflare IP (verify: `dig api.logdit.app` ≠ origin IP).
- **SSL/TLS → Overview → Full (strict)** — *not* Flexible (Flexible connects to origin over
  plain HTTP :80, which isn't served/allowed).

### 9.7 Verify (go-live)
```bash
curl -i https://api.logdit.app/api/health     # expect HTTP 200 + a `cf-ray:` header
```

### 9.8 Authenticated Origin Pulls (mTLS) — DONE
The durable origin lock: Caddy *requires* a client certificate that only **our** Cloudflare zone
holds, so even a caller inside Cloudflare's IP ranges (which the §9.4 allowlist can't distinguish)
is rejected. We use **zone-level** AOP (our own cert), not global AOP (a shared Cloudflare cert
that every customer presents).

**Certificate model — a two-tier chain (CA → leaf):**

| File | Role | Lives |
|---|---|---|
| `aop-ca.pem` | CA (root) — the trust anchor | **Caddy** `trust_pool` (server) |
| `aop-ca.key` | CA private key — can mint new client certs | **offline on the admin Mac only** — never on the server, never uploaded |
| `aop-client.pem` | leaf cert (signed by the CA, `CA:FALSE`) | **uploaded to Cloudflare** |
| `aop-client.key` | leaf private key | **uploaded to Cloudflare** |

> Cloudflare rejects a self-signed root with a **"missing leaf certificate"** error — the uploaded
> cert *must* be a leaf (`CA:FALSE`) signed by a separate CA. Hence the two-tier chain below.

**1. Generate the chain (on the admin Mac, outside any git repo):**
```bash
mkdir -p ~/aop-certs && cd ~/aop-certs
# CA (root)
openssl genrsa -out aop-ca.key 2048
openssl req -new -x509 -days 3650 -key aop-ca.key -out aop-ca.pem \
  -subj "/C=GB/O=Logdit/CN=Logdit AOP CA"
# leaf key + CSR
openssl genrsa -out aop-client.key 2048
openssl req -new -key aop-client.key -out aop-client.csr \
  -subj "/C=GB/O=Logdit/CN=aop.logdit.app"
# sign leaf with the CA — CA:FALSE makes it a real leaf
openssl x509 -req -in aop-client.csr -CA aop-ca.pem -CAkey aop-ca.key \
  -CAcreateserial -days 3650 -out aop-client.pem \
  -extfile <(printf "basicConstraints=CA:FALSE\nkeyUsage=digitalSignature\nextendedKeyUsage=clientAuth")
openssl x509 -in aop-client.pem -noout -subject -issuer   # subject=leaf, issuer=CA → correct
```

**2. Upload the leaf to Cloudflare (dashboard UI):**
1. Cloudflare dashboard → select `logdit.app` → **SSL/TLS → Origin Server → Authenticated Origin Pulls**.
2. Under **Zone-level Authenticated Origin Pulls**, click **Upload a certificate**.
3. **Certificate** field → paste the full contents of `aop-client.pem` (include the
   `-----BEGIN/END CERTIFICATE-----` lines).
4. **Private key** field → paste the full contents of `aop-client.key`.
5. Save, then flip the **zone-level toggle ON** so Cloudflare presents the leaf on origin pulls.

> If the form errors with **"missing leaf certificate"**, the uploaded cert is a self-signed root,
> not a leaf — regenerate the chain in step 1 so the leaf is signed by the CA with `CA:FALSE`.

**3. Put the CA on the server + require it in Caddy:**
```bash
scp ~/aop-certs/aop-ca.pem portfolio-api:/tmp/aop-ca.pem
ssh portfolio-api
sudo mv /tmp/aop-ca.pem /etc/ssl/cloudflare/aop-ca.pem
sudo chown root:root /etc/ssl/cloudflare/aop-ca.pem && sudo chmod 644 /etc/ssl/cloudflare/aop-ca.pem
```
Change the §9.3 `tls` line to open a `client_auth` block:
```caddy
    tls /etc/ssl/cloudflare/origin.pem /etc/ssl/cloudflare/origin.key {
        client_auth {
            mode require_and_verify
            trust_pool file {
                pem_file /etc/ssl/cloudflare/aop-ca.pem
            }
        }
    }
```
```bash
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

**4. Verify:**
```bash
# through Cloudflare (presents the leaf) → 200
curl -sI https://api.logdit.app/api/health | head -1
# mTLS layer alone, from the server (loopback isn't firewalled; no client cert presented) → must FAIL
ssh portfolio-api 'curl -skI --resolve api.logdit.app:443:127.0.0.1 https://api.logdit.app/api/health | head -1'
```
The first is `HTTP/2 200`; the second returns **empty** (handshake refused) — that's AOP rejecting a
certless client. A direct-to-origin test from outside instead **hangs**, because the §9.4/§9.5
firewall drops the packet before Caddy is even reached (defence in depth: firewall *and* mTLS).

> Rollback: delete the `{ … }` block from the `tls` line and `sudo systemctl reload caddy`.

### 9.9 SSH hardening
Four levers, in order of impact: key-only auth → disable root → restrict source IP → fail2ban.
Always check the **effective** config (Ubuntu spreads settings across `sshd_config` +
`sshd_config.d/*.conf`, and sshd is **first-match-wins**):
```bash
sudo sshd -T | grep -Ei 'passwordauthentication|permitrootlogin|pubkeyauthentication|kbdinteractiveauthentication'
```
Target state: `passwordauthentication no`, `kbdinteractiveauthentication no`,
`pubkeyauthentication yes`, `permitrootlogin no`.

> ⚠️ **Golden rule for every SSH change:** keep your current session open, `sudo sshd -t` to
> validate *before* reloading, `sudo systemctl reload ssh` (reload, not restart — live sessions
> survive), then test a **fresh login in a second terminal** before trusting it. If locked out,
> recover via the OCI **Cloud Shell / serial console**.

**#1 Key-only auth — DONE.** Provided by the cloud image (`60-cloudimg-settings.conf` sets
`PasswordAuthentication no`) plus `kbdinteractiveauthentication no`. No password path exists.

**#2 Disable root SSH login — DONE.** The compiled default is `prohibit-password` (root *can*
still log in with a key), so we set it explicitly. Because sshd is first-match-wins, the override
must sort **before** any cloud drop-in — name it `10-` (beats `60-cloudimg-settings.conf`):
```bash
echo 'PermitRootLogin no' | sudo tee /etc/ssh/sshd_config.d/10-hardening.conf
sudo sshd -t && sudo systemctl reload ssh
sudo sshd -T | grep -i permitrootlogin      # expect: permitrootlogin no
```
> This is policy, not coincidence: root was already unreachable only because no key sits in
> `/root/.ssh/authorized_keys`. `PermitRootLogin no` keeps it refused even if a key ever lands there.
> You still log in as `ubuntu` + `sudo` exactly as before — root *account* and `sudo` are unaffected.

**#3 / #4 Restrict who can reach port 22 — DONE via fail2ban (roaming setup).**
This box is administered from **multiple networks** (home/cafés/hotspots), so a static-IP lock
would risk locking us out. Instead we keep 22 reachable and let fail2ban auto-ban brute-force
scanners. Key-only auth already defeats guessing; fail2ban is scanner/noise reduction + defence
in depth. Config (`/etc/fail2ban/jail.local` — never edit `jail.conf`, it's overwritten on upgrade):
```ini
[DEFAULT]
backend   = systemd          # read journald, where sshd logs (NOT /var/log/auth.log)
banaction = ufw              # bans appear in `ufw status`, one firewall to reason about
bantime   = 1h
findtime  = 10m
maxretry  = 5
bantime.increment = true     # escalate repeat offenders: 1h → 2h → 4h ...
bantime.factor    = 2
bantime.maxtime   = 1w       # ...capped at a week
ignoreip  = 127.0.0.1/8 ::1  # add a stable VPN/bastion CIDR here if you ever get one

[sshd]
enabled = true               # the ONLY jail — 22 is the sole exposed auth surface
```
```bash
sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd     # jail active; "Journal matches: ...sshd.service" = watching journald
```
> **Self-ban recovery:** a repeatedly-fumbling client (e.g. the 1Password wrong-key case above) can
> ban *your* IP. Recover via the OCI **serial console / Cloud Shell**:
> `sudo fail2ban-client set sshd unbanip <IP>` (or wait out `bantime`). See bans in `ufw status | grep -i deny`.

**Alternative — static-IP lock** (if this box ever becomes single-network): restrict 22 in **both**
layers with the rescue timer armed, instead of / alongside fail2ban:
```bash
sudo systemd-run --on-active=5min --unit=fw-rescue /bin/sh -c 'ufw --force disable; iptables -P INPUT ACCEPT; iptables -F'
sudo ufw allow from <YOUR_IP> to any port 22
sudo ufw delete allow 22/tcp
# then: OCI Security List → change the port-22 ingress source from 0.0.0.0/0 to <YOUR_IP>/32
# verify a fresh login in a 2nd terminal, then: sudo systemctl stop fw-rescue.timer
```

> **Operational gotcha — 1Password SSH agent (learned the hard way):** the agent only serves keys
> from vaults listed in `~/.config/1password/ssh/agent.toml` (or all keys if that file is absent).
> **Moving the server key to a new vault silently drops it from the agent** → `ssh` presents the
> wrong key → `Permission denied (publickey)`, and 1Password shows **no Touch ID prompt** (the tell —
> there's no managed key to authorize). Fix: add the new vault to `agent.toml` (or move the key back),
> quit+reopen 1Password, and confirm with
> `SSH_AUTH_SOCK="$HOME/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock" ssh-add -l`.

### 9.10 Remaining — TODO
- [ ] **Uptime monitor** on `https://api.logdit.app/api/health` (external, e.g. UptimeRobot/BetterStack).

---

## Appendix — quick reference

```bash
# connect
ssh portfolio-api                                   # (~/.ssh/config alias → 193.123.183.36)

# deploy
deploy-portfolio

# app service
sudo systemctl {start|stop|restart|status} portfolio-api
systemctl is-active portfolio-api

# app logs
journalctl -u portfolio-api -f
journalctl -u portfolio-api -n 100 --no-pager

# health
curl -i http://localhost:3001/api/health            # origin
curl -i https://api.logdit.app/api/health           # through Cloudflare

# run a command as the service user
sudo -u portfolio git -C /srv/portfolio/app pull --ff-only
sudo -u portfolio bash -c 'cd /srv/portfolio/app && pnpm --filter=api run build'

# edge: caddy + firewall
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
journalctl -u caddy -f
sudo ufw status verbose
```

| Path | What |
|---|---|
| `/srv/portfolio/app` | monorepo (owned by `portfolio`) |
| `/srv/portfolio/app/apps/api/dist/main.js` | built entrypoint |
| `/etc/portfolio-api.env` | secrets/config (root:root `600`) |
| `/etc/systemd/system/portfolio-api.service` | systemd unit |
| `/usr/local/bin/deploy-portfolio` | deploy script |
| `/srv/portfolio/.ssh/github_deploy` | read-only GitHub deploy key |
| `/etc/caddy/Caddyfile` | Caddy reverse-proxy config |
| `/etc/ssl/cloudflare/origin.{pem,key}` | Cloudflare Origin CA cert + key |
| `/etc/ssl/cloudflare/aop-ca.pem` | AOP CA cert — Caddy `trust_pool` (client-cert verify) |
| `~/aop-certs/*` (admin Mac) | AOP CA + leaf; **`aop-ca.key` kept offline, never on server** |
