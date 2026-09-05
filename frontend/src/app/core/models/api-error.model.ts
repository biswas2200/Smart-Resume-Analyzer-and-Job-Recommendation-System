/**
 * Uniform error body returned by every failed backend API call.
 * Mirrors `com.resumeanalyser.common.ApiError` field-for-field (see docs/entities-and-fields.md
 * and backend/src/main/java/com/resumeanalyser/common/ApiError.java) so the frontend never has
 * to guess at the shape of an error response.
 */
export interface ApiError {
  /** ISO-8601 instant the error occurred, as serialized by the backend. */
  timestamp: string;

  /** HTTP status code, duplicated in the body alongside the actual HTTP status. */
  status: number;

  /** Human-readable summary of what went wrong. */
  message: string;

  /**
   * Per-field validation failures (e.g. "email: must be a well-formed email address").
   * Absent/null when the error isn't about individual request fields.
   */
  fieldErrors: string[] | null;
}
