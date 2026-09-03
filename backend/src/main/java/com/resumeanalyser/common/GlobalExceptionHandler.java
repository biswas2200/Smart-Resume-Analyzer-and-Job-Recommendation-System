package com.resumeanalyser.common;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import java.util.List;

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
     * Last-resort catch-all for any exception no more specific handler dealt with.
     * Deliberately returns a generic message instead of {@code e.getMessage()}, so
     * internal error details (stack traces, SQL, file paths) never reach the client.
     *
     * @param e the unhandled exception (logged elsewhere, e.g. by {@code LoggingAspect})
     * @return a 500 Internal Server Error response with a generic message
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleUnexpected(Exception e) {
        return ResponseEntity.internalServerError()
                .body(ApiError.of(HttpStatus.INTERNAL_SERVER_ERROR.value(), "An unexpected error occurred"));
    }
}
