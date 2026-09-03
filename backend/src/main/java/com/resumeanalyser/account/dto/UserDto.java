package com.resumeanalyser.account.dto;

import com.resumeanalyser.account.UserRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public record UserDto(
        UUID id,

        @NotBlank
        @Email
        @Size(max = 320)
        String email,

        UserRole role,

        Instant createdAt
) {}
