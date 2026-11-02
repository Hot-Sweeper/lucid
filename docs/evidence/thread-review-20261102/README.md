# Thread-list review status

Completed worker runs with a saved report now show their next review step in the thread list instead of the green Done label. Submitted reports show Waiting for Orchestrator review; active reviews, manual reviews, holds, requested changes and settlement confirmation have distinct truthful labels. Opening a conversation no longer removes that review information. The collapsed rail uses the same review label in its tooltip and accessible name.

Existing Orchestrator synchronization updates the list without adding a poll. Running work and live input requests retain priority. Pinned managers retain their existing lifecycle. Actual T3 settlement still controls the Settled group. A later run cannot inherit an older report's outcome. Linked-computer lists do not use local reports, because their review history is not available from the current local cache.

The user's screenshot is C:/Users/tim/.t3/userdata/lucid-attachments/1793655845891-image.png. Native captures use the actual production renderThreads function and sidebar CSS, with explicitly synthetic report states and the supplied thread title. No real report, question, thread or settlement was modified by the fixture.

- [Before](E:/Lucid-validation/thread-review-20261102/before-waiting.png), prior production components from d58142b in the same fixture.
- [After](E:/Lucid-validation/thread-review-20261102/after-waiting.png), submitted report.
- [Narrow sidebar](E:/Lucid-validation/thread-review-20261102/after-narrow.png), status wraps without losing the project name.

`node scripts/verify-thread-review-native.cjs` passed 15 focused checks. `npm run verify:update` passed. [result.json](result.json) records the checks, source and capture hashes and verification log receipt. The installed app was not replaced or restarted; normal coordinated Update loads the change.
