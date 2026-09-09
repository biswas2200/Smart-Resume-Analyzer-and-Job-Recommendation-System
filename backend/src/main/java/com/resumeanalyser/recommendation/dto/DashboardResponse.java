package com.resumeanalyser.recommendation.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Everything the dashboard page renders for the candidate's most recent resume
 * version: ATS score breakdown, ranked role recommendations, and a coaching
 * explanation. This is the "dashboard read endpoint" sketched in docs/lld.md §7 --
 * a composite view with no single backing entity, assembled from the latest
 * {@link com.resumeanalyser.resume.Resume}'s {@link com.resumeanalyser.resume.ParsedProfile}
 * and {@link com.resumeanalyser.recommendation.Recommendation} rows.
 *
 * @param atsScore        the ATS compatibility score for the candidate's latest resume
 * @param recommendations ranked role matches, best first
 * @param explanation     LLM-generated coaching prose tying the score and matches together
 */
public record DashboardResponse(
        AtsScore atsScore,
        List<RoleRecommendation> recommendations,
        String explanation
) {

    /**
     * Mirrors the ML service's {@code AtsScoreResponse} shape exactly, including
     * the snake_case {@code max_score} field, since the frontend was built
     * against that literal JSON (see docs/entities-and-fields.md §1.6).
     */
    public record AtsScore(
            double score,

            @JsonProperty("max_score")
            double maxScore,

            List<AtsCheck> checks
    ) {}

    /** One named pass/fail ATS check. */
    public record AtsCheck(String name, boolean passed, String detail) {}

    /**
     * One recommended role plus why it was recommended -- mirrors
     * {@link com.resumeanalyser.recommendation.dto.RecommendationDto} plus
     * the matched/missing skill lists the frontend also needs.
     */
    public record RoleRecommendation(
            UUID recommendationId,
            RoleSummary role,
            double matchScore,
            Instant createdAt,
            List<String> matchedSkills,
            List<String> missingSkills
    ) {}

    /** The recommended role's public identity, mirroring {@link RoleDto}. */
    public record RoleSummary(UUID id, String title, String description) {}
}
