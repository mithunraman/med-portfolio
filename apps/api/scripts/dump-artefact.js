#!/usr/bin/env node
/* eslint-disable */
/**
 * Debug utility: dump the entire data graph for a single artefact.
 *
 * Given an artefact identifier, pulls the artefact and every record that hangs
 * off it and prints a readable summary (plus optional raw JSON). Useful for
 * debugging the analysis pipeline end-to-end — e.g. inspecting a run's
 * `reflectTrace` against the transcript that produced it. Strictly read-only.
 *
 * The identifier may be any of:
 *   - xid               the customer-visible 21-char id (default lookup)
 *   - _id               the internal Mongo ObjectId (24-hex)
 *   - artefactId        the composite "{userId}_{clientGeneratedId}" string
 *
 * Joins (field names differ across collections, so they are spelled out):
 *   conversations.artefact      = artefact._id
 *   messages.conversation       = conversation._id
 *   analysis_runs.artefactId    = artefact._id   (also OR'd on conversationId)
 *   pdp_goals.artefactId        = artefact._id
 *   version_history.entityId    = artefact._id   (entityType 'artefact')
 *   media._id                   ∈ messages[].media
 *   users._id                   = artefact.userId
 *
 * Usage:
 *   node scripts/dump-artefact.js <artefactId> [--full] [--out <file>] [--section <id>]
 *
 *   --full           also print the entire dump as JSON to stdout
 *   --out <file>     write the entire dump as JSON to <file>
 *   --section <id>   when summarising reflectTrace, expand this section's probes
 *
 * Reads MONGODB_URI from apps/api/.env.local then .env (same precedence as the app).
 */

const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

/* ------------------------------------------------------------------ */
/*  Env + args                                                         */
/* ------------------------------------------------------------------ */

function loadUri() {
  const apiRoot = path.resolve(__dirname, '..');
  for (const file of ['.env.local', '.env']) {
    const full = path.join(apiRoot, file);
    if (!fs.existsSync(full)) continue;
    const line = fs
      .readFileSync(full, 'utf8')
      .split('\n')
      .find((l) => l.trim().startsWith('MONGODB_URI='));
    if (line) return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  }
  throw new Error('MONGODB_URI not found in apps/api/.env.local or .env');
}

function parseArgs(argv) {
  const args = { id: null, full: false, out: null, section: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--full') args.full = true;
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--section') args.section = argv[++i];
    else if (!a.startsWith('--') && !args.id) args.id = a;
  }
  return args;
}

function dbNameFromUri(uri) {
  const m = uri.match(/\/([^/?]+)(\?|$)/);
  return (m && m[1]) || 'dev_portfolioplus';
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const SECRET_KEY = /password|secret|hash|token|salt|otp|jwt/i;

/** Deep-clone, masking obviously sensitive fields. Read-only on the input. */
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    if (value instanceof ObjectId) return value.toString();
    if (value instanceof Date) return value.toISOString();
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY.test(k) && typeof v === 'string' ? '<redacted>' : redact(v);
    }
    return out;
  }
  return value;
}

function truncate(str, n = 280) {
  if (str == null) return str;
  const s = String(str);
  return s.length > n ? s.slice(0, n) + ` …(+${s.length - n} chars)` : s;
}

async function resolveArtefact(db, id) {
  const artefacts = db.collection('artefacts');
  let doc = await artefacts.findOne({ xid: id });
  if (!doc && /^[a-f0-9]{24}$/i.test(id)) {
    doc = await artefacts.findOne({ _id: new ObjectId(id) });
  }
  if (!doc) doc = await artefacts.findOne({ artefactId: id });
  return doc;
}

/* ------------------------------------------------------------------ */
/*  Gather                                                             */
/* ------------------------------------------------------------------ */

async function gather(db, artefact) {
  const oid = artefact._id;

  const [user, conversation, pdpGoals, versionHistory] = await Promise.all([
    db.collection('users').findOne({ _id: artefact.userId }),
    db.collection('conversations').findOne({ artefact: oid }),
    db.collection('pdp_goals').find({ artefactId: oid }).toArray(),
    db.collection('version_history').find({ entityId: oid }).sort({ version: 1 }).toArray(),
  ]);

  const convOid = conversation ? conversation._id : null;

  const [messages, analysisRuns] = await Promise.all([
    convOid
      ? db.collection('messages').find({ conversation: convOid }).sort({ _id: 1 }).toArray()
      : [],
    db
      .collection('analysis_runs')
      .find({ $or: [{ artefactId: oid }, ...(convOid ? [{ conversationId: convOid }] : [])] })
      .sort({ runNumber: 1 })
      .toArray(),
  ]);

  const mediaIds = messages.map((m) => m.media).filter(Boolean);
  const media = mediaIds.length
    ? await db.collection('media').find({ _id: { $in: mediaIds } }).toArray()
    : [];

  return { artefact, user, conversation, messages, analysisRuns, pdpGoals, versionHistory, media };
}

