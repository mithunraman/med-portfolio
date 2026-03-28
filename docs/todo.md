# Login screen

- WHen API error is returned during login, the user is signed out. Fix this later.

# Chat

- Word counting on the UI should happen only for successful messages
- When message processing fails, we need to either allow retry of the message.
- Sometimes start analysis gets stuck in processing mode. If i restart the app, and open the same chat, i can see the start analysis button again.
- Allow minimum word count for analysis to come from the backend.

# LLM

- [Important] When user clicks initial analysis, and there is little / no case information, we need to instruct the user to enter case related information into the conversation.

# Backend

- Graph Service
  - If a node fails, how can we retry the node?
- Transaction Service
  - When withTransaction is called, lets design a good way to throw errors back to the caller
