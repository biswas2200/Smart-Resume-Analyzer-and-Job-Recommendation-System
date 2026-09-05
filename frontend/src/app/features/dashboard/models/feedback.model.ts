/**
 * Public-facing view of a feedback entry. Mirrors the backend's planned
 * `feedback.dto.FeedbackDto` field-for-field (see
 * backend/src/main/java/com/resumeanalyser/feedback/dto/FeedbackDto.java) — that module has
 * no controller yet, so this is served by the mock API (see feedback.service.ts) until it does.
 */
export interface Feedback {
  id: string;
  recommendationId: string;

  /** Null in the mock, since there is no real skill-vector concept on the frontend yet. */
  skillVectorVersionId: string | null;

  helpful: boolean;

  /** ISO-8601 instant the feedback was submitted. */
  createdAt: string;
}
