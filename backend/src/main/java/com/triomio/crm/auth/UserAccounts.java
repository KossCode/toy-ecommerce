package com.triomio.crm.auth;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class UserAccounts {

    private static final String COLUMNS =
            "id, email, password_hash, full_name, role, is_active AS active, must_change_password, last_login_at";

    private final JdbcClient jdbc;

    UserAccounts(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    record UserAccount(
            long id,
            String email,
            String passwordHash,
            String fullName,
            Role role,
            boolean active,
            boolean mustChangePassword,
            OffsetDateTime lastLoginAt) {

        CurrentUser toCurrentUser() {
            return new CurrentUser(id, email, fullName, role, mustChangePassword);
        }
    }

    Optional<UserAccount> findByEmail(String email) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM users WHERE email = :email")
                .param("email", email)
                .query(UserAccount.class)
                .optional();
    }

    Optional<UserAccount> findById(long id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM users WHERE id = :id")
                .param("id", id)
                .query(UserAccount.class)
                .optional();
    }

    List<UserAccount> findAll() {
        return jdbc.sql("SELECT " + COLUMNS + " FROM users ORDER BY role, full_name")
                .query(UserAccount.class)
                .list();
    }

    long insert(String email, String passwordHash, String fullName, Role role) {
        return jdbc.sql("""
                        INSERT INTO users (email, password_hash, full_name, role, must_change_password)
                        VALUES (:email, :hash, :fullName, :role, true)
                        RETURNING id
                        """)
                .param("email", email)
                .param("hash", passwordHash)
                .param("fullName", fullName)
                .param("role", role.name())
                .query(Long.class)
                .single();
    }

    void updatePassword(long id, String passwordHash, boolean mustChange) {
        jdbc.sql("""
                        UPDATE users SET password_hash = :hash, must_change_password = :mustChange,
                            password_changed_at = now(), updated_at = now()
                        WHERE id = :id
                        """)
                .param("id", id)
                .param("hash", passwordHash)
                .param("mustChange", mustChange)
                .update();
    }

    void update(long id, String fullName, Role role, boolean active) {
        jdbc.sql("""
                        UPDATE users SET full_name = :fullName, role = :role, is_active = :active, updated_at = now()
                        WHERE id = :id
                        """)
                .param("id", id)
                .param("fullName", fullName)
                .param("role", role.name())
                .param("active", active)
                .update();
    }

    void markLogin(long id) {
        jdbc.sql("UPDATE users SET last_login_at = now() WHERE id = :id")
                .param("id", id)
                .update();
    }

    int countActiveOwners() {
        return jdbc.sql("SELECT count(*) FROM users WHERE role = 'OWNER' AND is_active")
                .query(Integer.class)
                .single();
    }

    /** Signs the user out everywhere: Spring Session JDBC indexes sessions by principal name (= email). */
    void deleteSessions(String email) {
        jdbc.sql("DELETE FROM spring_session WHERE principal_name = :email")
                .param("email", email)
                .update();
    }

    void deleteOtherSessions(String email, String currentSessionId) {
        jdbc.sql("DELETE FROM spring_session WHERE principal_name = :email AND session_id <> :current")
                .param("email", email)
                .param("current", currentSessionId)
                .update();
    }
}
