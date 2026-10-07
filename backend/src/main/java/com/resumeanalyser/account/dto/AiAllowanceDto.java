package com.resumeanalyser.account.dto;

import java.time.LocalDate;

/**
 * A free account's monthly AI-analysis allowance, as the client sees it (on
 * {@code GET /auth/me} and the dashboard): how many of this month's AI
 * extractions are spent, how many the tier grants, and when the counter
 * resets. Premium accounts have no allowance -- the field is null for them.
 *
 * @param used     AI analyses spent this calendar month (UTC)
 * @param quota    AI analyses the free tier grants per month
 * @param resetsOn the first day of next month (UTC), when {@code used} returns to 0
 */
public record AiAllowanceDto(int used, int quota, LocalDate resetsOn) {

    public boolean available() {
        return used < quota;
    }
}
