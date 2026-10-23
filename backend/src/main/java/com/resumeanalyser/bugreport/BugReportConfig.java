package com.resumeanalyser.bugreport;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/** Registers {@link BugReportProperties}. */
@Configuration
@EnableConfigurationProperties(BugReportProperties.class)
public class BugReportConfig {}
