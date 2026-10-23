-- Bug reports from users. They stay here, private, until an administrator
-- reviews them: approving one opens a GitHub issue (or links an existing
-- one); rejecting keeps it out of GitHub. Nothing reaches GitHub on its own.
CREATE TABLE bug_reports (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- The three sections the user fills in.
    what_happened       TEXT NOT NULL,
    expected            TEXT NOT NULL,
    steps               TEXT NOT NULL DEFAULT '',
    -- Filled in by the app, not the user: the page and browser it came from.
    page                VARCHAR(255) NOT NULL DEFAULT '',
    user_agent          VARCHAR(512) NOT NULL DEFAULT '',
    -- The user confirmed they wrote it themselves, without AI tools.
    written_by_user     BOOLEAN NOT NULL,
    -- PENDING, APPROVED (issue opened), LINKED (an existing issue covers it) or REJECTED.
    status              VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    github_issue_number INTEGER,
    github_issue_url    TEXT,
    review_note         TEXT NOT NULL DEFAULT '',
    reviewed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bug_reports_status_created ON bug_reports (status, created_at);
CREATE INDEX idx_bug_reports_user_created ON bug_reports (user_id, created_at DESC);
