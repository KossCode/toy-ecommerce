package com.triomio.crm.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Two rules the servlet container cannot express: a session lives at most 7 days regardless of activity, and a user
 * with a temporary password can only reach /api/auth/** until they change it.
 */
class SessionPolicyFilter extends OncePerRequestFilter {

    static final Duration MAX_SESSION_AGE = Duration.ofDays(7);

    private final SecurityProblems problems;
    private final Clock clock;

    SessionPolicyFilter(SecurityProblems problems, Clock clock) {
        this.problems = problems;
        this.clock = clock;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof CurrentUser user) {
            HttpSession session = request.getSession(false);
            if (session != null && clock.millis() - session.getCreationTime() > MAX_SESSION_AGE.toMillis()) {
                session.invalidate();
                SecurityContextHolder.clearContext();
                problems.write(
                        request,
                        response,
                        HttpStatus.UNAUTHORIZED,
                        "SESSION_EXPIRED",
                        "Сесія завершилась. Увійдіть знову.");
                return;
            }
            String path = request.getRequestURI();
            if (user.mustChangePassword() && path.startsWith("/api/") && !path.startsWith("/api/auth/")) {
                problems.write(
                        request,
                        response,
                        HttpStatus.FORBIDDEN,
                        "PASSWORD_CHANGE_REQUIRED",
                        "Змініть тимчасовий пароль, щоб продовжити.");
                return;
            }
        }
        chain.doFilter(request, response);
    }
}
