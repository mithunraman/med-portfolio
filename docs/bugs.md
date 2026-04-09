# UI

- When app is loading, and profile is being fetched, if server is down, app will show login screen. We need to instead show a screen with error message and retry button.

- Work on empty states for all screens.

- After initial user sign up, and user creating an entry
  1. The entry is not visible in the home page
  2. Refreshing home page does not help.

# LLM

- Add support for Clinical Experience Groups like: Older adults, Urgent and unscheduled care, etc

# Chat screen

- When any message is sent, there seems to be a delay before the message is displayed. What may be causing this ?

- When messages are being processed, we do not show any analysis feedback to the user. The analysis button should be shown as busy.

- Do not include reasoning in the select questions. Include a small "see why" button / icon / link, which when clicked, shows the reasoning in a popover.

- Implement a claude like "Thinking..." animation when the AI bot is thinking.

- When AI sends suggestions like artefact type, capabilities, etc, there should be an option where users can select something completely different.

- When we click on an artefact the first time, and the loader is showing, the text input is enabled. We need to hide this when the conversation is being loaded for the first time.

# Performance Improvements

- Since the MVP will be a single nodejs server, can we use any inmemory cache to speed up the responses ? The client will be doing a lot of Polling when the chat is active.
