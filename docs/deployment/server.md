# Server Runbook — Deploy, Restart, Config

Day-to-day operations cheat sheet for the production API box.
For first-time provisioning, Caddy/Cloudflare setup, firewall, and SSH hardening, see the
full guide: [`apps/api/scripts/deploy.md`](../../apps/api/scripts/deploy.md).

| | |
|---|---|
| Host | `193.123.183.36` (OCI `uk-london-1`, Ubuntu 24.04) |
| SSH alias | `portfolio-api` (user `ubuntu`) |
| Service | `portfolio-api` (systemd) |
| App dir | `/srv/portfolio/app` (owned by `portfolio`) |
| Config | `/etc/portfolio-api.env` (root:root `600`) |
| Public URL | `https://api.logdit.app` |
| Origin port | `3001` (behind Caddy) |

---

## 1. Connect

```bash
ssh portfolio-api                     # alias in ~/.ssh/config
ssh ubuntu@193.123.183.36             # equivalent, without the alias
```

Auth is key-only via the 1Password SSH agent — expect a Touch ID prompt. Root login is
disabled and there is no password fallback.

**`Permission denied (publickey)` with NO Touch ID prompt** means 1Password isn't serving
the key (usually the key was moved to a vault not listed in
`~/.config/1password/ssh/agent.toml`). Verify what the agent is offering:

```bash
SSH_AUTH_SOCK="$HOME/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock" ssh-add -l
```

---

## 2. Deploy a new version

### The one-command way

```bash
ssh portfolio-api
deploy-portfolio
```

Runs: `git pull --ff-only` → `pnpm install --frozen-lockfile --filter=api...` →
build `@acme/shared` then `api` → `systemctl restart portfolio-api` → verify active.
Prints the last 15 log lines on success, 40 on failure, and exits non-zero if the
service didn't come up.

There is no separate stop step — `restart` handles it, and the build runs *before* the
restart, so downtime is just the restart itself.

### The manual way (when the script fails partway)

```bash
# 1. pull — MUST run as the `portfolio` user (it owns the read-only deploy key)
sudo -u portfolio git -C /srv/portfolio/app pull --ff-only

# 2. install deps (safe to always run)
sudo -u portfolio bash -c 'cd /srv/portfolio/app && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile --filter=api...'

# 3. build — shared BEFORE api
sudo -u portfolio bash -c 'cd /srv/portfolio/app && pnpm --filter=@acme/shared run build && pnpm --filter=api run build'

# 4. restart
sudo systemctl restart portfolio-api

# 5. verify
systemctl status portfolio-api --no-pager
curl -i http://localhost:3001/api/health
```

Running the `git pull` as `ubuntu` instead of `portfolio` fails auth — the deploy key
lives at `/srv/portfolio/.ssh/github_deploy` and is only readable by `portfolio`.

### Check what's currently deployed

```bash
sudo -u portfolio git -C /srv/portfolio/app log --oneline -5
sudo -u portfolio git -C /srv/portfolio/app status --short
```

### Install or update the deploy script

The source of truth is
[`apps/api/scripts/deploy-portfolio.sh`](../../apps/api/scripts/deploy-portfolio.sh) in
this repo. `/usr/local/bin/deploy-portfolio` is a copy — installing is a plain file copy
from the checkout that's already on the box:

```bash
sudo install -m 755 -o root -g root \
  /srv/portfolio/app/apps/api/scripts/deploy-portfolio.sh \
  /usr/local/bin/deploy-portfolio

deploy-portfolio --help 2>/dev/null; which deploy-portfolio   # sanity check
```

Edit the repo file and redeploy to change it — a change made directly in
`/usr/local/bin` is untracked and will be silently overwritten by the next `install`.

On a rebuilt box, before the repo exists, paste the script in directly: the full source
is also embedded in [§7 of the provisioning guide](../../apps/api/scripts/deploy.md).

---

## 3. Service control

```bash
sudo systemctl start    portfolio-api
sudo systemctl stop     portfolio-api
sudo systemctl restart  portfolio-api
sudo systemctl status   portfolio-api --no-pager
systemctl is-active     portfolio-api
systemctl is-enabled    portfolio-api        # should be `enabled` (survives reboot)
```

After editing the unit file at `/etc/systemd/system/portfolio-api.service`:

