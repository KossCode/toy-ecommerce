package com.triomio.crm.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.triomio.crm.TestcontainersConfiguration;
import jakarta.servlet.http.Cookie;
import java.util.Arrays;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;

/**
 * The SPA's own CSRF handshake, without spring-security-test's csrf() post-processor: that helper swaps the token
 * repository of the shared context for a session-based one, so this class runs in a context of its own.
 */
@SpringBootTest(properties = "test.context=csrf-flow")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class CsrfFlowTests {

    static final String PASSWORD = "T-" + UUID.randomUUID();

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    UserAccounts users;

    @Autowired
    PasswordEncoder encoder;

    @Autowired
    JsonMapper json;

    @Test
    void loginWithoutCsrfTokenIsRejected() throws Exception {
        String email = manager();
        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(email, PASSWORD)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
    }

    @Test
    void spaHandshakeCreatesSecureSessionStoredInDatabase() throws Exception {
        String email = manager();

        MockHttpServletResponse csrf = mvc.perform(get("/api/auth/csrf"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse();
        Cookie xsrf = csrf.getCookie("XSRF-TOKEN");
        assertThat(xsrf).isNotNull();
        assertThat(xsrf.isHttpOnly()).isFalse();
        assertThat(xsrf.getSecure()).isTrue();
        assertThat(csrf.getCookie("SESSION")).as("no session before sign-in").isNull();

        MockHttpServletResponse login = mvc.perform(post("/api/auth/login")
                        .cookie(xsrf)
                        .header("X-XSRF-TOKEN", xsrf.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(" " + email.toUpperCase() + " ", PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email))
                .andExpect(jsonPath("$.role").value("MANAGER"))
                .andReturn()
                .getResponse();

        Cookie session = login.getCookie("SESSION");
        assertThat(session).isNotNull();
        assertThat(session.isHttpOnly()).isTrue();
        assertThat(session.getSecure()).isTrue();
        assertThat(session.getAttribute("SameSite")).isEqualToIgnoringCase("Lax");
        assertThat(jdbc.sql("SELECT count(*) FROM spring_session WHERE principal_name = :email")
                        .param("email", email)
                        .query(Integer.class)
                        .single())
                .isEqualTo(1);

        mvc.perform(get("/api/auth/me").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email));

        Cookie rotated = Arrays.stream(login.getCookies())
                .filter(cookie -> cookie.getName().equals("XSRF-TOKEN"))
                .reduce((cleared, issued) -> issued)
                .orElseThrow();
        assertThat(rotated.getValue()).isNotBlank().isNotEqualTo(xsrf.getValue());
        mvc.perform(post("/api/auth/logout").cookie(session, rotated).header("X-XSRF-TOKEN", rotated.getValue()))
                .andExpect(status().isNoContent());
    }

    private String manager() {
        String email = "csrf-" + UUID.randomUUID() + "@test.local";
        long id = users.insert(email, encoder.encode(PASSWORD), "CSRF test", Role.MANAGER);
        users.updatePassword(id, encoder.encode(PASSWORD), false);
        return email;
    }

    private String credentials(String email, String password) {
        return json.writeValueAsString(Map.of("email", email, "password", password));
    }
}
