package com.resumeanalyser.account;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * What each tier gets from the analysis pipeline ({@code app.tiers.*} in
 * application.yml). Engineering & Technology runs on the local engine and is
 * unlimited for every tier; fields that need the AI engine are metered for
 * free accounts by {@link AiAllowanceService} and unlimited for Premium.
 * <p>
 * While {@code previewMode} is on, every account -- USER included -- is
 * treated as Premium: the 0.x preview waives Premium until the beta, so demos
 * and early users see the whole product. Roles are left untouched, so turning
 * it off restores the Free/Premium split with no data change. Every Premium
 * decision goes through {@link #isPremium}, never a raw role check.
 *
 * @param free        the USER tier's limits
 * @param premium     the PREMIUM_USER / ADMIN tier's limits
 * @param previewMode when true, every account gets Premium
 */
@ConfigurationProperties(prefix = "app.tiers")
public record TierProperties(Free free, Premium premium, boolean previewMode) {

    /**
     * @param aiAnalysesPerMonth paid AI extractions a free account may spend per calendar month
     * @param topN               role matches shown to a free account
     */
    public record Free(int aiAnalysesPerMonth, int topN) {}

    /** @param topN role matches shown to a Premium account */
    public record Premium(int topN) {}

    /** Whether an account with this role gets Premium right now (always, in preview mode). */
    public boolean isPremium(UserRole role) {
        return previewMode || role != UserRole.USER;
    }

    /** The ML service's tier name for this role: {@code "premium"} or {@code "free"}. */
    public String tierFor(UserRole role) {
        return isPremium(role) ? "premium" : "free";
    }

    public int topNFor(UserRole role) {
        return isPremium(role) ? premium.topN() : free.topN();
    }
}
