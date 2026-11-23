# Coding standards

Read during code review. Typecheck and tests are enforced by CI and the pre-commit hook, so they aren't repeated here.

## Features that meet

Run states, Distance, Room lifetime and player identity (Browser ID, Calibration, Teams) are read by several features at once. A change to any of them must keep `packages/server/src/scenarios.test.ts` telling the truth: extend an existing story, or add one, showing the change working together with the features that read it. A ticket tested only in isolation is the gap the reviewer looks for.
