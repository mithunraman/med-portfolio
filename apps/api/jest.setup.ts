import { Logger } from '@nestjs/common';

// Silence Nest's internal logger during tests. Jest still prints failed test
// names, stack traces, and assertion diffs — those go through jest's own
// reporter, not the Nest logger. This only suppresses app-level noise like
// `[NoticesRepository] ERROR Failed to find ...` from tests that intentionally
// exercise error paths.
Logger.overrideLogger(false);
