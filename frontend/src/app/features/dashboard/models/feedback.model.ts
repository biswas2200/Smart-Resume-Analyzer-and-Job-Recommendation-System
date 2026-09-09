/**
 * Public-facing view of a feedback entry. Mirrors the backend's
 * `feedback.dto.FeedbackDto` field-for-field (see
 * backend/src/main/java/com/resumeanalyser/feedback/dto/FeedbackDto.java).
 */
export interface Feedback {
  id: string;
  recommendationId: string;

  /** Null until the EMA skill-vector update job (FR-7) is implemented. */
  skillVectorVersionId: string | null;

  helpful: boolean;

  /** ISO-8601 instant the feedback was submitted. */
  createdAt: string;
}
