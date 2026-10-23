package com.resumeanalyser.bugreport;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.resumeanalyser.common.BadRequestException;
import com.resumeanalyser.common.ExternalServiceException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;

/**
 * The GitHub REST API calls bug review needs: open an issue, and read one to
 * check it exists. Authenticated with {@code app.bug-reports.github-token}, a
 * fine-grained token limited to Issues on one repository; the token never
 * appears in an error message or a log line.
 */
@Component
public class GitHubIssueClient {

    static final String API = "https://api.github.com";

    private final RestClient client;
    private final BugReportProperties properties;

    public GitHubIssueClient(BugReportProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(Duration.ofSeconds(20));
        this.client = RestClient.builder()
                .baseUrl(API)
                .requestFactory(factory)
                .defaultHeader(HttpHeaders.ACCEPT, "application/vnd.github+json")
                .defaultHeader("X-GitHub-Api-Version", "2022-11-28")
                .defaultHeader(HttpHeaders.USER_AGENT, "Coverlay bug reports")
                .messageConverters(converters -> {
                    converters.removeIf(MappingJackson2HttpMessageConverter.class::isInstance);
                    converters.add(0, new MappingJackson2HttpMessageConverter(objectMapper));
                })
                .build();
    }

    /**
     * An issue as GitHub returns it (only the fields we keep). GitHub's issues
     * API also returns pull requests; those carry {@code pullRequest}.
     */
    public record Issue(int number, @JsonProperty("html_url") String htmlUrl, String state,
                        @JsonProperty("pull_request") Object pullRequest) {

        public Issue(int number, String htmlUrl, String state) {
            this(number, htmlUrl, state, null);
        }
    }

    record NewIssue(String title, String body, List<String> labels) {}

    /**
     * @throws ExternalServiceException if no token is configured or GitHub refuses
     */
    public Issue create(String title, String body) {
        if (!properties.githubConfigured()) {
            throw new ExternalServiceException(
                    "GitHub isn't set up: set GITHUB_ISSUES_TOKEN (and GITHUB_ISSUES_REPO) to approve reports. "
                            + "You can still link a report to an existing issue.");
        }
        try {
            Issue issue = client.post()
                    .uri("/repos/{owner}/{name}/issues", owner(), name())
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.githubToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(new NewIssue(title, body, properties.labels() == null ? List.of() : properties.labels()))
                    .retrieve()
                    .body(Issue.class);
            if (issue == null || issue.htmlUrl() == null) {
                throw new ExternalServiceException("GitHub did not return the new issue");
            }
            return issue;
        } catch (HttpClientErrorException e) {
            throw new ExternalServiceException("GitHub refused to open the issue (HTTP " + e.getStatusCode().value()
                    + "); check the token has Issues: read and write on " + properties.githubRepo());
        } catch (RestClientException e) {
            throw new ExternalServiceException("Could not reach GitHub to open the issue");
        }
    }

    /**
     * The issue with this number in the configured repository.
     *
     * @throws BadRequestException if there is no such issue (or it is a pull request)
     * @throws ExternalServiceException if GitHub can't be reached
     */
    public Issue get(int number) {
        try {
            RestClient.RequestHeadersSpec<?> request = client.get().uri("/repos/{owner}/{name}/issues/{number}", owner(), name(), number);
            if (properties.githubConfigured()) {
                request = request.header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.githubToken());
            }
            Issue issue = request.retrieve().body(Issue.class);
            if (issue == null) {
                throw new ExternalServiceException("GitHub did not return issue #" + number);
            }
            if (issue.pullRequest() != null) {
                throw new BadRequestException("#" + number + " is a pull request, not an issue");
            }
            return issue;
        } catch (HttpClientErrorException.NotFound e) {
            throw new BadRequestException("There is no issue #" + number + " in " + properties.githubRepo());
        } catch (HttpClientErrorException e) {
            throw new ExternalServiceException("GitHub refused to read issue #" + number + " (HTTP " + e.getStatusCode().value() + ")");
        } catch (RestClientException e) {
            throw new ExternalServiceException("Could not reach GitHub to read issue #" + number);
        }
    }

    // Owner and name are separate template variables: a single "owner/name"
    // variable would have its slash encoded as %2F.
    private String owner() {
        return properties.githubRepo().split("/", 2)[0];
    }

    private String name() {
        String[] parts = properties.githubRepo().split("/", 2);
        return parts.length > 1 ? parts[1] : "";
    }
}
