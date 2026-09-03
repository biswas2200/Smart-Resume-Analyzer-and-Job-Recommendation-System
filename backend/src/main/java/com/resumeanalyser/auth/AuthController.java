package com.resumeanalyser.auth;

import com.resumeanalyser.auth.dto.AuthResponse;
import com.resumeanalyser.auth.dto.LoginRequest;
import com.resumeanalyser.auth.dto.RegisterRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The two public, unauthenticated entry points into the app: creating an
 * account and logging into one. Both are permitted through
 * {@link SecurityConfig} without a token; every other endpoint in the app requires one.
 */
@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    /**
     * Creates a new account.
     *
     * @param request the new account's email and password, validated by the {@code @Valid} constraints on {@link RegisterRequest}
     * @return 201 Created with a token for the new account; 409 (via {@link AuthExceptionHandler}) if the email is taken
     */
    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(authService.register(request));
    }

    /**
     * Logs into an existing account.
     *
     * @param request the login email and password
     * @return 200 OK with a fresh token; 401 (via {@link AuthExceptionHandler}) if the credentials are wrong
     */
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }
}
