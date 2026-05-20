# Deploying a NestJS Backend on a Linode Nanode

A practical guide for shipping a Node.js backend to a fresh Linode Nanode using Caddy + PM2, with prod and test environments on the same box.

---

## 1. Overview

### Architecture

```
                      ┌────────────────────────────────┐
                      │  Linode Nanode (Ubuntu 24.04)  │
                      │                                │
   Internet ──443──▶  │   Caddy (reverse proxy + TLS)  │
                      │     │                          │
                      │     ├─▶ :3001  api-prod  (PM2) │
                      │     └─▶ :3002  api-test  (PM2) │
                      │                                │
                      └────────────────────────────────┘
                              │
                              ▼
                  MongoDB Atlas, S3/R2, OpenAI (external)
```

### What "bare-metal-style" means here

We install Node.js, the app, and supporting services **directly on the host OS** — no Docker, no Kubernetes, no abstraction layer between your code and the kernel. Trade-off: less reproducibility, but fewer moving parts, less memory overhead (important on a 1GB Nanode), and far easier debugging when something breaks.

### Roles

| Component | Role |
|-----------|------|
| **Ubuntu LTS** | The OS. Long-term support means 5 years of security patches without disruptive upgrades. |
| **Node.js** | JavaScript runtime your NestJS app runs on. |
| **PM2** | Process manager. Keeps Node running, restarts on crash, manages logs, survives reboots. |
| **Caddy** | Reverse proxy. Terminates HTTPS, auto-renews Let's Encrypt certs, routes traffic to PM2-managed processes by hostname. |
| **The app** | Your NestJS backend, deployed as a directory under `/opt/portfolio/`. |

---

## 2. Initial Server Setup

### 2.1 SSH into the server as root

After creating the Linode, you'll have a root password and a public IP. From your local machine:

```bash
ssh root@YOUR_LINODE_IP
```

> ⚠️ This first login uses a password. We'll switch to SSH keys and disable password login below.

### 2.2 Update packages

```bash
apt update && apt upgrade -y
```

- `apt update` refreshes the package index.
- `apt upgrade -y` installs security and bug-fix updates non-interactively.

### 2.3 Set the hostname

```bash
hostnamectl set-hostname portfolio-prod
```

Edit `/etc/hosts` to match:

```bash
nano /etc/hosts
```

Add (or update) the line:

```
127.0.1.1   portfolio-prod
```

### 2.4 Set the timezone

```bash
timedatectl set-timezone Europe/London   # or your zone
```

Verify: `timedatectl`. Correct time matters for TLS, logs, and cron.

### 2.5 Create a non-root sudo user

Running as `root` is dangerous — a typo can destroy the system. Create a personal admin user:

```bash
adduser mithun                # prompts for password; pick a strong one
usermod -aG sudo mithun       # grant sudo
```

### 2.6 Create a service user for the app

The app should **not** run as your personal user — and definitely not as root. Create a dedicated system user:

```bash
adduser --system --group --no-create-home --shell /usr/sbin/nologin portfolio
```

What the flags do:
- `--system` — no UID in the human range, no password.
- `--group` — also creates a `portfolio` group.
- `--no-create-home` — no `/home/portfolio` directory.
- `--shell /usr/sbin/nologin` — cannot log in interactively.

Result: a locked-down identity used only by PM2 to run your Node process.

---

## 3. Security Best Practices

### 3.1 SSH key authentication

On your **local machine** (not the server):

```bash
ssh-keygen -t ed25519 -C "mithun@laptop"   # if you don't already have a key
```

Copy it to the server:

```bash
ssh-copy-id mithun@YOUR_LINODE_IP
```

Test:

```bash
ssh mithun@YOUR_LINODE_IP    # should log you in without a password prompt
```

> ✅ Don't proceed until key-based login works. Otherwise you'll lock yourself out.

### 3.2 Disable root SSH login and password authentication

On the server, edit `/etc/ssh/sshd_config`:

```bash
sudo nano /etc/ssh/sshd_config
```

Ensure these lines (uncomment / change them):

