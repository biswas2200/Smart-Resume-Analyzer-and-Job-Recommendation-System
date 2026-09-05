/**
 * ATS compatibility check result. Mirrors the backend's
 * `recommendation.dto.DashboardResponse.AtsCheck` (itself sourced from the ml-service's
 * `AtsCheck` Pydantic model) field-for-field.
 */
export interface AtsCheck {
  name: string;
  passed: boolean;
  detail: string;
}

/**
 * ATS compatibility score. Mirrors `recommendation.dto.DashboardResponse.AtsScore`, including
 * the snake_case `max_score` field — kept as-is (rather than camelCased) to match the literal
 * JSON the backend's `GET /recommendations/dashboard` returns.
 */
export interface AtsScoreResponse {
  score: number;
  max_score: number;
  checks: AtsCheck[];
}

/**
 * A recommended role plus why it was recommended. Mirrors
 * `recommendation.dto.DashboardResponse.RoleRecommendation` field-for-field.
 */
export interface RoleRecommendation {
  recommendationId: string;
  role: {
    id: string;
    title: string;
    description: string;
  };
  matchScore: number;
  createdAt: string;
  matchedSkills: string[];
  missingSkills: string[];
}

/**
 * Everything the dashboard page renders for the candidate's most recent resume version.
 * Mirrors `recommendation.dto.DashboardResponse`, the body of `GET /recommendations/dashboard`.
 */
export interface DashboardData {
  atsScore: AtsScoreResponse;
  recommendations: RoleRecommendation[];

  /** LLM-generated coaching prose tying the score and matches together. */
  explanation: string;
}
