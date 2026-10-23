package com.resumeanalyser.bugreport.dto;

import jakarta.validation.constraints.Size;

/** @param note why, shown to the reporter (optional) */
public record RejectRequest(@Size(max = 500) String note) {}
