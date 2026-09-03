package com.resumeanalyser.skillvector.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.UUID;

public record SkillVectorDto(
        UUID id,

        @NotNull
        UUID roleId,

        @NotBlank
        String skill,

        double weight,

        Instant versionTimestamp,

        boolean current
) {}
