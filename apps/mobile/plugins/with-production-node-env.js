const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Guarantees Release (Archive) builds bundle with the PRODUCTION EXPO_PUBLIC_* values.
//
// Problem: in the Xcode bundle phase, `expo export:embed` loads `.env.production` but a
// stale/dev value of EXPO_PUBLIC_API_URL can already be present in the environment, and
// @expo/env NEVER overrides an already-set variable - so `.env` (dev IP, 192.168.x) gets
// baked into the release bundle, causing the iOS local-network prompt + "network request
// failed" against an unreachable LAN address.
//
// Fix: BEFORE bundling, source `.env.production` with `set -a` so its values become real
// exported env vars. A shell assignment overrides any pre-set value, and @expo/env then
// keeps it - so the production URL always wins, immune to precedence/pre-set quirks.
//
// Appended to the (gitignored, prebuild-generated) `ios/.xcode.env`, which the
// "Bundle React Native code and images" phase sources before bundling. Debug builds set
// SKIP_BUNDLING=1, so the CONFIGURATION guard limits this to Release.

const MARKER_BEGIN = '# >>> with-production-node-env BEGIN';
const MARKER_END = '# <<< with-production-node-env END';

// Keep PROD_API_URL in sync with apps/mobile/.env.production. Hardcoded (rather than
// sourcing .env.production) because the build-phase working directory made relative
// paths unreliable; a literal export is immune to that.
const PROD_API_URL = 'https://api.logdit.app/api';

const SNIPPET = [
  MARKER_BEGIN,
  'if [[ "$CONFIGURATION" != *Debug* ]]; then',
  `  export EXPO_PUBLIC_API_URL=${PROD_API_URL}`,
  'fi',
  MARKER_END,
  '',
].join('\n');

module.exports = (config) =>
  withDangerousMod(config, [
    'ios',
    (cfg) => {
      const envFile = path.join(cfg.modRequest.platformProjectRoot, '.xcode.env');
      const existing = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
      // Idempotent: strip any prior block, then append a fresh one.
      const stripped = existing.replace(
        new RegExp(`${MARKER_BEGIN}[\\s\\S]*?${MARKER_END}\\n?`, 'g'),
        ''
      );
      const next = `${stripped.replace(/\n*$/, '\n')}\n${SNIPPET}`;
      fs.writeFileSync(envFile, next);
      return cfg;
    },
  ]);
