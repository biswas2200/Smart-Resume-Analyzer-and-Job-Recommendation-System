package com.resumeanalyser.bugreport.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * The bug report form: three short sections, written by the user.
 *
 * @param whatHappened  "What went wrong?" (required)
 * @param expected      "What did you expect?" (required)
 * @param steps         "How can we see it? (optional)"
 * @param page          the app page it was sent from, filled in by the app
 * @param writtenByUser the user ticked "I wrote this myself, without AI tools"
 */
public record BugReportRequest(
        @NotBlank @Size(min = 10, max = BugReportRequest.MAX_SECTION) String whatHappened,
        @NotBlank @Size(max = BugReportRequest.MAX_SECTION) String expected,
        @Size(max = BugReportRequest.MAX_SECTION) String steps,
        @Size(max = 255) String page,
        @AssertTrue(message = "Please confirm you wrote this report yourself, without AI tools") boolean writtenByUser
) {
    public static final int MAX_SECTION = 1_500;
}