```bash
sudo systemctl daemon-reload && sudo systemctl restart portfolio-api
```

Editing `/etc/portfolio-api.env` needs only a `restart` — no `daemon-reload`.

---

## 4. Update `/etc/portfolio-api.env`

Config is **not** in the repo. It lives in one root-owned file that systemd loads as the
service's environment. The app Zod-validates every variable at boot, so a bad value
aborts startup with a named error rather than running degraded.

### Replace the whole file (paste-friendly)

```bash
# 1. back up first — this is the live secrets file
sudo cp -a /etc/portfolio-api.env /etc/portfolio-api.env.bak.$(date +%F-%H%M)

# 2. type this line, press Enter, paste the entire file, then type EOF on its own line
sudo tee /etc/portfolio-api.env > /dev/null <<'EOF'
NODE_ENV=production
PORT=3001
...paste everything...
EOF

# 3. re-assert ownership + permissions
sudo chown root:root /etc/portfolio-api.env
sudo chmod 600 /etc/portfolio-api.env

# 4. apply
sudo systemctl restart portfolio-api
```

**The quotes around `'EOF'` are load-bearing.** They stop the shell expanding `$`,
backticks and `\` inside your secrets — without them a JWT secret or API key containing
`$` is silently mangled into an empty string, and the failure shows up later as a
confusing auth error.

### Edit in place

```bash
sudo nano -w /etc/portfolio-api.env
sudo systemctl restart portfolio-api
```

`-w` disables hard-wrapping. Without it nano breaks long values (`MONGODB_URI`, the OTEL
`Authorization` header) across lines and systemd then rejects them.

### Inspect without printing secrets

```bash
sudo grep -oE '^[A-Z0-9_]+=' /etc/portfolio-api.env | sort   # key names only
sudo wc -l /etc/portfolio-api.env                            # line count sanity check
```

The `0-9` in that character class matters — omit it and every `S3_*` key silently
disappears from the listing.

### Restore a backup

```bash
ls -la /etc/portfolio-api.env.bak.*
sudo cp -a /etc/portfolio-api.env.bak.<TIMESTAMP> /etc/portfolio-api.env
sudo systemctl restart portfolio-api
```

### EnvironmentFile format rules (systemd, not shell)

- `KEY=value` — no spaces around `=`, one per line.
- Only the *first* `=` splits key from value, so `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic%20...` is fine.
- Keep the `%20` in the OTEL header (URL-encoded space).
- **Omit** optional vars you don't use. A blank value is not the same as absent — empty
  strings fail Zod validation.
- No `$VAR` interpolation, no command substitution. Values are literal.

### Which variables prod needs

The authoritative list is [`apps/api/.env.example`](../../apps/api/.env.example) — it
carries inline comments explaining each group and tracks the Zod schema in
[`apps/api/src/config/app.config.ts`](../../apps/api/src/config/app.config.ts). Prod
differences from that file:

```bash
NODE_ENV=production
PORT=3001
TRUST_PROXY_HOPS=2      # Cloudflare -> Caddy -> app
S3_REGION=uk-london-1   # must be the real region, NOT "auto" (OCI signs with it)
MONGODB_URI=mongodb+srv://USER:PW@CLUSTER.mongodb.net/logdit?retryWrites=true&w=majority&appName=logdit-prod
ALLOWED_ORIGINS=https://app.logdit.app
```

> ⚠️ **LLM credentials are per-pool and indexed.** There is no bare `OPENAI_API_KEY` —
> that variable does not exist in the config schema. Every provider uses
> `<PREFIX>_API_KEY_<i>` / `<PREFIX>_BASE_URL_<i>` (i = 1..8), with prefixes `OPENAI`,
> `OPENROUTER`, `AZURE_FOUNDRY_INTERACTIVE`, `AZURE_FOUNDRY_ANALYSIS`
> ([`llm/llm-pools.ts`](../../apps/api/src/llm/llm-pools.ts)). `LLM_VARIANT=A` therefore
> needs `OPENAI_API_KEY_1` **and** `OPENAI_BASE_URL_1`. Startup fails for any pool the
> active variant uses that has no endpoints, so an env file still carrying the old flat
> key will not boot.

> The `LLM_RPM_*` caps *do* have defaults (60 / 35 / 18) and boot silently at those
> values if omitted. Set them explicitly — inheriting 35 on a smaller Azure resource
> produces sustained 429s with nothing at boot to warn you.

> **Database name vs cluster name.** The database is the path segment after the host
> (`/logdit`); `logdit-prod` is the *cluster*, and `appName=logdit-prod` is only a label
> Atlas shows in metrics. Drop the path segment and the driver silently falls back to a
> database called `test` — the app boots fine and looks like all data vanished.

---

## 5. Logs

App logs are Pino JSON → stdout → journald. **Nothing is written to log files.**

```bash
journalctl -u portfolio-api -f                     # live tail
journalctl -u portfolio-api -n 100 --no-pager      # last 100 lines
journalctl -u portfolio-api --since "1 hour ago"
journalctl -u portfolio-api -p err                 # errors only
journalctl -u portfolio-api -o cat | jq            # raw JSON -> pretty
```

Watch a deploy live — tail in one terminal, deploy in another:

```bash
journalctl -u portfolio-api -f      # terminal 1
deploy-portfolio                    # terminal 2
```

Edge/proxy logs are separate. A Cloudflare 502/523 with a healthy app means the request
never reached NestJS:

```bash
journalctl -u caddy -f
```

If the service is crash-looping, `-n 40` may only show the most recent failed boot — use
`--since` to see the whole loop:

```bash
journalctl -u portfolio-api --since "5 min ago" --no-pager
```

Errors also go to Sentry and traces/metrics to Grafana Cloud. Logs are **not** shipped
remotely — journald on the box is the only copy.

---

## 6. Health checks

```bash
curl -i http://localhost:3001/api/health      # origin, bypasses Caddy + Cloudflare
curl -i https://api.logdit.app/api/health     # full public path
```

Localhost OK + public failing isolates the fault to Caddy, the firewall, or Cloudflare.
Both failing points at the app, Mongo, or S3.

---

## 7. Rollback

No image tags — rollback means checking out the previous commit and rebuilding:

```bash
sudo -u portfolio git -C /srv/portfolio/app log --oneline -10
sudo -u portfolio git -C /srv/portfolio/app checkout <GOOD_SHA>
sudo -u portfolio bash -c 'cd /srv/portfolio/app && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile --filter=api...'
sudo -u portfolio bash -c 'cd /srv/portfolio/app && pnpm --filter=@acme/shared run build && pnpm --filter=api run build'
sudo systemctl restart portfolio-api
```

This leaves the repo in detached HEAD. To return to the branch afterwards:

```bash
sudo -u portfolio git -C /srv/portfolio/app checkout main
```

`deploy-portfolio` uses `git pull --ff-only`, which **fails** while in detached HEAD — so
a forgotten rollback surfaces as a confusing pull error on the next deploy rather than
silently deploying the wrong thing.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Service won't start after env edit | Zod rejected a variable | `journalctl -u portfolio-api -n 40` — the error names the variable |
| Startup fails on an LLM pool | Flat `OPENAI_API_KEY` instead of indexed `_1` pair | Add `<PREFIX>_API_KEY_1` + `<PREFIX>_BASE_URL_1` |
| App up, DB looks empty | URI missing the `/logdit` path segment → fell back to `test` | Add the database name, restart |
| `503`, `storage: down`, `UnknownError` | `S3_REGION=auto` (OCI signs with the real region) | `S3_REGION=uk-london-1`, restart |
| `503`, `storage: down`, `SignatureDoesNotMatch` | Wrong S3 secret (shown once, easy to mis-copy) | Regenerate the OCI Customer Secret Key |
| Cloudflare **523** origin unreachable | Host firewall blocking 443 | `sudo ufw status`; see §9.5 of the full guide |
| `git pull` permission denied | Ran as `ubuntu`, not `portfolio` | Prefix with `sudo -u portfolio` |
| `pnpm install` fails on frozen lockfile | Lockfile not committed with the code change | Commit `pnpm-lock.yaml`, redeploy |

---

## 9. Quick reference

```bash
ssh portfolio-api                                   # connect
deploy-portfolio                                    # deploy
sudo systemctl restart portfolio-api                # restart
journalctl -u portfolio-api -f                      # logs
curl -i http://localhost:3001/api/health            # health
sudo nano -w /etc/portfolio-api.env                 # config
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
