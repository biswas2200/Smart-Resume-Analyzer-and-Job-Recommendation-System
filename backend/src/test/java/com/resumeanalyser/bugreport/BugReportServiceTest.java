package com.resumeanalyser.bugreport;

import com.resumeanalyser.account.User;
import com.resumeanalyser.bugreport.dto.BugReportRequest;
import com.resumeanalyser.common.BadRequestException;
import com.resumeanalyser.common.ConflictException;
import com.resumeanalyser.common.ExternalServiceException;
import com.resumeanalyser.common.TooManyRequestsException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BugReportServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-24T10:00:00Z");
    private static final String REPO = "biswas2200/Smart-Resume-Analyzer-and-Job-Recommendation-System";

    @Mock private BugReportRepository reports;
    @Mock private GitHubIssueClient github;

    private BugReportService service;
    private final User reporter = user("reporter@example.com");
    private final User admin = user("admin@example.com");

    @BeforeEach
    void setUp() {
        service = new BugReportService(reports, github,
                new BugReportProperties(5, REPO, "token", List.of("bug", "user-report")), Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static User user(String email) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail(email);
        return user;
    }

    private BugReport pendingReport() {
        BugReport report = new BugReport();
        report.setId(UUID.fromString("0f6a2f8e-0000-4000-8000-000000000001"));
        report.setUser(reporter);
        report.setWhatHappened("The Save button does nothing, cc @someone");
        report.setExpected("The job shows up on Saved jobs");
        report.setSteps("Open Jobs for you\nClick Save on the first job");
        report.setPage("/jobs.html");
        report.setUserAgent("Mozilla/5.0 `x`");
        report.setWrittenByUser(true);
        report.setCreatedAt(NOW);
        return report;
    }

    @Test
    void submit_storesThePendingReportWithItsContext() {
        when(reports.countByUserAndCreatedAtAfter(eq(reporter), any())).thenReturn(0L);
        when(reports.save(any(BugReport.class))).thenAnswer(inv -> inv.getArgument(0));

        var dto = service.submit(reporter, new BugReportRequest("  Nothing happens on Save  ", "It saves", null,
                "/jobs.html", true), "Mozilla/5.0");

        assertThat(dto.status()).isEqualTo(BugReportStatus.PENDING);
        assertThat(dto.whatHappened()).isEqualTo("Nothing happens on Save");
        assertThat(dto.steps()).isEmpty();
        assertThat(dto.page()).isEqualTo("/jobs.html");
        assertThat(dto.reporterEmail()).isNull();
        verifyNoInteractions(github);
    }

    @Test
    void submit_isLimitedPerDay() {
        when(reports.countByUserAndCreatedAtAfter(reporter, NOW.minusSeconds(86_400))).thenReturn(5L);

        assertThatThrownBy(() -> service.submit(reporter,
                new BugReportRequest("Something broke here", "Not broken", "", "/", true), "UA"))
                .isInstanceOf(TooManyRequestsException.class);
        verify(reports, never()).save(any());
    }

    @Test
    void approve_opensAnIssueWithTheThreeSections_andNothingThatIdentifiesTheReporter() {
        BugReport report = pendingReport();
        when(reports.findById(report.getId())).thenReturn(Optional.of(report));
        when(github.create(eq("Save does nothing on Jobs for you"), anyString()))
                .thenReturn(new GitHubIssueClient.Issue(42, "https://github.com/" + REPO + "/issues/42", "open"));
        when(reports.save(report)).thenReturn(report);

        var dto = service.approve(admin, report.getId(), "  Save does nothing on Jobs for you ");

        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(github).create(eq("Save does nothing on Jobs for you"), body.capture());
        assertThat(body.getValue())
                .contains("### What went wrong", "### What was expected", "### How to see it",
                        "> Open Jobs for you\n> Click Save on the first job", "page `/jobs.html`",
                        "without AI tools", report.getId().toString())
                .contains("@​someone")
                .doesNotContain("reporter@example.com")
                .doesNotContain("`x`");
        assertThat(dto.status()).isEqualTo(BugReportStatus.APPROVED);
        assertThat(dto.githubIssueNumber()).isEqualTo(42);
        assertThat(report.getReviewedBy()).isSameAs(admin);
        assertThat(report.getReviewedAt()).isEqualTo(NOW);
    }

    @Test
    void approve_withoutGitHub_leavesTheReportPending() {
        BugReport report = pendingReport();
        when(reports.findById(report.getId())).thenReturn(Optional.of(report));
        when(github.create(anyString(), anyString())).thenThrow(new ExternalServiceException("GitHub isn't set up"));

        assertThatThrownBy(() -> service.approve(admin, report.getId(), "Title"))
                .isInstanceOf(ExternalServiceException.class);
        assertThat(report.getStatus()).isEqualTo(BugReportStatus.PENDING);
        verify(reports, never()).save(any());
    }

    @Test
    void link_acceptsANumberOrALinkToThisRepository_only() {
        assertThat(service.issueNumber("42")).isEqualTo(42);
        assertThat(service.issueNumber(" #7 ")).isEqualTo(7);
        assertThat(service.issueNumber("https://github.com/" + REPO + "/issues/15")).isEqualTo(15);
        assertThatThrownBy(() -> service.issueNumber("https://github.com/someone/else/issues/1"))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.issueNumber("the one about saving")).isInstanceOf(BadRequestException.class);
    }

    @Test
    void link_pointsTheReportAtTheExistingIssue_withTheNoteForTheReporter() {
        BugReport report = pendingReport();
        when(reports.findById(report.getId())).thenReturn(Optional.of(report));
        when(github.get(15)).thenReturn(new GitHubIssueClient.Issue(15, "https://github.com/" + REPO + "/issues/15", "open"));
        when(reports.save(report)).thenReturn(report);

        var dto = service.link(admin, report.getId(), "#15", "Already being fixed");

        assertThat(dto.status()).isEqualTo(BugReportStatus.LINKED);
        assertThat(dto.githubIssueUrl()).endsWith("/issues/15");
        assertThat(dto.reviewNote()).isEqualTo("Already being fixed");
        verify(github, never()).create(anyString(), anyString());
    }

    @Test
    void aReviewedReport_cannotBeReviewedAgain() {
        BugReport report = pendingReport();
        report.setStatus(BugReportStatus.REJECTED);
        when(reports.findById(report.getId())).thenReturn(Optional.of(report));

        assertThatThrownBy(() -> service.approve(admin, report.getId(), "Title")).isInstanceOf(ConflictException.class);
        verifyNoInteractions(github);
    }

    @Test
    void reject_keepsItOffGitHub() {
        BugReport report = pendingReport();
        when(reports.findById(report.getId())).thenReturn(Optional.of(report));
        when(reports.save(report)).thenReturn(report);

        var dto = service.reject(admin, report.getId(), "Couldn't reproduce");

        assertThat(dto.status()).isEqualTo(BugReportStatus.REJECTED);
        assertThat(dto.githubIssueUrl()).isNull();
        verifyNoInteractions(github);
    }
}
