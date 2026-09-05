/**
 * ATS compatibility check result. Mirrors the ml-service's `AtsCheck` Pydantic model exactly,
 * field-for-field (docs/entities-and-fields.md §1.6) — this is the real, already-implemented
 * `/ats-score` and `/analyze` response shape, unlike the rest of this file.
 */
export interface AtsCheck {
  name: string;
  passed: boolean;
  detail: string;
}

/**
 * ATS compatibility score. Mirrors the ml-service's `AtsScoreResponse` exactly, including the
 * snake_case `max_score` field — this is the literal JSON the `/ats-score` and `/analyze`
 * endpoints return today, so the field names are kept as-is rather than camelCased, to avoid
 * a silent field-name mismatch once the frontend talks to a real backend.
 */
export interface AtsScoreResponse {
  score: number;
  max_score: number;
  checks: AtsCheck[];
}

/**
 * A recommended role plus why it was recommended.
 * `role` mirrors the backend's real `recommendation.dto.RoleDto`; `matchScore`/`createdAt`/
 * `recommendationId` mirror `RecommendationDto`. `matchedSkills`/`missingSkills` have no
 * single backend DTO yet (equivalent to ml-service's `RoleMatch.matched_skills`/`missing_skills`)
 * — the dashboard read endpoint that will assemble this composite view is still only sketched
 * in docs/lld.md §7, not designed field-by-field, so this whole interface may need to change
 * once that endpoint exists.
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

/** Everything the dashboard page renders for the candidate's most recent resume version. */
export interface DashboardData {
  atsScore: AtsScoreResponse;
  recommendations: RoleRecommendation[];

  /** LLM-style coaching prose, mirroring `AnalyzeResponse.explanation` in spirit. */
  explanation: string;
}
