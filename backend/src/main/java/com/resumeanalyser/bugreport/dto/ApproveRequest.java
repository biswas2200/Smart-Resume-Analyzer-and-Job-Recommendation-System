package com.resumeanalyser.bugreport.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** @param title the GitHub issue title, written by the reviewer */
public record ApproveRequest(@NotBlank @Size(max = 200) String title) {}
