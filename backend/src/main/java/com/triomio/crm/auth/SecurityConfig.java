package com.triomio.crm.auth;

import java.time.Clock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.session.autoconfigure.DefaultCookieSerializerCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.context.DelegatingSecurityContextRepository;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import tools.jackson.databind.json.JsonMapper;

/**
 * Session cookie auth for the SPA on the same origin: no CORS, CSRF token in the XSRF-TOKEN cookie echoed back as
 * X-XSRF-TOKEN (docs/backend/06-auth-and-roles.md §1). Everything under /api requires a session except sign-in.
 */
@Configuration(proxyBeanMethods = false)
@EnableMethodSecurity
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
class SecurityConfig {

    @Bean
    SecurityContextRepository securityContextRepository() {
        return new DelegatingSecurityContextRepository(
                new RequestAttributeSecurityContextRepository(), new HttpSessionSecurityContextRepository());
    }

    @Bean
    CookieCsrfTokenRepository csrfTokenRepository(
            @Value("${server.servlet.session.cookie.secure:true}") boolean secureCookies) {
        CookieCsrfTokenRepository repository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        repository.setCookieCustomizer(
                cookie -> cookie.secure(secureCookies).sameSite("Lax").path("/"));
        return repository;
    }

    /** Boot copies server.servlet.session.cookie.* only with an embedded server; this holds for every deployment. */
    @Bean
    DefaultCookieSerializerCustomizer sessionCookie(
            @Value("${server.servlet.session.cookie.secure:true}") boolean secureCookies) {
        return serializer -> {
            serializer.setCookieName("SESSION");
            serializer.setUseHttpOnlyCookie(true);
            serializer.setUseSecureCookie(secureCookies);
            serializer.setSameSite("Lax");
        };
    }

    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            SecurityContextRepository contextRepository,
            CookieCsrfTokenRepository csrfRepository,
            JsonMapper json,
            Clock clock) {
        SecurityProblems problems = new SecurityProblems(json);
        http.csrf(csrf -> csrf.spa().csrfTokenRepository(csrfRepository))
                .securityContext(context -> context.securityContextRepository(contextRepository))
                .requestCache(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(logout -> logout.logoutUrl("/api/auth/logout")
                        .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)))
                .authorizeHttpRequests(auth -> auth.requestMatchers(HttpMethod.POST, "/api/auth/login")
                        .permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/auth/csrf")
                        .permitAll()
                        .requestMatchers("/api/docs", "/api/docs/**", "/api/swagger-ui/**")
                        .permitAll()
                        .requestMatchers("/api/**")
                        .authenticated()
                        .requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/info", "/healthz")
                        .permitAll()
                        .requestMatchers("/actuator/**")
                        .denyAll()
                        .anyRequest()
                        .permitAll())
                .exceptionHandling(errors -> errors.authenticationEntryPoint(problems.entryPoint())
                        .accessDeniedHandler(problems.accessDenied()))
                .addFilterBefore(new SessionPolicyFilter(problems, clock), AuthorizationFilter.class);
        return http.build();
    }
}
