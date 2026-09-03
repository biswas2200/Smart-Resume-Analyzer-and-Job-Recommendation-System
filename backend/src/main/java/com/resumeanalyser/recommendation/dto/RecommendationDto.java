package com.resumeanalyser.recommendation.dto;

import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.UUID;

public record RecommendationDto(
        UUID id,

        @NotNull
        UUID userId,

        @NotNull
        UUID roleId,

        double matchScore,

        Instant createdAt
) {}
