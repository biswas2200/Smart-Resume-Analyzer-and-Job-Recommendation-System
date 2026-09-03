package com.resumeanalyser.recommendation.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.UUID;

public record RoleDto(
        UUID id,

        @NotBlank
        String title,

        String description
) {}
