package com.resumeanalyser.account;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * What each tier gets from the analysis pipeline ({@code app.tiers.*} in
 * application.yml). Engineering & Technology runs on the local engine and is
 * unlimited for every tier; fields that need the AI engine are metered for
 * free accounts by {@link AiAllowanceService} and unlimited for Premium.
 *
 * @param free    the USER tier's limits
 * @param premium the PREMIUM_USER / ADMIN tier's limits
 */
@ConfigurationProperties(prefix = "app.tiers")
public record TierProperties(Free free, Premium premium) {

    /**
     * @param aiAnalysesPerMonth paid AI extractions a free account may spend per calendar month
     * @param topN               role matches shown to a free account
     */
    public record Free(int aiAnalysesPerMonth, int topN) {}

    /** @param topN role matches shown to a Premium account */
    public record Premium(int topN) {}

    public int topNFor(UserRole role) {
        return role == UserRole.USER ? free.topN() : premium.topN();
    }
}
