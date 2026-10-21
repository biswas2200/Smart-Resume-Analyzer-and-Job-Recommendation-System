package com.resumeanalyser.client.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/**
 * Mirrors the ML service's {@code AnalyzeResponse} Pydantic model -- the full
 * result of {@code POST /analyze-file} (ml-service/app/routers/upload.py):
 * parsed profile, detected domain, ATS score, ranked role matches, skill gaps,
 * a coaching explanation, and whether recommendations were locked for the
 * requesting tier.
 */
public record AnalyzeResponseDto(
        ResumeProfileDto profile,

        /** Which job domain the resume was classified into and how it is served. */
        DomainDetectionDto domain,

        @JsonProperty("ats_score")
        AtsScoreResponseDto atsScore,

        List<RoleMatchDto> matches,
        List<GapAnalysisDto> gaps,

        /**
         * True when the detected domain needs the AI engine and this request
         * could not use it: {@link #matches}/{@link #gaps} are then empty by
         * design, and {@link #lockReason} says why ({@code ai_engine_required},
         * {@code community_edition} or {@code ai_budget_exhausted}).
         */
        @JsonProperty("recommendations_locked")
        boolean recommendationsLocked,

        @JsonProperty("lock_reason")
        String lockReason,

        String explanation,

        /**
         * Which explainer backend actually produced {@link #explanation}:
         * {@code "template"} (deterministic) or {@code "llm"} (Premium
         * narrative, or a fallback to template if the LLM call failed --
         * FR-5.4/NFR-3.1). Labelling this lets the dashboard show which kind
         * of explanation the candidate received.
         */
        @JsonProperty("explanation_source")
        String explanationSource,

        /**
         * True only when a paid (non-cached) AI extraction ran for this
         * request -- what {@code ResumeService} charges a free account's
         * monthly allowance for. Absent/false for every local-engine
         * analysis, every locked result, and every cache hit.
         */
        @JsonProperty("ai_extraction_used")
        boolean aiExtractionUsed
) {}
