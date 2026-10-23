package com.resumeanalyser.bugreport;

import com.resumeanalyser.account.User;
import com.resumeanalyser.bugreport.dto.BugReportDto;
import com.resumeanalyser.bugreport.dto.BugReportRequest;
import com.resumeanalyser.common.BadRequestException;
import com.resumeanalyser.common.ConflictException;
import com.resumeanalyser.common.ResourceNotFoundException;
import com.resumeanalyser.common.TooManyRequestsException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Bug reports: users send them, they wait privately as PENDING, and an
 * administrator decides. Approving opens a GitHub issue; linking points the
 * report at an issue that already exists; rejecting keeps it off GitHub.
 * Nothing reaches GitHub without that decision.
 */
@Service
public class BugReportService {

    private static final Duration DAY = Duration.ofDays(1);
    private static final Pattern ISSUE_REF = Pattern.compile("^(?:#?(\\d+)|https://github\\.com/([^/]+/[^/]+)/issues/(\\d+)/?)$");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm 'UTC'").withZone(ZoneOffset.UTC);

    private final BugReportRepository reports;
    private final GitHubIssueClient github;
    private final BugReportProperties properties;
    private final Clock clock;

    public BugReportService(BugReportRepository reports, GitHubIssueClient github, BugReportProperties properties,
                            Clock clock) {
        this.reports = reports;
        this.github = github;
        this.properties = properties;
        this.clock = clock;
    }

    /**
     * @throws TooManyRequestsException past {@code app.bug-reports.per-day} reports in 24 hours
     */
    @Transactional
    public BugReportDto submit(User user, BugReportRequest request, String userAgent) {
        Instant now = clock.instant();
        if (reports.countByUserAndCreatedAtAfter(user, now.minus(DAY)) >= properties.perDay()) {
            throw new TooManyRequestsException("You've sent " + properties.perDay()
                    + " bug reports in the last 24 hours. Thank you! Please try again tomorrow.", Duration.ofHours(1));
        }
        BugReport report = new BugReport();
        report.setUser(user);
        report.setWhatHappened(request.whatHappened().trim());
        report.setExpected(request.expected().trim());
        report.setSteps(request.steps() == null ? "" : request.steps().trim());
        report.setPage(request.page() == null ? "" : request.page().trim());
        report.setUserAgent(userAgent == null ? "" : userAgent.length() > 512 ? userAgent.substring(0, 512) : userAgent);
        report.setWrittenByUser(request.writtenByUser());
        report.setCreatedAt(now);
        return BugReportDto.forReporter(reports.save(report));
    }

    @Transactional(readOnly = true)
    public List<BugReportDto> mine(User user) {
        return reports.findByUserOrderByCreatedAtDesc(user).stream().map(BugReportDto::forReporter).toList();
    }

    @Transactional(readOnly = true)
    public List<BugReportDto> queue(BugReportStatus status) {
        return reports.findByStatusOrderByCreatedAtAsc(status).stream().map(BugReportDto::forAdmin).toList();
    }

    /** Opens a GitHub issue for a pending report, with the reviewer's title. */
    @Transactional
    public BugReportDto approve(User reviewer, UUID id, String title) {
        BugReport report = pending(id);
        GitHubIssueClient.Issue issue = github.create(title.trim(), issueBody(report));
        report.setStatus(BugReportStatus.APPROVED);
        report.setGithubIssueNumber(issue.number());
        report.setGithubIssueUrl(issue.htmlUrl());
        return reviewed(report, reviewer, "");
    }

    /** Links a pending report to an issue that already exists, instead of opening a new one. */
    @Transactional
    public BugReportDto link(User reviewer, UUID id, String issueRef, String note) {
        BugReport report = pending(id);
        GitHubIssueClient.Issue issue = github.get(issueNumber(issueRef));
        report.setStatus(BugReportStatus.LINKED);
        report.setGithubIssueNumber(issue.number());
        report.setGithubIssueUrl(issue.htmlUrl());
        return reviewed(report, reviewer, note);
    }

    @Transactional
    public BugReportDto reject(User reviewer, UUID id, String note) {
        BugReport report = pending(id);
        report.setStatus(BugReportStatus.REJECTED);
        return reviewed(report, reviewer, note);
    }

    private BugReport pending(UUID id) {
        BugReport report = reports.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("No bug report with id " + id));
        if (report.getStatus() != BugReportStatus.PENDING) {
            throw new ConflictException("This report was already reviewed (" + report.getStatus() + ")");
        }
        return report;
    }

    private BugReportDto reviewed(BugReport report, User reviewer, String note) {
        report.setReviewedBy(reviewer);
        report.setReviewedAt(clock.instant());
        report.setReviewNote(note == null ? "" : note.trim());
        return BugReportDto.forAdmin(reports.save(report));
    }

    /** "42", "#42" or "https://github.com/owner/name/issues/42" (of the configured repository). */
    int issueNumber(String ref) {
        Matcher match = ISSUE_REF.matcher(ref.trim());
        if (!match.matches()) {
            throw new BadRequestException("Give the issue as a number (#42) or its GitHub link");
        }
        if (match.group(1) != null) {
            return Integer.parseInt(match.group(1));
        }
        if (!match.group(2).equalsIgnoreCase(properties.githubRepo())) {
            throw new BadRequestException("That issue is in " + match.group(2) + ", not " + properties.githubRepo());
        }
        return Integer.parseInt(match.group(3));
    }

    /**
     * The issue text: the reporter's three sections, then where it came from.
     * The reporter's email never goes to GitHub, and "@" is defused so a
     * report can't ping people.
     */
    String issueBody(BugReport report) {
        StringBuilder body = new StringBuilder()
                .append("### What went wrong\n\n").append(quote(report.getWhatHappened()))
                .append("\n\n### What was expected\n\n").append(quote(report.getExpected()));
        if (!report.getSteps().isBlank()) {
            body.append("\n\n### How to see it\n\n").append(quote(report.getSteps()));
        }
        body.append("\n\n---\n")
                .append("Reported in Coverlay on ").append(DATE.format(report.getCreatedAt()))
                .append(report.getPage().isBlank() ? "" : ", page `" + report.getPage().replace("`", "") + "`")
                .append(". Report ").append(report.getId()).append(".\n");
        if (!report.getUserAgent().isBlank()) {
            body.append("Browser: `").append(report.getUserAgent().replace("`", "")).append("`\n");
        }
        body.append("The reporter confirmed they wrote this themselves, without AI tools; a reviewer approved it.\n");
        return body.toString();
    }

    /** Each line as a Markdown quote, with "@" followed by a zero-width space so mentions don't notify. */
    private static String quote(String text) {
        return text.replace("@", "@​").lines().map(line -> "> " + line).reduce((a, b) -> a + "\n" + b).orElse(">");
    }
}
