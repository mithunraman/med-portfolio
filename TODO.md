- Support to skip questions. The AI is asking too many questions. Provide option to skip question.

[x] Reflection and learning section should be different in the entry
[x] When capabilities are presented, we are shown all the options. We need to show only X options and should have an option to show all options.
[x] Finalise entry -> rename to -> Save to portfolio
[x] When AI is asking examples, make sure to give more examples, people found it very useful.
[x] PDP goal checkbox in artefact screen is not clickable
[x] Reflect node creates duplicate content sometimes.
[x] Allow users to edit the message
[x] For Artefacts, allow users to add additional notes when saving.
[x] Onboard rest of GP portfolio artefacts.
[x] make sure when artefact is exported, notes are included

- Always store Audio chat to local async storage first, and then send from there. In case there is no internet, atleast it will be saved locally and can be send later.
- Audio not playing fully when messages are being fetchied in polling.
- Check and tests Delete message functionality.
- Make sure input messages are capped to prevent missuse.
- Integrate with Firebase.

IMPORTANT before release

[x] Check each service and do a /code-review for security issues.
[x] Check each repository for security issues using /code-review.
[x] Scan to check that all queries are using correct indexes, find unused indexes.

- Make sure all repo updates take in a user id to prevent cross access.
- Scan for dead code in the backend
- Check OCI S3 is not accessible outside, and is not getting exposed.
- set up email otp service
- Retest all the flows again
- Add credits to openai
- Update privacy and terms of use to include oracle provider
- update landing page
- review deployment plan with another agent
- database backups, read deploy.md
  [x] remove ununsed index from pdpgoal, after sortdate refactor
- investigate removing updating findOneWithArtefact to findOne in pdp-goals repo
- Increase max number of questions asked to 2\*number of sections.
- check how conversation idempotency key is being generated, and change if needed.
- Apply for Mongodb startup credits: https://www.mongodb.com/lp/solutions/startups/partners?utm_campaign=startup_partner&utm_source=atlasintrcm&utm_medium=referral
- Upgrade to Mongodb Flex.
- Remove em dash — before saving portfolio entry.
- Analyse section "Special category data (UK GDPR Article 9)" in privacy page.
- [BEFORE RELEASE] Stop persisting rawContent/cleanedContent after redaction (delete/blank them once content is set). Backs TWO policy claims: (1) Privacy §6 "briefly transits" wording, and (2) the "Our role"/controllership stance in Privacy §1 + Terms §4 that we do not retain patient identifiers. Today the unredacted raw + cleaned transcripts are retained for the life of the account, so both claims overstate until this ships. Must ship before launch (or reword §1/§4/§6 + §2). Note: edit-time redaction is regex-only (misses contextual names) — conversations.service.ts.
- Add an admin account suspend/disable mechanism. Terms §10 reserves the right to "suspend or terminate" a breaching user, but there is NO suspend/ban/disabled status on the user schema — today you can only delete an account (user-consent-shaped flow) or revoke sessions. Build a real suspend/disable before there are live users so §10 is enforceable without destroying data.
- [IP RISK] Confirm we are licensed/permitted to embed the royal-college curricula (RCGP GP, JRCPTB internal medicine, RCPsych) that live as capability data in apps/api/src/specialties/\*.capabilities.ts. Curriculum frameworks are copyright-protected even when publicly published; using them may need permission/a licence from each college. Terms §11 now disclaims ownership of them, but that does not grant the right to use them — verify before launch/scale.
- Update subprocessor list with Resend
