package com.resumeanalyser.resume.dto;

import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

public record ParsedProfileDto(
        UUID id,

        @NotNull
        UUID resumeId,

        String name,
        String email,
        String phone,
        List<String> skills,
        List<ExperienceEntryDto> experience,
        List<EducationEntryDto> education
) {

    public record ExperienceEntryDto(String title, String organization, String duration, String description) {}

    public record EducationEntryDto(String degree, String institution, String year) {}
}
