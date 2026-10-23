package com.resumeanalyser.bugreport.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * @param issue an issue of the configured repository: its number ("42", "#42") or its URL
 * @param note  optional, shown to the reporter
 */
public record LinkRequest(@NotBlank @Size(max = 300) String issue, @Size(max = 500) String note) {}
