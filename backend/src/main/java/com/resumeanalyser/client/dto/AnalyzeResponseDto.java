package com.resumeanalyser.client.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/**
 * Mirrors the ML service's {@code AnalyzeResponse} Pydantic model -- the full
 * result of {@code POST /analyze-file} (ml-service/app/routers/upload.py):
 * parsed profile, ATS score, ranked role matches, skill gaps, and a coaching explanation.
 */
public record AnalyzeResponseDto(
        ResumeProfileDto profile,

        @JsonProperty("ats_score")
        AtsScoreResponseDto atsScore,

        List<RoleMatchDto> matches,
        List<GapAnalysisDto> gaps,
        String explanation
) {}
