package com.triomio.crm.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfAuthenticationStrategy;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
class AuthController {

    record LoginRequest(
            @NotBlank @Size(max = 254) String email,
            @NotBlank @Size(max = 128) String password) {}

    record ChangePasswordRequest(
            @NotBlank String currentPassword, @NotBlank String newPassword) {}

    record MeResponse(long id, String email, String fullName, Role role, boolean mustChangePassword) {
        static MeResponse of(CurrentUser user) {
            return new MeResponse(user.id(), user.email(), user.fullName(), user.role(), user.mustChangePassword());
        }
    }

    record CsrfResponse(String headerName, String token) {}

    private final AuthService auth;
    private final SecurityContextRepository contextRepository;
    private final CsrfAuthenticationStrategy csrfStrategy;

    AuthController(
            AuthService auth, SecurityContextRepository contextRepository, CookieCsrfTokenRepository csrfRepository) {
        this.auth = auth;
        this.contextRepository = contextRepository;
        this.csrfStrategy = new CsrfAuthenticationStrategy(csrfRepository);
    }

    /** Lets the SPA obtain the XSRF-TOKEN cookie before its first state-changing request (the sign-in itself). */
    @GetMapping("/csrf")
    CsrfResponse csrf(CsrfToken token) {
        return new CsrfResponse(token.getHeaderName(), token.getToken());
    }

    @PostMapping("/login")
    MeResponse login(@Valid @RequestBody LoginRequest body, HttpServletRequest request, HttpServletResponse response) {
        CurrentUser user = auth.login(body.email(), body.password(), request.getRemoteAddr());
        request.getSession(true);
        request.changeSessionId();
        signIn(user, request, response);
        return MeResponse.of(user);
    }

    @GetMapping("/me")
    MeResponse me(@AuthenticationPrincipal CurrentUser user) {
        return MeResponse.of(user);
    }

    @PostMapping("/password")
    MeResponse changePassword(
            @AuthenticationPrincipal CurrentUser user,
            @Valid @RequestBody ChangePasswordRequest body,
            HttpServletRequest request,
            HttpServletResponse response) {
        String sessionId = request.getSession(true).getId();
        CurrentUser updated = auth.changePassword(user, body.currentPassword(), body.newPassword(), sessionId);
        signIn(updated, request, response);
        return MeResponse.of(updated);
    }

    private void signIn(CurrentUser user, HttpServletRequest request, HttpServletResponse response) {
        Authentication authentication =
                UsernamePasswordAuthenticationToken.authenticated(user, null, user.getAuthorities());
        csrfStrategy.onAuthentication(authentication, request, response);
        if (request.getAttribute(CsrfToken.class.getName()) instanceof CsrfToken rotated) {
            rotated.getToken(); // the new token is lazy; render it now so this response already carries the cookie
        }
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        contextRepository.saveContext(context, request, response);
    }
}
