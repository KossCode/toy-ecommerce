package com.triomio.crm.auth;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** At most 5 failed attempts per email + IP in 15 minutes; a successful sign-in resets the counter. */
@Component
class LoginThrottle {

    static final int MAX_FAILURES = 5;

    private final JdbcClient jdbc;

    LoginThrottle(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    boolean isBlocked(String email, String ip) {
        int failures = jdbc.sql("""
                        SELECT count(*) FROM login_attempts a
                        WHERE a.email = :email AND a.ip = :ip AND NOT a.success
                          AND a.at > greatest(
                              now() - interval '15 minutes',
                              coalesce((SELECT max(s.at) FROM login_attempts s
                                        WHERE s.email = :email AND s.ip = :ip AND s.success), '-infinity'))
                        """)
                .param("email", email)
                .param("ip", ip)
                .query(Integer.class)
                .single();
        return failures >= MAX_FAILURES;
    }

    void record(String email, String ip, boolean success) {
        jdbc.sql("INSERT INTO login_attempts (email, ip, success) VALUES (:email, :ip, :success)")
                .param("email", email)
                .param("ip", ip)
                .param("success", success)
                .update();
    }
}
