package com.resumeanalyser.account;

import com.resumeanalyser.account.dto.AiAllowanceDto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;

/**
 * The free tier's monthly allowance of AI analyses (FR-12.9): how many paid
 * AI extractions a USER account may still spend this calendar month on
 * fields the local engine does not cover. The counter lives on the account
 * ({@link User#getAiPeriod()} / {@link User#getAiAnalysesUsed()}) and is
 * reset lazily -- a read in a new month sees 0 without a scheduled job.
 * <p>
 * Spending is a single conditional {@code UPDATE} ({@link UserRepository#consumeAiAnalysis})
 * so two concurrent uploads by the same account cannot both take the last
 * credit. Premium accounts are never metered: {@link #status} returns null
 * for them and {@link #consume} is a no-op.
 */
@Service
public class AiAllowanceService {

    private final UserRepository userRepository;
    private final TierProperties tiers;
    private final Clock clock;

    public AiAllowanceService(UserRepository userRepository, TierProperties tiers, Clock clock) {
        this.userRepository = userRepository;
        this.tiers = tiers;
        this.clock = clock;
    }

    /** This month's allowance for a free account, or null for a Premium/admin account (or in preview mode). */
    public AiAllowanceDto status(User user) {
        if (tiers.isPremium(user.getRole())) {
            return null;
        }
        YearMonth month = currentMonth();
        int used = month.toString().equals(user.getAiPeriod()) ? user.getAiAnalysesUsed() : 0;
        return new AiAllowanceDto(used, tiers.free().aiAnalysesPerMonth(), month.plusMonths(1).atDay(1));
    }

    /** Whether the account may spend one more AI analysis right now (always true for Premium). */
    public boolean available(User user) {
        AiAllowanceDto allowance = status(user);
        return allowance == null || allowance.available();
    }

    /**
     * Records one spent AI analysis for a free account -- called after the
     * ML service reports {@code ai_extraction_used} -- and returns the
     * updated allowance. Rolls the counter over first if the month changed
     * since the last spend. Returns null (and changes nothing) for Premium.
     */
    @Transactional
    public AiAllowanceDto consume(User user) {
        if (tiers.isPremium(user.getRole())) {
            return null;
        }
        String period = currentMonth().toString();
        if (!period.equals(user.getAiPeriod())) {
            userRepository.startAiPeriod(user.getId(), period);
            user.setAiPeriod(period);
            user.setAiAnalysesUsed(0);
        }
        int quota = tiers.free().aiAnalysesPerMonth();
        if (userRepository.consumeAiAnalysis(user.getId(), period, quota) == 1) {
            user.setAiAnalysesUsed(user.getAiAnalysesUsed() + 1);
        } else {
            // Lost a race for the last credit, or the caller ignored available():
            // report what the database holds rather than over-count locally.
            user.setAiAnalysesUsed(quota);
        }
        return status(user);
    }

    private YearMonth currentMonth() {
        return YearMonth.from(LocalDate.now(clock.withZone(ZoneOffset.UTC)));
    }
}
