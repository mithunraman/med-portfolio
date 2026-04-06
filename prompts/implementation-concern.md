Analyse if the following is a concern. Do not make any code changes yet.

Probable Concern:

Terminal classification interrupt returns questionType: 'single_select' with no options
File: portfolio-graph.service.ts:357 | Confidence: 0.8

When the classification interrupt has zero options (irrelevant content), the returned InterruptPayload still sets questionType: 'single_select' but the messageData contains no question field. Consumers that switch on questionType to render UI (e.g. the mobile app) may attempt to render a selection widget with no options, or fail to recognize this as a terminal/informational message. A distinct question type (e.g. 'info') or an explicit question: null would make the contract clearer for clients.
