package com.resumeanalyser.client.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/**
 * Mirrors the ML service's {@code RoleMatch} Pydantic model field-for-field.
 * {@code role} is the role's display title (matches {@link com.resumeanalyser.recommendation.Role#getTitle()}),
 * not a database id -- the ML service has no concept of this backend's {@code Role} entity.
 */
public record RoleMatchDto(
        String role,
        double score,

        @JsonProperty("matched_skills")
        List<String> matchedSkills,

        @JsonProperty("missing_skills")
        List<String> missingSkills
) {}
