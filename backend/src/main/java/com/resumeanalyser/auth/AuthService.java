package com.resumeanalyser.auth;

import com.resumeanalyser.account.User;
import com.resumeanalyser.account.UserRepository;
import com.resumeanalyser.account.dto.UserDto;
import com.resumeanalyser.auth.dto.AuthResponse;
import com.resumeanalyser.auth.dto.LoginRequest;
import com.resumeanalyser.auth.dto.RegisterRequest;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Business logic behind the two public auth endpoints: creating a new account
 * and logging into an existing one. Both end the same way -- a signed JWT handed
 * back to the caller -- so that shared step lives in {@link #issueToken}.
 */
@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;

    public AuthService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            AuthenticationManager authenticationManager,
            JwtService jwtService
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
    }

    /**
     * Creates a new account and immediately logs it in (returns a usable token,
     * so the caller doesn't have to make a second request to log in right after registering).
     *
     * @param request the new user's email and chosen plaintext password
     * @return a token for the newly created account
     * @throws EmailAlreadyInUseException if the email is already registered
     */
    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new EmailAlreadyInUseException(request.email());
        }

        User user = new User();
        user.setEmail(request.email());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user = userRepository.save(user);

        return issueToken(user);
    }

    /**
     * Verifies a login attempt's credentials and, if they check out, issues a fresh token.
     *
     * @param request the email/password being submitted
     * @return a token for the authenticated account
     * @throws org.springframework.security.authentication.BadCredentialsException if the email or password is wrong
     */
    public AuthResponse login(LoginRequest request) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.email(), request.password()));

        UserDetails principal = (UserDetails) authentication.getPrincipal();
        User user = userRepository.findByEmail(principal.getUsername())
                .orElseThrow(() -> new IllegalStateException("Authenticated user vanished: " + principal.getUsername()));

        return issueToken(user);
    }

    /**
     * Builds the JWT + user-info response shared by both register and login.
     *
     * @param user the account to issue a token for
     * @return the token, its expiry, and a public-safe view of the account
     */
    private AuthResponse issueToken(User user) {
        UserDetails userDetails = org.springframework.security.core.userdetails.User
                .withUsername(user.getEmail())
                .password(user.getPasswordHash())
                .authorities("ROLE_" + user.getRole().name())
                .build();

        String token = jwtService.generateToken(userDetails);
        UserDto userDto = new UserDto(user.getId(), user.getEmail(), user.getRole(), user.getCreatedAt());

        return AuthResponse.bearer(token, jwtService.extractExpiration(token), userDto);
    }
}
