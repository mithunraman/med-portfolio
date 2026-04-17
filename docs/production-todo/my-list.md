- For each repository, list them down. Check what queries are fired. Check what indexes are present. Add indexes where needed. Remove indexes if not needed.

- For each repository, write integration tests to validate the queries and operations.

- Write tests to check for AuthN issues.

- Write tests to check for AuthZ issues, like user A trying to access user B's data.

* [Done] Completed PDP goals in Entry page should have a better UI UX.

* [Done] After an artefact is created in the conversation, when user clicks view entry, the conversation screen should be removed and the artefact screen should be shown. When back is pressed, it should go back to the home screen.

* [Done] When a PDP goal is completed, and a reflection is added, and when user exports the artefact, the reflection should be included in the export. Currently it is not included.

* [Done] Rename the file name of the exported artefact. It should contain entry type and title of the artefact.

* Next to usage stats, show a why / explain button. When clicked, it should open a new screen explaining the usage stats, and how it is calculated. It should also explain why these stats exist.

* For each react native screen / component, look for improvements and best practices.

* [Done] When dashboard is loading, use skeleton instead of spinner.

* [Done] Cap the artefact title to a maximum of 500 characters when storing in the DB.
