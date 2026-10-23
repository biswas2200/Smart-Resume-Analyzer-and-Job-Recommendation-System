package com.resumeanalyser.bugreport;

import com.resumeanalyser.account.User;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.Instant;
import java.util.UUID;

/** A user's bug report, held privately until an administrator reviews it. */
@Entity
@Table(name = "bug_reports")
@Getter
@Setter
public class BugReport {

    @Id
    @GeneratedValue
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "what_happened", nullable = false, columnDefinition = "TEXT")
    private String whatHappened;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String expected;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String steps = "";

    /** The app page it was sent from, e.g. {@code "/jobs.html"}. */
    @Column(nullable = false)
    private String page = "";

    @Column(name = "user_agent", nullable = false, length = 512)
    private String userAgent = "";

    @Column(name = "written_by_user", nullable = false)
    private boolean writtenByUser;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private BugReportStatus status = BugReportStatus.PENDING;

    @Column(name = "github_issue_number")
    private Integer githubIssueNumber;

    @Column(name = "github_issue_url", columnDefinition = "TEXT")
    private String githubIssueUrl;

    /** Why it was rejected or linked; shown to the reporter. */
    @Column(name = "review_note", nullable = false, columnDefinition = "TEXT")
    private String reviewNote = "";

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reviewed_by")
    private User reviewedBy;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();
}
