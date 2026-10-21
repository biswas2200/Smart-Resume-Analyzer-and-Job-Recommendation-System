package com.resumeanalyser.recommendation.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.resumeanalyser.account.dto.AiAllowanceDto;
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
 * @param resumeId               the resume version this dashboard describes (the
 *                               target for {@code POST /resumes/{id}/reanalyze})
 * @param domain                 the job domain the resume was classified into
 * @param atsScore               the ATS compatibility score for the candidate's latest resume
 * @param recommendations        ranked role matches, best first -- empty when locked
 * @param recommendationsLocked  true when the domain needs the AI engine and the
 *                               analysis could not use it; the frontend shows a
 *                               locked card instead of an empty list
 * @param lockReason             why recommendations are locked -- {@code "ai_engine_required"}
 *                               (free allowance spent), {@code "community_edition"},
 *                               {@code "ai_budget_exhausted"} -- or null
 * @param userTier               the signed-in user's own tier, {@code "free"} or
 *                               {@code "premium"} -- so the frontend knows whether
 *                               offering "re-analyse" makes sense
 * @param aiAllowance            a free account's monthly AI-analysis allowance
 *                               (used / quota / reset date); null for Premium
 * @param explanation            coaching prose tying the score and matches together
 * @param explanationSource      which explainer backend produced {@code explanation}:
 *                               {@code "template"} (deterministic) or {@code "llm"}
 *                               (Premium narrative) -- lets the frontend label the
 *                               narrative and show a Premium badge (FR-5.4/FR-12.4)
 */
public record DashboardResponse(
        UUID resumeId,
        DomainInfo domain,
        AtsScore atsScore,
        List<RoleRecommendation> recommendations,
        boolean recommendationsLocked,
        String lockReason,
        String userTier,
        AiAllowanceDto aiAllowance,
        String explanation,
        String explanationSource
) {

    /**
     * The detected job domain and how it is served, mirroring the ML service's
     * {@code DomainDetection}: {@code engine} is {@code "local"} or {@code "llm"},
     * {@code tier} is the tier the domain's recommendations require.
     */
    public record DomainInfo(String id, String name, double confidence, String engine, String tier) {}

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

    /** The recommended role's public identity, mirroring {@link RoleDto}, plus its domain. */
    public record RoleSummary(UUID id, String title, String description, String domain) {}
}
