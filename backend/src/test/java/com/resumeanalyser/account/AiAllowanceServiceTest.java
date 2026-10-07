package com.resumeanalyser.account;

import com.resumeanalyser.account.dto.AiAllowanceDto;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link AiAllowanceService}: the monthly counter, its lazy
 * reset at the month boundary, the atomic spend, and Premium's exemption.
 */
@ExtendWith(MockitoExtension.class)
class AiAllowanceServiceTest {

    private static final Clock MID_SEPTEMBER = Clock.fixed(Instant.parse("2026-09-14T10:00:00Z"), ZoneOffset.UTC);
    private static final TierProperties TIERS =
            new TierProperties(new TierProperties.Free(3, 3), new TierProperties.Premium(5));

    @Mock
    private UserRepository userRepository;

    private AiAllowanceService service(Clock clock) {
        return new AiAllowanceService(userRepository, TIERS, clock);
    }

    @Test
    void status_reportsThisMonthsUsage_andTheFirstOfNextMonthAsTheReset() {
        User user = freeUser("2026-09", 2);

        AiAllowanceDto status = service(MID_SEPTEMBER).status(user);

        assertThat(status).isEqualTo(new AiAllowanceDto(2, 3, LocalDate.of(2026, 10, 1)));
        assertThat(status.available()).isTrue();
    }

    @Test
    void status_treatsALastMonthCounterAsZero() {
        User user = freeUser("2026-08", 3);

        AiAllowanceDto status = service(MID_SEPTEMBER).status(user);

        assertThat(status.used()).isZero();
        assertThat(status.available()).isTrue();
    }

    @Test
    void status_isNullForPremiumAndAdmin_whoAreNotMetered() {
        AiAllowanceService service = service(MID_SEPTEMBER);

        assertThat(service.status(userWithRole(UserRole.PREMIUM_USER))).isNull();
        assertThat(service.status(userWithRole(UserRole.ADMIN))).isNull();
        assertThat(service.available(userWithRole(UserRole.PREMIUM_USER))).isTrue();
    }

    @Test
    void available_isFalseOnceTheQuotaIsUsedUpThisMonth() {
        assertThat(service(MID_SEPTEMBER).available(freeUser("2026-09", 3))).isFalse();
        assertThat(service(MID_SEPTEMBER).available(freeUser("2026-09", 2))).isTrue();
    }

    @Test
    void consume_spendsOneCreditThroughTheConditionalUpdate() {
        User user = freeUser("2026-09", 1);
        when(userRepository.consumeAiAnalysis(user.getId(), "2026-09", 3)).thenReturn(1);

        AiAllowanceDto after = service(MID_SEPTEMBER).consume(user);

        assertThat(after.used()).isEqualTo(2);
        verify(userRepository, never()).startAiPeriod(any(), anyString());
    }

    @Test
    void consume_rollsTheCounterIntoTheNewMonthFirst() {
        User user = freeUser("2026-08", 3);
        when(userRepository.consumeAiAnalysis(user.getId(), "2026-09", 3)).thenReturn(1);

        AiAllowanceDto after = service(MID_SEPTEMBER).consume(user);

        verify(userRepository).startAiPeriod(user.getId(), "2026-09");
        assertThat(user.getAiPeriod()).isEqualTo("2026-09");
        assertThat(after.used()).isEqualTo(1);
    }

    @Test
    void consume_reportsTheQuotaWhenTheDatabaseRefusedTheSpend() {
        // A concurrent upload took the last credit between available() and consume().
        User user = freeUser("2026-09", 2);
        when(userRepository.consumeAiAnalysis(any(), anyString(), anyInt())).thenReturn(0);

        AiAllowanceDto after = service(MID_SEPTEMBER).consume(user);

        assertThat(after.used()).isEqualTo(3);
        assertThat(after.available()).isFalse();
    }

    @Test
    void consume_isANoOpForPremium() {
        assertThat(service(MID_SEPTEMBER).consume(userWithRole(UserRole.PREMIUM_USER))).isNull();
        verifyNoInteractions(userRepository);
    }

    private User freeUser(String period, int used) {
        User user = userWithRole(UserRole.USER);
        user.setAiPeriod(period);
        user.setAiAnalysesUsed(used);
        return user;
    }

    private User userWithRole(UserRole role) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setRole(role);
        return user;
    }
}
