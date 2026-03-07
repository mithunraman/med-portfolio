# UI

- When app is loading, and profile is being fetched, if server is down, app will show login screen. We need to instead show a screen with error message and retry button.

- When AI bot asks for a selection, we need to hide the continue Analysis button.

- Single select should have a confirm button.

- When the AI bot is analysing in the backend, the analyse button should always show as busy. At the moment, after Analyse is clicked, the button shows as busy when the request is in progress. However, if the state of the chat is Analysing, we need to show busy state in the button.
