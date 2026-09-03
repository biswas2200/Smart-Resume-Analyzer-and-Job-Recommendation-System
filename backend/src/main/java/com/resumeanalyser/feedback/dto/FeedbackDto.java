package com.resumeanalyser.feedback.dto;

import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.UUID;

public record FeedbackDto(
        UUID id,

        @NotNull
        UUID recommendationId,

        UUID skillVectorVersionId,

        boolean helpful,

        Instant createdAt
) {}
