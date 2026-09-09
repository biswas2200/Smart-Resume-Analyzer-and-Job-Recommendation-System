package com.resumeanalyser.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import java.util.List;

/**
 * Central Spring Security setup for the whole app: this is the one place that
 * decides *whether a request is authenticated at all* (stateless JWT, no
 * sessions, no CSRF -- see {@link #securityFilterChain}). It intentionally does
 * NOT decide *which role can access which endpoint* -- with
 * {@link EnableMethodSecurity} turned on, each module declares that on its own
 * endpoints with {@code @PreAuthorize(...)}, so this class doesn't grow a giant
 * list of every URL in the app.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    @Value("${app.cors.allowed-origins}")
    private String allowedOrigins;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
    }

    /**
     * Allows the frontend's own origin (a different port during local dev, since
     * this is a browser SPA calling a separate API) to call this API at all --
     * without this, the browser's own CORS check would block every request
     * before it ever reaches Spring Security's auth checks below.
     *
     * @return a CORS configuration applied to every endpoint, allowing the
     *         configured origin(s) ({@code app.cors.allowed-origins}) to send
     *         any method/header, including the {@code Authorization} bearer token
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(List.of(allowedOrigins.split(",")));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    /**
     * The hashing algorithm used for every stored password (NFR-2.2: never store plaintext).
     *
     * @return a BCrypt-based password encoder
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * Exposes Spring Security's authentication manager as a bean so {@link AuthService}
     * can use it directly to verify login credentials.
     *
     * @param config Spring Security's own authentication configuration
     * @return the application's authentication manager
     */
    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    /**
     * Defines the HTTP security rules applied to every request:
     * no CSRF (this is a stateless bearer-token API, not cookie-based, so CSRF doesn't apply),
     * no server-side sessions, registration/login are public, everything else requires
     * a valid JWT (checked by {@link JwtAuthenticationFilter}, which runs before
     * Spring's own username/password filter).
     *
     * @param http Spring Security's HTTP configuration builder
     * @return the assembled filter chain
     */
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/auth/register", "/auth/login").permitAll()
                        .anyRequest().authenticated())
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
