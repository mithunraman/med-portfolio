- Support to skip questions. The AI is asking too many questions. Provide option to skip question.

[x] Reflection and learning section should be different in the entry
[x] When capabilities are presented, we are shown all the options. We need to show only X options and should have an option to show all options.
[x] Finalise entry -> rename to -> Save to portfolio
[x] When AI is asking examples, make sure to give more examples, people found it very useful.
[x] PDP goal checkbox in artefact screen is not clickable
[x] Reflect node creates duplicate content sometimes.
[x] Allow users to edit the message

- Always store Audio chat to local async storage first, and then send from there. In case there is no internet, atleast it will be saved locally and can be send later.
- Audio not playing fully when messages are being fetchied in polling.
- For Artefacts, allow users to add additional notes when saving.
- Check and tests Delete message functionality.
- Make sure input messages are capped to prevent missuse.
- Onboard rest of GP portfolio artefacts.

IMPORTANT before release

- Check each service and do a /code-review for security issues.
- Check each repository for security issues using /code-review.
- Make sure all repo updates take in a user id to prevent cross access.
- Scan to check that all queries are using correct indexes, find unused indexes.
- Scan for dead code in the backend