```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

Reload SSH:

```bash
sudo systemctl restart ssh
```

> ⚠️ **Keep your current SSH session open** while you test login from a second terminal. If anything is wrong, you can fix it from the open session.

### 3.3 UFW firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Now only SSH (22), HTTP (80), and HTTPS (443) are reachable from the internet.

### 3.4 Fail2Ban (auto-ban brute force SSH attempts)

```bash
sudo apt install -y fail2ban
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo nano /etc/fail2ban/jail.local
```

In `[sshd]`, ensure:

```
enabled = true
maxretry = 5
bantime = 1h
```

```bash
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd
```

### 3.5 Automatic security updates

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

This applies security patches automatically. Reboots may be needed for kernel updates — check `/var/run/reboot-required` periodically.

### 3.6 Ownership conventions

| Path | Owner | Mode | Notes |
|------|-------|------|-------|
| `/opt/portfolio/` | `portfolio:portfolio` | `750` | App lives here |
| `/opt/portfolio/*/.env*` | `portfolio:portfolio` | `600` | Secrets, only owner reads |
| `/etc/caddy/Caddyfile` | `root:root` | `644` | Public config |
| `/var/log/caddy/` | `caddy:caddy` | `750` | Caddy writes logs here |
| `~/.ssh/authorized_keys` | `mithun:mithun` | `600` | SSH keys |

**Never world-writable** (`chmod 777`). If you find yourself reaching for `777`, the answer is almost always the wrong ownership instead.

---

## 4. Installing Required Software

### 4.1 Node.js LTS (via NodeSource)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version    # should print v20.x
npm --version
```

### 4.2 pnpm (this project uses pnpm, not npm)

```bash
sudo npm install -g pnpm
pnpm --version
```

### 4.3 PM2

```bash
sudo npm install -g pm2
pm2 --version
```

### 4.4 Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
caddy version
```

`apt install caddy` automatically creates a `caddy` user, a systemd unit, and `/etc/caddy/Caddyfile`.

### 4.5 Useful utilities

```bash
sudo apt install -y git htop ncdu logrotate
```

- `htop` — interactive process viewer
- `ncdu` — disk usage explorer
- `logrotate` — already installed on Ubuntu, but worth verifying

### 4.6 Add a swap file (important on a 1GB Nanode)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo swapon --show
```

This gives the kernel a 2GB safety net. Without swap, a memory spike kills your Node process. With swap, performance degrades briefly instead.

---

## 5. Application Deployment

### 5.1 Directory layout

```
/opt/portfolio/
├── prod/                # production checkout
│   ├── .env             # mode 600, owned by portfolio
│   ├── apps/api/...
│   └── ...
├── test/                # test checkout
│   ├── .env
│   └── ...
└── ecosystem.config.js  # PM2 config
```

Create and own:

```bash
sudo mkdir -p /opt/portfolio/{prod,test}
sudo chown -R portfolio:portfolio /opt/portfolio
sudo chmod 750 /opt/portfolio
```

### 5.2 Allow your user to deploy

Add yourself to the `portfolio` group so you can edit files without `sudo`:

```bash
sudo usermod -aG portfolio mithun
# Log out and back in for group changes to take effect
```

### 5.3 Clone the repo

For each environment:

```bash
sudo -u portfolio git clone https://github.com/yourname/portfolio.git /opt/portfolio/prod
sudo -u portfolio git -C /opt/portfolio/prod checkout main

sudo -u portfolio git clone https://github.com/yourname/portfolio.git /opt/portfolio/test
sudo -u portfolio git -C /opt/portfolio/test checkout develop   # or whatever branch
```

> If the repo is private, set up a deploy key:
> `sudo -u portfolio ssh-keygen -t ed25519 -f /home/portfolio/.ssh/id_ed25519`
> Add the public key as a read-only deploy key in GitHub.

### 5.4 Install dependencies and build

```bash
cd /opt/portfolio/prod
sudo -u portfolio pnpm install --frozen-lockfile
sudo -u portfolio pnpm build
```

`--frozen-lockfile` ensures the install matches `pnpm-lock.yaml` exactly — required for reproducible deploys.

### 5.5 Create the `.env` files

```bash
sudo -u portfolio nano /opt/portfolio/prod/.env
# paste real production secrets
sudo chmod 600 /opt/portfolio/prod/.env
```

Repeat for `/opt/portfolio/test/.env`. **Verify the mode:**

```bash
ls -la /opt/portfolio/prod/.env
# should show: -rw------- 1 portfolio portfolio
```

> ⚠️ Never commit `.env` files. Keep a copy in a password manager (1Password, Bitwarden).

### 5.6 Smoke test manually

Before involving PM2:

```bash
cd /opt/portfolio/prod
sudo -u portfolio node apps/api/dist/main.js
```

Watch for `Nest application successfully started` and visit `http://YOUR_LINODE_IP:3001/api/health` from your laptop (open the firewall temporarily with `sudo ufw allow 3001` if needed — close it again after testing). Stop with `Ctrl+C`.

---

## 6. Managing the App with PM2

### 6.1 Ecosystem config

Create `/opt/portfolio/ecosystem.config.js`:

```js
module.exports = {
  apps: [
    {
      name: 'api-prod',
      cwd: '/opt/portfolio/prod',
      script: 'apps/api/dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '450M',
      node_args: '--max-old-space-size=400',
      env: { NODE_ENV: 'production', PORT: 3001 },
      error_file: '/var/log/portfolio/api-prod.error.log',
      out_file:   '/var/log/portfolio/api-prod.out.log',
      time: true,
    },
    {
      name: 'api-test',
      cwd: '/opt/portfolio/test',
      script: 'apps/api/dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '350M',
      node_args: '--max-old-space-size=300',
      env: { NODE_ENV: 'test', PORT: 3002 },
      error_file: '/var/log/portfolio/api-test.error.log',
      out_file:   '/var/log/portfolio/api-test.out.log',
      time: true,
    },
  ],
};
```

Key options:
- `max_memory_restart` — PM2 restarts the process if RSS exceeds this. Critical on a small box.
- `node_args: '--max-old-space-size=400'` — caps V8 heap so it fails predictably rather than thrashing swap.
- `time: true` — timestamps every log line.

### 6.2 Set up log directory

```bash
sudo mkdir -p /var/log/portfolio
sudo chown portfolio:portfolio /var/log/portfolio
```

### 6.3 Start under the `portfolio` user

```bash
sudo -u portfolio pm2 start /opt/portfolio/ecosystem.config.js
sudo -u portfolio pm2 status
sudo -u portfolio pm2 save        # persist the process list
```

### 6.4 Enable PM2 on boot

```bash
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u portfolio --hp /home/portfolio
```

PM2 will print a `systemctl enable …` command — run it. This makes both processes start automatically after a reboot.

### 6.5 Common PM2 commands

```bash
sudo -u portfolio pm2 list                # all processes
sudo -u portfolio pm2 logs api-prod       # tail logs
sudo -u portfolio pm2 logs --lines 200    # recent logs, all apps
sudo -u portfolio pm2 restart api-prod    # restart prod
sudo -u portfolio pm2 reload api-prod     # zero-downtime reload (if cluster mode)
sudo -u portfolio pm2 stop api-test       # stop test
sudo -u portfolio pm2 monit               # live resource view
sudo -u portfolio pm2 flush               # truncate logs
```

### 6.6 Log rotation

```bash
sudo -u portfolio pm2 install pm2-logrotate
sudo -u portfolio pm2 set pm2-logrotate:max_size 10M
sudo -u portfolio pm2 set pm2-logrotate:retain 7
sudo -u portfolio pm2 set pm2-logrotate:compress true
```

Keeps PM2's log files capped — without this, they grow forever and fill the disk.

---

## 7. Configuring Caddy

### 7.1 DNS

Before Caddy can get certs, your domains must point at the Linode's public IP. Create A records:

```
api.yourdomain.com       A    YOUR_LINODE_IP
api-test.yourdomain.com  A    YOUR_LINODE_IP
```

Wait a few minutes for propagation. Verify with `dig api.yourdomain.com +short`.

### 7.2 Production Caddyfile

Replace `/etc/caddy/Caddyfile`:

```bash
sudo nano /etc/caddy/Caddyfile
```

```caddy
# ---------- Global options ----------
{
    email you@example.com   # Let's Encrypt notifications
}

# ---------- Production API ----------
api.yourdomain.com {
    encode zstd gzip

    reverse_proxy localhost:3001 {
        health_uri      /api/health
        health_interval 30s
        health_timeout  5s
    }

    log {
        output file /var/log/caddy/api-prod.log {
            roll_size 10mb
            roll_keep 5
        }
        format json
    }

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options    "nosniff"
        Referrer-Policy           "strict-origin-when-cross-origin"
        -Server
    }
}

# ---------- Test API (basic auth gated) ----------
api-test.yourdomain.com {
    basic_auth {
        # generate with: caddy hash-password
        dev $2a$14$REPLACE_WITH_HASH
    }

    reverse_proxy localhost:3002
    log {
        output file /var/log/caddy/api-test.log
    }
}
```

### 7.3 Set up log directory

```bash
sudo mkdir -p /var/log/caddy
sudo chown caddy:caddy /var/log/caddy
```

### 7.4 Validate and reload

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy
```

Caddy automatically provisions TLS certs on first request. Visit `https://api.yourdomain.com/api/health` — you should see a valid certificate and a successful response.

### 7.5 What Caddy does for you, automatically

- Obtains Let's Encrypt certificates for each domain on first request.
- Renews them ~30 days before expiry.
- Redirects HTTP → HTTPS.
- Serves modern TLS (1.2+ only by default).
- Compresses responses (`encode zstd gzip`).

### 7.6 Configure the API to trust the proxy chain (X-Forwarded-For)

Express ignores `X-Forwarded-For` until you tell it how many proxy hops to trust. The API reads this from the `TRUST_PROXY_HOPS` env var. Without it, `req.ip` falls back to whatever the immediate socket peer is — for our deployment, that's Caddy on `localhost`, so every audit field (e.g. acknowledgement IP) would read `127.0.0.1`.

#### For the MVP topology (Cloudflare → Caddy → Node): two hops

```bash
# in /opt/portfolio/prod/.env and /opt/portfolio/test/.env
TRUST_PROXY_HOPS=2
```

Chain breakdown:
- Cloudflare receives the request from the real client (e.g. `1.2.3.4`), strips any client-supplied `X-Forwarded-For`, and forwards to Caddy with `X-Forwarded-For: 1.2.3.4` (plus `CF-Connecting-IP: 1.2.3.4`).
- Caddy appends its upstream peer (Cloudflare's egress IP) before forwarding to Node.
- Node sees `X-Forwarded-For: 1.2.3.4, <cf-egress-ip>`. With `TRUST_PROXY_HOPS=2`, Express walks back 2 entries and resolves `req.ip = 1.2.3.4`. ✓

If you ever simplify to **Caddy → Node** without Cloudflare, change to `1`. Without a CDN, `2` would over-trust and let a client spoof their IP by injecting `X-Forwarded-For`.

#### Security: firewall the origin to Cloudflare IPs only

`TRUST_PROXY_HOPS=2` is only safe if the **only** way to reach Caddy is through Cloudflare. If Caddy is publicly reachable directly (e.g. someone hitting the Linode's IP on 443 bypassing Cloudflare), they can forge `X-Forwarded-For: 1.1.1.1, fake-cloudflare` and Node will trust the leftmost value as the client IP — corrupting audit data.

Lock the origin down by allowing 443/tcp only from Cloudflare's published IP ranges:

```bash
# Fetch current Cloudflare ranges
curl -fsSL https://www.cloudflare.com/ips-v4 -o /tmp/cf-v4
curl -fsSL https://www.cloudflare.com/ips-v6 -o /tmp/cf-v6

# Remove the default "allow 443 from anywhere" rule, then allow only CF
sudo ufw delete allow 443
while read -r cidr; do sudo ufw allow from "$cidr" to any port 443 proto tcp; done < /tmp/cf-v4
while read -r cidr; do sudo ufw allow from "$cidr" to any port 443 proto tcp; done < /tmp/cf-v6
sudo ufw reload
```

Cloudflare's IP ranges change infrequently but do update — set a quarterly reminder, or automate with a small cron job that re-runs the snippet above.

---

## 8. Permissions and Ownership (Reference)

| Item | Owner:Group | Mode | Why |
|------|-------------|------|-----|
| `/opt/portfolio/prod` | `portfolio:portfolio` | `750` | App can read/write, others can't enter |
| `/opt/portfolio/prod/.env` | `portfolio:portfolio` | `600` | Secrets readable only by app user |
| `/opt/portfolio/prod/node_modules` | `portfolio:portfolio` | `755` | Inherited from install |
| `/var/log/portfolio/` | `portfolio:portfolio` | `750` | PM2 writes here |
| `/etc/caddy/Caddyfile` | `root:root` | `644` | Anyone can read, only root writes |
| `/var/log/caddy/` | `caddy:caddy` | `750` | Caddy writes here |
| `~mithun/.ssh/authorized_keys` | `mithun:mithun` | `600` | SSH refuses to use weaker modes |

**Rules of thumb:**

- Files with secrets → `600`. No group, no world.
- Directories containing secrets → `700` or `750`. The owner needs `x` to enter.
- Public config (Caddyfile, systemd units) → `644`.
- Never use `chmod 777` — if you need it, you have the wrong owner.
- Don't run `chown -R` from `/` or your home directory — easy way to break sudo.

---

## 9. Deployment Workflow

### 9.1 Deploy script

Save as `/opt/portfolio/deploy.sh`:

```bash
#!/usr/bin/env bash
# Usage: ./deploy.sh prod    or    ./deploy.sh test
set -euo pipefail

ENV="${1:?Usage: $0 <prod|test>}"
APP_DIR="/opt/portfolio/${ENV}"
PM2_NAME="api-${ENV}"

cd "$APP_DIR"

echo "→ Fetching latest code"
sudo -u portfolio git fetch --all --prune
sudo -u portfolio git reset --hard "origin/$(git rev-parse --abbrev-ref HEAD)"

echo "→ Installing dependencies"
sudo -u portfolio pnpm install --frozen-lockfile

echo "→ Building"
sudo -u portfolio pnpm build

echo "→ Restarting PM2 process: $PM2_NAME"
sudo -u portfolio pm2 restart "$PM2_NAME" --update-env
sudo -u portfolio pm2 save

echo "✓ Deployed $ENV"
```

```bash
sudo chmod +x /opt/portfolio/deploy.sh
```

Run with:

```bash
/opt/portfolio/deploy.sh prod
/opt/portfolio/deploy.sh test
```

### 9.2 Reloading Caddy

Only needed when **`Caddyfile` itself changes** (new domain, header tweak):

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

`reload` is zero-downtime; `restart` would briefly drop connections.

### 9.3 Rollback strategy

Two layers:

**Code rollback** (fast — git):

```bash
cd /opt/portfolio/prod
sudo -u portfolio git log --oneline -10            # find the good commit
sudo -u portfolio git reset --hard <good-sha>
sudo -u portfolio pnpm install --frozen-lockfile
sudo -u portfolio pnpm build
sudo -u portfolio pm2 restart api-prod
```

**Full-server rollback** (slow — Linode snapshot):
Restore from the most recent Linode snapshot via the Linode dashboard. ~10 minutes. Use only when code rollback can't fix it (e.g. corrupted OS state).

---

## 10. Monitoring and Maintenance

### 10.1 Resource checks

```bash
htop                       # interactive CPU/memory
free -h                    # memory + swap usage
df -h                      # disk usage
ncdu /                     # what's eating the disk
sudo -u portfolio pm2 monit   # PM2's view
```

Watch for:
- **Memory consistently >85%** — bump to a Linode 2GB.
- **Swap usage >500MB** sustained — same.
- **Disk >80%** — clean logs or expand.

### 10.2 Logs

```bash
sudo -u portfolio pm2 logs api-prod          # app logs
sudo journalctl -u caddy -n 200 --no-pager   # Caddy systemd logs
sudo tail -f /var/log/caddy/api-prod.log     # Caddy access log
sudo journalctl --since "1 hour ago"         # everything
```

### 10.3 Firewall and Fail2Ban

```bash
sudo ufw status verbose
sudo fail2ban-client status sshd
```

### 10.4 Safe updates

Weekly or before deploys:

```bash
sudo apt update
sudo apt upgrade -y
# If a kernel was updated:
cat /var/run/reboot-required 2>/dev/null && echo "Reboot needed"
```

Schedule reboots for low-traffic times. PM2 will bring your apps back automatically thanks to `pm2 startup`.

### 10.5 Backups

- **Linode Backups service** ($2/mo): enable in the Linode dashboard. Daily/weekly/biweekly automatic snapshots.
- **MongoDB Atlas**: enable continuous backup on your cluster.
- **Secrets** (`.env` files): stored in a password manager, never only on the box.

Test restore at least once. An untested backup is not a backup.

### 10.6 Log rotation

PM2's `pm2-logrotate` (set up in §6.6) handles app logs. Caddy's `roll_size` in the Caddyfile handles its own. System logs are handled by `logrotate` out of the box.

---

## 11. Troubleshooting

### SSH

**`Permission denied (publickey)`**
- Verify file modes: `~/.ssh` is `700`, `~/.ssh/authorized_keys` is `600`.
- Verify ownership: both owned by your user, not root.
- Watch the live log: `sudo journalctl -u ssh -f` and try again.

**Locked out of SSH**
- Use the Linode dashboard's **Lish console** — a browser-based serial console that bypasses SSH entirely. Fix the config there.

### App

**App won't start**

```bash
sudo -u portfolio pm2 logs api-prod --lines 100
```

Common causes:
- Missing `.env` variable — NestJS config validation will print exactly which key.
- `Cannot find module` — `pnpm install` didn't run, or built before `packages/shared` compiled.
- Mongo connection refused — check `MONGODB_URI` and Atlas IP allowlist (add the Linode IP).

**Port already in use**

```bash
sudo lsof -i :3001     # see what's using the port
sudo -u portfolio pm2 delete api-prod
sudo -u portfolio pm2 start /opt/portfolio/ecosystem.config.js
```

### Caddy

**`502 Bad Gateway`** — upstream (your Node app) isn't responding.
- Is the app running? `sudo -u portfolio pm2 status`
- Is it bound to the right port? `sudo lsof -i :3001`
- Is it bound to `0.0.0.0` or `127.0.0.1`? Either works for `localhost:3001` proxying.

**Cert won't issue**
- DNS not pointing at the box yet: `dig api.yourdomain.com +short`
- Port 80 blocked: `sudo ufw status`
- Look at: `sudo journalctl -u caddy -n 200 | grep -i acme`

**Cert hit Let's Encrypt rate limit** (5 failed orders/hour)
- Wait an hour. Or use the staging issuer while debugging: add `acme_ca https://acme-staging-v02.api.letsencrypt.org/directory` to the global options block.

### Permissions

**`EACCES: permission denied`** — wrong owner on a file the app needs to read. Fix:

```bash
sudo chown -R portfolio:portfolio /opt/portfolio/prod
sudo chmod 600 /opt/portfolio/prod/.env
```

### PM2

**Processes don't restart after reboot**
- Re-run `sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u portfolio --hp /home/portfolio` and run the command it prints.
- Verify: `systemctl status pm2-portfolio`.

**`pm2 save` was forgotten** — the process list isn't persisted. Start the apps, then `sudo -u portfolio pm2 save`.

---

## 12. Production Readiness Checklist

### Security
- [ ] Personal sudo user created; root SSH disabled.
- [ ] SSH password authentication disabled; key-only login confirmed.
- [ ] UFW enabled, only 22/80/443 allowed.
- [ ] Fail2Ban installed and active on SSH.
- [ ] Unattended-upgrades enabled.
- [ ] App runs as `portfolio` service user, never root.
- [ ] `.env` files are `chmod 600`, owned by `portfolio`.
- [ ] No world-writable files in `/opt/portfolio/`.

### Reliability
- [ ] Swap file (2GB) configured and active.
- [ ] PM2 `max_memory_restart` set on every app.
- [ ] PM2 `--max-old-space-size` set on every app.
- [ ] `pm2 save` run and `pm2 startup` enabled — confirmed survives reboot.
- [ ] App listens on `127.0.0.1` (or `0.0.0.0` behind the firewall) — not directly exposed.

### HTTPS
- [ ] DNS A records resolve to the Linode IP.
- [ ] Caddy issued certificates for all domains.
- [ ] HTTP redirects to HTTPS (automatic with Caddy).
- [ ] Strict-Transport-Security header present.
- [ ] Test domain has basic auth (or is otherwise gated).

### Observability
- [ ] PM2 logrotate configured (10MB × 7 files).
- [ ] Caddy access logs writing to `/var/log/caddy/`.
- [ ] You know the commands to tail logs for each component.
- [ ] Sentry (or equivalent) wired up in the app.

### Backups & recovery
- [ ] Linode Backups service enabled ($2/mo).
- [ ] MongoDB Atlas continuous backup enabled.
- [ ] `.env` files saved in a password manager.
- [ ] Bootstrap / recovery runbook documented (`infra/README.md`).
- [ ] Snapshot restore tested at least once.

### Operations
- [ ] Deploy script tested for prod and test.
- [ ] Rollback procedure tested.
- [ ] Health endpoint (`/api/health`) returns 200.
- [ ] Caddy health checks pointed at the health endpoint.
- [ ] You can answer: "What do I do at 2am when the site is down?"

---

If you can tick every box, you're production-ready for an MVP at <1000 DAU. The biggest single upgrade beyond this is moving to a 2GB Linode — memory is the only resource on a Nanode that will bite you under load.
