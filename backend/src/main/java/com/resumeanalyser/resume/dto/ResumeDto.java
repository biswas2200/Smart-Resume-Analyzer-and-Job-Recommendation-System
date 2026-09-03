package com.resumeanalyser.resume.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import java.time.Instant;
import java.util.UUID;

public record ResumeDto(
        UUID id,

        @NotNull
        UUID userId,

        @NotBlank
        String fileRef,

        @PositiveOrZero
        int version,

        Instant uploadedAt
) {}
