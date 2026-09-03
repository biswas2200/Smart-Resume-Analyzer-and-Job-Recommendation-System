package com.resumeanalyser.common;

import java.time.Instant;
import java.util.List;

/**
 * The single, uniform error-response shape returned by every failed API call
 * in this app -- used by both {@link GlobalExceptionHandler} and each module's
 * own scoped exception handler (e.g. {@code AuthExceptionHandler}), so a
 * client only ever has to parse one error format.
 *
 * @param timestamp   when the error occurred
 * @param status      the HTTP status code, duplicated here (in addition to the actual HTTP status)
 *                     so the status is visible even if the body is logged/inspected on its own
 * @param message     a human-readable summary of what went wrong
 * @param fieldErrors per-field validation failures (e.g. "email: must be a well-formed email address");
 *                     null when the error isn't about individual request fields
 */
public record ApiError(
        Instant timestamp,
        int status,
        String message,
        List<String> fieldErrors
) {

    /**
     * Builds an error with no field-level detail.
     *
     * @param status  the HTTP status code
     * @param message the error message
     * @return a new ApiError, timestamped now
     */
    public static ApiError of(int status, String message) {
        return new ApiError(Instant.now(), status, message, null);
    }

    /**
     * Builds an error that also lists which request fields failed validation.
     *
     * @param status      the HTTP status code
     * @param message     the overall error message
     * @param fieldErrors the individual field validation failures
     * @return a new ApiError, timestamped now
     */
    public static ApiError of(int status, String message, List<String> fieldErrors) {
        return new ApiError(Instant.now(), status, message, fieldErrors);
    }
}
