package com.triomio.crm.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.csrf.CsrfException;
import tools.jackson.databind.json.JsonMapper;

/** problem+json for errors raised by the security filter chain, before any controller is involved. */
final class SecurityProblems {

    private static final Map<Integer, String> TITLES =
            Map.of(401, "Потрібен вхід", 403, "Недостатньо прав", 429, "Забагато спроб");

    private final JsonMapper json;

    SecurityProblems(JsonMapper json) {
        this.json = json;
    }

    AuthenticationEntryPoint entryPoint() {
        return (request, response, ex) ->
                write(request, response, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Увійдіть, щоб продовжити.");
    }

    AccessDeniedHandler accessDenied() {
        return (request, response, ex) -> {
            if (ex instanceof CsrfException) {
                write(
                        request,
                        response,
                        HttpStatus.FORBIDDEN,
                        "CSRF_INVALID",
                        "Сесія застаріла. Оновіть сторінку та спробуйте ще раз.");
            } else {
                write(request, response, HttpStatus.FORBIDDEN, "FORBIDDEN", "Ця дія доступна лише власнику.");
            }
        };
    }

    void write(HttpServletRequest request, HttpServletResponse response, HttpStatus status, String code, String detail)
            throws IOException {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(TITLES.getOrDefault(status.value(), status.getReasonPhrase()));
        problem.setProperty("code", code);
        problem.setInstance(java.net.URI.create(request.getRequestURI()));
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        json.writeValue(response.getOutputStream(), problem);
    }
}
