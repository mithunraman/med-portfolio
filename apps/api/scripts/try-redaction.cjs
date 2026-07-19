/* eslint-disable */
/**
 * Manual redaction harness — runs the REAL compiled services (Azure PHI →
 * offline UK backstop) over example inputs against your live Azure resource.
 *
 * Run from apps/api:  node scripts/try-redaction.cjs
 * Requires: a current build (`pnpm build`) and the AZURE_* vars in .env.
 */
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { AzureLanguageService } = require('../dist/language/azure-language.service.js');
const { LocalPiiService } = require('../dist/processing/redaction/local-pii.service.js');

const config = {
  get: (key) =>
    ({
      'app.azureLanguage.endpoint': process.env.AZURE_LANGUAGE_ENDPOINT,
      'app.azureLanguage.tenantId': process.env.AZURE_TENANT_ID,
      'app.azureLanguage.clientId': process.env.AZURE_CLIENT_ID,
      'app.azureLanguage.clientSecret': process.env.AZURE_CLIENT_SECRET,
      // Defaults to 'keep-relative' inside the service when unset.
      'app.azureLanguage.datePolicy': process.env.REDACTION_DATE_POLICY,
    })[key],
};

const EXAMPLES = [
  // 1. Mixed: names + org + NHS number + postcode + phone
  "Discussed Mrs Patel's case with Dr Okafor at the Whitfield practice. Her NHS number is 943 476 5919 and she lives at SW1A 1AA. Contact her daughter on 07700 900123.",
  // 2. Clinical reflection with a patient name + email
  'I reviewed John Smith today, DOB 12/05/1980. Emailed the summary to gp.surgery@nhs.net. Lying and standing BP 140/90 then 120/70. Started tamsulosin 400mcg three weeks ago.',
  // 3. Structured UK identifiers the backstop is for
  'Bank details: sort code 12-34-56 account 87654321. NI number AB123456C.',
  // 4. Free-text names/places (Azure's core job — no structured IDs at all)
  'Handed over to Sister Amara Nwosu on the Beaumont ward; she escalated to the on-call registrar at St Thomas.',
  // 5. Clinical-only, NO PII — must pass through untouched
  'BP 140/90, HR 88, sats 96% on air, eGFR 59, prescribed amlodipine 5mg OD.',
  // 6. An invalid-checksum NHS number — should NOT be redacted by the backstop
  'The reference 943 476 5918 is not a valid NHS number.',
];

async function main() {
  const azure = new AzureLanguageService(config);
  const local = new LocalPiiService();

  // Optional: pass a file path to redact its whole contents as a single example.
  //   node scripts/try-redaction.cjs scripts/sample-large-entry.txt
  const fileArg = process.argv[2];
  const examples = fileArg ? [fs.readFileSync(fileArg, 'utf8').trim()] : EXAMPLES;

  for (let i = 0; i < examples.length; i++) {
    const input = examples[i];
    console.log('\n' + '='.repeat(78));
    console.log(`EXAMPLE ${i + 1}`);
    console.log('IN :  ' + input);
    try {
      const phi = await azure.redactPhi(input); // Layer 1: Azure PHI (semantic)
      const out = await local.redactLocal(phi.redactedText); // Layer 2: offline UK backstop
      console.log('AZURE:' + phi.redactedText);
      console.log('FINAL:' + out.redactedText);
      console.log(
        '      PHI: [' +
          phi.entities.map((e) => e.category).join(', ') +
          ']   backstop: [' +
          out.entities.map((e) => e.type).join(', ') +
          ']'
      );
    } catch (err) {
      console.log('ERROR: ' + (err && err.message ? err.message : err));
    }
  }
  console.log('\n' + '='.repeat(78));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
