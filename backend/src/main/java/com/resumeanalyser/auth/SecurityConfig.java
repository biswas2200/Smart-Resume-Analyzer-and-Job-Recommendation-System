package com.resumeanalyser.auth;

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

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
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
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/auth/register", "/auth/login").permitAll()
                        .anyRequest().authenticated())
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
