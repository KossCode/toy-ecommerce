package com.triomio.crm.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.triomio.crm.TestcontainersConfiguration;
import com.triomio.crm.shared.ApiProblemException;
import jakarta.servlet.http.Cookie;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Uses the csrf() post-processor for brevity; the real browser CSRF flow is covered by {@link CsrfFlowTests}. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class AuthTests {

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

    @Autowired
    OwnerProvisioning provisioning;

    @Test
    void apiWithoutSessionIs401Problem() throws Exception {
        mvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void wrongPasswordAndUnknownEmailLookTheSame() throws Exception {
        String email = user(Role.MANAGER, false);
        JsonNode wrongPassword = problem(login(email, "Wrong-password-123"), 401);
        JsonNode unknownEmail = problem(login("nobody-" + UUID.randomUUID() + "@test.local", PASSWORD), 401);

        assertThat(wrongPassword.get("code").asString()).isEqualTo("BAD_CREDENTIALS");
        assertThat(unknownEmail.get("code")).isEqualTo(wrongPassword.get("code"));
        assertThat(unknownEmail.get("detail")).isEqualTo(wrongPassword.get("detail"));
        assertThat(unknownEmail.get("title")).isEqualTo(wrongPassword.get("title"));
    }

    @Test
    void disabledUserCannotSignIn() throws Exception {
        String email = user(Role.MANAGER, false);
        jdbc.sql("UPDATE users SET is_active = false WHERE email = :email")
                .param("email", email)
                .update();
        assertThat(problem(login(email, PASSWORD), 401).get("code").asString()).isEqualTo("BAD_CREDENTIALS");
    }

    @Test
    void fiveFailuresBlockEvenTheCorrectPassword() throws Exception {
        String email = user(Role.MANAGER, false);
        for (int i = 0; i < LoginThrottle.MAX_FAILURES; i++) {
            problem(login(email, "Wrong-password-123"), 401);
        }
        JsonNode blocked = problem(login(email, PASSWORD), 429);
        assertThat(blocked.get("code").asString()).isEqualTo("TOO_MANY_ATTEMPTS");
        assertThat(audit(users.findByEmail(email).orElseThrow().id(), "Невдалий вхід%"))
                .isEqualTo(LoginThrottle.MAX_FAILURES);
    }

    @Test
    void temporaryPasswordMustBeChangedBeforeUsingTheApi() throws Exception {
        String email = user(Role.OWNER, true);
        Cookie session = signIn(email, PASSWORD);

        mvc.perform(get("/api/users").cookie(session))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PASSWORD_CHANGE_REQUIRED"));
        mvc.perform(get("/api/auth/me").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mustChangePassword").value(true));

        mvc.perform(post("/api/auth/password")
                        .cookie(session)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(passwordChange(PASSWORD, "password1234")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("WEAK_PASSWORD"));

        mvc.perform(post("/api/auth/password")
                        .cookie(session)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(passwordChange(PASSWORD, "Nova-Vesna-Dnipro-2026")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mustChangePassword").value(false));

        mvc.perform(get("/api/users").cookie(session)).andExpect(status().isOk());
        problem(login(email, PASSWORD), 401);
    }

    @Test
    void managerCannotManageUsers() throws Exception {
        Cookie session = signIn(user(Role.MANAGER, false), PASSWORD);
        mvc.perform(get("/api/users").cookie(session))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mvc.perform(post("/api/users")
                        .cookie(session)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(newUser("x-" + UUID.randomUUID() + "@test.local", "MANAGER")))
                .andExpect(status().isForbidden());
    }

    @Test
    void ownerCreatesManagerAndDisablingEndsTheirSessions() throws Exception {
        Cookie owner = signIn(user(Role.OWNER, false), PASSWORD);
        String managerEmail = "m-" + UUID.randomUUID() + "@test.local";

        JsonNode created = json.readTree(mvc.perform(post("/api/users")
                        .cookie(owner)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(newUser(managerEmail, "MANAGER")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.user.mustChangePassword").value(true))
                .andReturn()
                .getResponse()
                .getContentAsString());
        long managerId = created.get("user").get("id").asLong();
        String temporary = created.get("temporaryPassword").asString();
        assertThat(temporary).hasSize(16);

        Cookie manager = signIn(managerEmail, temporary);
        assertThat(sessionsOf(managerEmail)).isEqualTo(1);

        mvc.perform(patch("/api/users/" + managerId)
                        .cookie(owner)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"active\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false));

        assertThat(sessionsOf(managerEmail)).isZero();
        mvc.perform(get("/api/auth/me").cookie(manager)).andExpect(status().isUnauthorized());
        assertThat(audit(managerId, "Створено користувача%")).isEqualTo(1);
        assertThat(audit(managerId, "Вимкнено%")).isEqualTo(1);
    }

    @Test
    void ownerCannotLockThemselvesOut() throws Exception {
        String email = user(Role.OWNER, false);
        long id = users.findByEmail(email).orElseThrow().id();
        Cookie owner = signIn(email, PASSWORD);
        mvc.perform(patch("/api/users/" + id)
                        .cookie(owner)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"MANAGER\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SELF_LOCKOUT"));
    }

    @Test
    void sessionOlderThanSevenDaysIsRejected() throws Exception {
        String email = user(Role.MANAGER, false);
        Cookie session = signIn(email, PASSWORD);
        jdbc.sql("UPDATE spring_session SET creation_time = creation_time - :age WHERE principal_name = :email")
                .param("age", SessionPolicyFilter.MAX_SESSION_AGE.plusMinutes(1).toMillis())
                .param("email", email)
                .update();

        mvc.perform(get("/api/auth/me").cookie(session))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("SESSION_EXPIRED"));
        assertThat(sessionsOf(email)).isZero();
    }

    @Test
    void logoutRemovesTheSession() throws Exception {
        String email = user(Role.MANAGER, false);
        Cookie session = signIn(email, PASSWORD);
        mvc.perform(post("/api/auth/logout").cookie(session).with(csrf())).andExpect(status().isNoContent());
        assertThat(sessionsOf(email)).isZero();
        mvc.perform(get("/api/auth/me").cookie(session)).andExpect(status().isUnauthorized());
    }

    @Test
    void ownerProvisioningCreatesAndResets() {
        String email = "owner-" + UUID.randomUUID() + "@test.local";
        assertThat(provisioning.createOrReset(email, "Власник", PASSWORD, false))
                .isEqualTo(OwnerProvisioning.Outcome.CREATED);
        assertThat(users.findByEmail(email).orElseThrow())
                .returns(Role.OWNER, UserAccounts.UserAccount::role)
                .returns(true, UserAccounts.UserAccount::mustChangePassword);

        assertThatThrownBy(() -> provisioning.createOrReset(email, "Власник", PASSWORD, false))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> provisioning.createOrReset(email, "Власник", "short", true))
                .isInstanceOf(ApiProblemException.class);
        assertThat(provisioning.createOrReset(email, "Власник", "Inshyi-Tymchasovyi-77", true))
                .isEqualTo(OwnerProvisioning.Outcome.RESET);
        assertThat(encoder.matches(
                        "Inshyi-Tymchasovyi-77",
                        users.findByEmail(email).orElseThrow().passwordHash()))
                .isTrue();
    }

    private String user(Role role, boolean mustChange) {
        String email = role.name().toLowerCase() + "-" + UUID.randomUUID() + "@test.local";
        long id = users.insert(email, encoder.encode(PASSWORD), "Test " + role, role);
        users.updatePassword(id, encoder.encode(PASSWORD), mustChange);
        return email;
    }

    private Cookie signIn(String email, String password) throws Exception {
        Cookie session = login(email, password)
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getCookie("SESSION");
        assertThat(session).isNotNull();
        return session;
    }

    private ResultActions login(String email, String password) throws Exception {
        return mvc.perform(post("/api/auth/login")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(credentials(email, password)));
    }

    private JsonNode problem(ResultActions result, int status) throws Exception {
        return json.readTree(result.andExpect(status().is(status))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andReturn()
                .getResponse()
                .getContentAsString());
    }

    private int sessionsOf(String email) {
        return jdbc.sql("SELECT count(*) FROM spring_session WHERE principal_name = :email")
                .param("email", email)
                .query(Integer.class)
                .single();
    }

    private int audit(long userId, String messagePattern) {
        return jdbc.sql("""
                        SELECT count(*) FROM audit_log
                        WHERE entity_type = 'USER' AND kind = 'USERS' AND entity_id = :id AND message LIKE :pattern
                        """)
                .param("id", userId)
                .param("pattern", messagePattern)
                .query(Integer.class)
                .single();
    }

    private String credentials(String email, String password) {
        return json.writeValueAsString(Map.of("email", email, "password", password));
    }

    private String passwordChange(String current, String next) {
        return json.writeValueAsString(Map.of("currentPassword", current, "newPassword", next));
    }

    private String newUser(String email, String role) {
        return json.writeValueAsString(Map.of("email", email, "fullName", "Новий менеджер", "role", role));
    }
}
