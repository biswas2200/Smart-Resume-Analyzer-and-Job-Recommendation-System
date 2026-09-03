package com.resumeanalyser.common;

import java.time.Instant;
import java.util.List;

public record ApiError(
        Instant timestamp,
        int status,
        String message,
        List<String> fieldErrors
) {

    public static ApiError of(int status, String message) {
        return new ApiError(Instant.now(), status, message, null);
    }

    public static ApiError of(int status, String message, List<String> fieldErrors) {
        return new ApiError(Instant.now(), status, message, fieldErrors);
    }
}
