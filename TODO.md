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
- check how conversation idempotency key is being generated, and change if needed.
- Apply for Mongodb startup credits: https://www.mongodb.com/lp/solutions/startups/partners?utm_campaign=startup_partner&utm_source=atlasintrcm&utm_medium=referral
- Upgrade to Mongodb Flex.
- Remove em dash — before saving portfolio entry.
- Analyse section "Special category data (UK GDPR Article 9)" in privacy page.
- [BEFORE RELEASE] Stop persisting rawContent/cleanedContent after redaction (delete/blank them once content is set). Privacy policy §6 says the unredacted transcript only "briefly transits" processors — until this is built, that wording overstates (unredacted raw + cleaned transcripts are currently retained for the life of the account). Must ship before launch or reword §6 and §2.
