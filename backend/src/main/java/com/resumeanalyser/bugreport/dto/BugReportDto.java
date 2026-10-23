package com.resumeanalyser.bugreport.dto;

import com.resumeanalyser.bugreport.BugReport;
import com.resumeanalyser.bugreport.BugReportStatus;
import java.time.Instant;
import java.util.UUID;

/**
 * A bug report as its reporter (and an administrator) sees it. The
 * reporter's email is only filled in for administrators.
 */
public record BugReportDto(
        UUID id,
        String whatHappened,
        String expected,
        String steps,
        String page,
        String userAgent,
        BugReportStatus status,
        Integer githubIssueNumber,
        String githubIssueUrl,
        String reviewNote,
        Instant createdAt,
        Instant reviewedAt,
        String reporterEmail
) {
    public static BugReportDto forReporter(BugReport report) {
        return of(report, null);
    }

    public static BugReportDto forAdmin(BugReport report) {
        return of(report, report.getUser().getEmail());
    }

    private static BugReportDto of(BugReport report, String email) {
        return new BugReportDto(report.getId(), report.getWhatHappened(), report.getExpected(), report.getSteps(),
                report.getPage(), report.getUserAgent(), report.getStatus(), report.getGithubIssueNumber(),
                report.getGithubIssueUrl(), report.getReviewNote(), report.getCreatedAt(), report.getReviewedAt(), email);
    }
}
