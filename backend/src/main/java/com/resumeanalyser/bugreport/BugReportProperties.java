package com.resumeanalyser.bugreport;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.util.List;

/**
 * Bug report settings ({@code app.bug-reports.*} in application.yml).
 *
 * @param perDay      reports one user may send in 24 hours
 * @param githubRepo  where approved reports become issues, "owner/name"
 * @param githubToken a fine-grained GitHub token with Issues: read and write on that
 *                    repository only; empty = approving is unavailable (linking still works)
 * @param labels      labels put on every issue opened from a report
 */
@ConfigurationProperties(prefix = "app.bug-reports")
public record BugReportProperties(int perDay, String githubRepo, String githubToken, List<String> labels) {

    public boolean githubConfigured() {
        return githubToken != null && !githubToken.isBlank() && githubRepo != null && githubRepo.contains("/");
    }
}
