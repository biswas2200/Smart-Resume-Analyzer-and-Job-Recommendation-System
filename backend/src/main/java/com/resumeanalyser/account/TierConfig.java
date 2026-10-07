package com.resumeanalyser.account;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import java.time.Clock;

/**
 * Binds {@code app.tiers.*} to {@link TierProperties} and supplies the clock
 * {@link AiAllowanceService} reads the current month from -- a bean so tests
 * can pin it to a fixed instant instead of waiting for a month to roll over.
 */
@Configuration
@EnableConfigurationProperties(TierProperties.class)
public class TierConfig {

    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
