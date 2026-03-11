# UI

- When app is loading, and profile is being fetched, if server is down, app will show login screen. We need to instead show a screen with error message and retry button.

# LLM

- Add support for Clinical Experience Groups like: Older adults, Urgent and unscheduled care, etc

- In capabilities reasoning, should the text be "I" or "The trainee" ?

- In LLM MCQ responses, remove the concatenated texts. Use only question to render the MCQ options.

# Chat screen

- When any message is sent, there seems to be a delay before the message is displayed. What may be causing this ?

- When messages are being processed, we do not show any analysis feedback to the user. The analysis button should be shown as busy.

- Do not include reasoning in the select questions. Include a small "see why" button / icon / link, which when clicked, shows the reasoning in a popover.

- Implement a claude like "Thinking..." animation when the AI bot is thinking.

- When AI sends suggestions like artefact type, capabilities, etc, there should be an option where users can select something completely different.

- When we click on an artefact the first time, and the loader is showing, the text input is enabled. We need to hide this when the conversation is being loaded for the first time.

- [Fixed] In multi select, after user confirms, i don't see anything happening for some time, and then i suddenly see new messages, spinner, etc.

- [Fixed] When user submits an answer using single select / multi select, the analysis button should be shown as busy, as the chat is currently being analysed.

- [Fixed] I just saw a glitch where i saw two analysis buttons loading at the same time.

- [Fixed] When AI bot asks for a selection, we need to hide the continue Analysis button.

- [Fixed] Single select should have a confirm button.

- [Fixed] When the AI bot is analysing in the backend, the analyse button should always show as busy. At the moment, after Analyse is clicked, the button shows as busy when the request is in progress. However, if the state of the chat is Analysing, we need to show busy state in the button.

# Performance Improvements

- Since the MVP will be a single nodejs server, can we use any inmemory cache to speed up the responses ? The client will be doing a lot of Polling when the chat is active.
