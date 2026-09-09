package com.resumeanalyser.client;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/**
 * Builds the {@link RestClient} {@link MlServiceClient} uses to call the ML
 * service, pointed at {@code app.ml-service.base-url} (the FastAPI app in
 * {@code ml-service/app/main.py}).
 */
@Configuration
public class MlServiceClientConfig {

    @Bean
    public RestClient mlServiceRestClient(@Value("${app.ml-service.base-url}") String baseUrl) {
        return RestClient.builder().baseUrl(baseUrl).build();
    }
}