/* ------------------------------------------------------------------ */
/*  Summary                                                            */
/* ------------------------------------------------------------------ */

function printSummary(dump, section) {
  const { artefact, user, conversation, messages, analysisRuns, pdpGoals, versionHistory, media } =
    dump;
  const L = (s = '') => console.log(s);

  L('================================================================');
  L(`ARTEFACT  xid=${artefact.xid}  _id=${artefact._id}`);
  L('================================================================');
  L(`  user            : ${user ? `${user.email || user.xid || user._id}` : '(missing)'}`);
  L(`  specialty/stage : ${artefact.specialty} / ${artefact.trainingStage || '—'}`);
  L(`  status          : ${artefact.status}   type=${artefact.artefactType ?? '—'}`);
  L(`  title           : ${artefact.title ?? '—'}`);
  L(`  draftStatus     : ${artefact.draftStatus ?? '—'}   readiness=${artefact.readinessScore ?? '—'}`);
  L(`  composedDocument: ${artefact.composedDocument?.length ?? 0} fields`);
  for (const f of artefact.composedDocument || []) {
    L(`     • [${f.sectionId}] ${truncate(f.text, 160)}`);
  }
  L(`  completeness    : complete=${artefact.completeness?.complete ?? '—'}  unmet=${
    artefact.completeness?.unmetSections?.length ?? 0
  }`);

  L('');
  L(`CONVERSATION : ${conversation ? `xid=${conversation.xid} status=${conversation.status}` : '(none)'}`);

  L('');
  L(`MESSAGES : ${messages.length}`);
  for (const m of messages) {
    const body = m.content || m.cleanedContent || m.rawContent || '';
    L(`  · role=${m.role} type=${m.messageType} status=${m.status}${m.media ? ' [media]' : ''}${
      m.question ? ' [question]' : ''
    }`);
    if (body) L(`      ${truncate(body, 200)}`);
  }

  L('');
  L(`ANALYSIS RUNS : ${analysisRuns.length}`);
  for (const r of analysisRuns) {
    L(`  RUN #${r.runNumber}  xid=${r.xid}  status=${r.status}  step=${r.currentStep ?? '—'}`);
    if (r.error) L(`     error: ${r.error.code} — ${r.error.message}`);
    const trace = r.reflectTrace || [];
    if (trace.length) L(`     reflectTrace: ${trace.length} sections`);
    for (const t of trace) {
      const v = t.verification ? `${t.verification.ok ? 'ok' : 'FAIL:' + t.verification.reason}` : 'n/a';
      L(`       [${t.sectionId}] source=${t.source} verify=${v}`);
      L(`          finalText: ${truncate(t.finalText, 200)}`);
      if (section && t.sectionId === section) {
        if (t.narrative) L(`          narrative: ${truncate(t.narrative, 300)}`);
        for (const p of t.probes || []) {
          L(`          probe[${p.probeId}] covered=${p.covered}: ${truncate(p.text, 200)}`);
        }
      }
    }

    const dedupe = r.dedupeTrace || [];
    if (dedupe.length) L(`     dedupeTrace: ${dedupe.length} sections`);
    for (const t of dedupe) {
      L(`       [${t.sectionId}] source=${t.source}`);
      if (t.source === 'merged' || (section && t.sectionId === section)) {
        L(`          before: ${truncate(t.before, 200)}`);
        L(`          after:  ${truncate(t.after, 200)}`);
      }
    }
  }

  L('');
  L(`PDP GOALS : ${pdpGoals.length}`);
  for (const g of pdpGoals) L(`  · ${truncate(g.goal, 120)} (${g.actions?.length ?? 0} actions)`);

  L('');
  L(`VERSION HISTORY : ${versionHistory.length} snapshots`);
  L(`MEDIA : ${media.length} attachments`);
  L('');
  L(`(use --section <id> to expand a section's reflect probes + dedupe before/after; --full or --out for raw JSON)`);
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.id) {
    console.error('Usage: node scripts/dump-artefact.js <artefactId> [--full] [--out <file>] [--section <id>]');
    process.exit(1);
  }

  const uri = loadUri();
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(dbNameFromUri(uri));
    const artefact = await resolveArtefact(db, args.id);
    if (!artefact) {
      console.error(`No artefact found for "${args.id}" (tried xid, _id, artefactId).`);
      process.exit(2);
    }

    const dump = await gather(db, artefact);
    printSummary(dump, args.section);

    const redacted = redact(dump);
    if (args.out) {
      fs.writeFileSync(args.out, JSON.stringify(redacted, null, 2));
      console.log(`\nFull JSON written to ${args.out}`);
    }
    if (args.full) {
      console.log('\n================ FULL JSON ================');
      console.log(JSON.stringify(redacted, null, 2));
    }
  } finally {
    await client.close();
  }
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
