package com.resumeanalyser.bugreport;

/** Where a bug report stands in review. Only APPROVED and LINKED ever appear on GitHub. */
public enum BugReportStatus {
    /** Sent by a user, waiting for an administrator; private. */
    PENDING,
    /** Approved: a GitHub issue was opened for it. */
    APPROVED,
    /** An existing GitHub issue already covers it; linked, no new issue. */
    LINKED,
    /** Not a bug, not reproducible, spam, or not written by the user; never sent to GitHub. */
    REJECTED
}
