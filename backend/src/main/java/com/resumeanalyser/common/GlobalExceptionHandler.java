package com.resumeanalyser.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import java.util.List;
import java.util.UUID;

/**
 * Catches exceptions that aren't specific to any one module -- request-body
 * validation failures and "resource not found" -- plus a last-resort fallback
 * for anything unexpected, so the client always gets clean JSON instead of a
 * raw stack trace. Applies app-wide (no {@code basePackages} restriction).
 * Module-specific exceptions (e.g. auth's {@code EmailAlreadyInUseException})
 * are handled by that module's own scoped handler instead, never here.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /**
     * Handles a request body that failed its {@code @Valid} constraints
     * (e.g. a missing required field, a malformed email).
     *
     * @param e Spring's exception, carrying the list of individual field failures
     * @return a 400 Bad Request response listing every field that failed and why
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException e) {
        List<String> fieldErrors = e.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .toList();

        return ResponseEntity.badRequest()
                .body(ApiError.of(HttpStatus.BAD_REQUEST.value(), "Validation failed", fieldErrors));
    }

    /**
     * Handles a request for a record that doesn't exist.
     *
     * @param e the exception, whose message describes what wasn't found
     * @return a 404 Not Found response
     */
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiError> handleNotFound(ResourceNotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiError.of(HttpStatus.NOT_FOUND.value(), e.getMessage()));
    }

    /**
     * Handles a request rejected by a {@code @PreAuthorize} check (see
     * {@code SecurityConfig}'s {@code @EnableMethodSecurity}) -- the caller is
     * authenticated, just not allowed to perform this specific action. Without
     * this handler, such a rejection would otherwise fall through to
     * {@link #handleUnexpected} and incorrectly report a 500.
     *
     * @param e the exception Spring Security throws when a method-security check fails
     * @return a 403 Forbidden response
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiError> handleAccessDenied(AccessDeniedException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiError.of(HttpStatus.FORBIDDEN.value(), "You do not have permission to perform this action"));
    }

    /**
     * Last-resort catch-all for any exception no more specific handler dealt with --
     * i.e. an actual bug, not an expected failure like bad credentials or a
     * duplicate email. Deliberately returns a generic message instead of
     * {@code e.getMessage()}, so internal error details (stack traces, SQL, file
     * paths) never reach the client. What the client gets instead is a random
     * trace id, logged here alongside the real stack trace -- so a user quoting
     * that id in a bug report is enough to find exactly what broke in the logs,
     * without ever exposing that detail over the API itself.
     *
     * @param e the unhandled exception; logged here in full (this is the one place
     *          in the app that logs a complete stack trace for it -- {@code LoggingAspect}
     *          only logs the exception's class and message, not its trace)
     * @return a 500 Internal Server Error response with a generic message and a trace id
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleUnexpected(Exception e) {
        String traceId = UUID.randomUUID().toString();
        log.error("Unhandled exception, traceId={}", traceId, e);

        return ResponseEntity.internalServerError()
                .body(ApiError.ofUnexpected(
                        HttpStatus.INTERNAL_SERVER_ERROR.value(),
                        "An unexpected error occurred. If this persists, please report it with trace id " + traceId,
                        traceId));
    }
}
