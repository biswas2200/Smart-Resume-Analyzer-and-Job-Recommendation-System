package com.resumeanalyser.client;

/**
 * Thrown when a call to the ML service fails -- either it's unreachable, or it
 * responded with an error (e.g. an unsupported file type). Wraps the
 * underlying Spring/HTTP failure so callers depend on one exception type
 * regardless of whether the ML service was down or simply rejected the request.
 */
public class MlServiceException extends RuntimeException {

    private final boolean unsupportedFileType;

    /**
     * @param message             a human-readable description of what went wrong
     * @param unsupportedFileType true if the ML service rejected the file's format
     *                            (its {@code 415}), false for every other failure
     * @param cause               the underlying exception, if any
     */
    public MlServiceException(String message, boolean unsupportedFileType, Throwable cause) {
        super(message, cause);
        this.unsupportedFileType = unsupportedFileType;
    }

    /** Whether this failure was specifically the ML service rejecting the file's format. */
    public boolean isUnsupportedFileType() {
        return unsupportedFileType;
    }
}
