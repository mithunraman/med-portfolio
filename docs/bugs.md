# UI

- When app is loading, and profile is being fetched, if server is down, app will show login screen. We need to instead show a screen with error message and retry button.

# Chat screen

- When messages are being processed, we do not show any analysis feedback to the user. The analysis button should be shown as busy.

- In multi select, after user confirms, i don't see anything happening for some time, and then i suddenly see new messages, spinner, etc.

- When user submits an answer using single select / multi select, the analysis button should be shown as busy, as the chat is currently being analysed.

- I just saw a glitch where i saw two analysis buttons loading at the same time.

- [Fixed] When AI bot asks for a selection, we need to hide the continue Analysis button.

- [Fixed] Single select should have a confirm button.

- [Fixed] When the AI bot is analysing in the backend, the analyse button should always show as busy. At the moment, after Analyse is clicked, the button shows as busy when the request is in progress. However, if the state of the chat is Analysing, we need to show busy state in the button.
