package com.triomio.crm.auth;

import com.triomio.crm.auth.UserAccounts.UserAccount;
import com.triomio.crm.shared.ApiProblemException;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    static final String BAD_CREDENTIALS = "Неправильний email або пароль.";

    private final UserAccounts users;
    private final LoginThrottle throttle;
    private final PasswordPolicy policy;
    private final PasswordEncoder encoder;
    private final ApplicationEventPublisher events;
    private final String dummyHash;

    AuthService(
            UserAccounts users,
            LoginThrottle throttle,
            PasswordPolicy policy,
            PasswordEncoder encoder,
            ApplicationEventPublisher events) {
        this.users = users;
        this.throttle = throttle;
        this.policy = policy;
        this.encoder = encoder;
        this.events = events;
        this.dummyHash = encoder.encode(UUID.randomUUID().toString());
    }

    /**
     * Unknown email, wrong password and disabled account produce the same answer, and an unknown email still pays for
     * one hash check so response time does not reveal which emails exist. Not transactional on purpose: the failed
     * attempt must be stored even though the call ends with an exception.
     */
    CurrentUser login(String email, String password, String ip) {
        String normalized = normalize(email);
        if (throttle.isBlocked(normalized, ip)) {
            events.publishEvent(new UserAuditEvent(null, null, "Вхід заблоковано: " + normalized + ", IP " + ip));
            throw new ApiProblemException(
                    HttpStatus.TOO_MANY_REQUESTS,
                    "TOO_MANY_ATTEMPTS",
                    "Забагато невдалих спроб. Спробуйте через 15 хвилин.");
        }
        Optional<UserAccount> account = users.findByEmail(normalized);
        boolean passwordMatches =
                encoder.matches(password, account.map(UserAccount::passwordHash).orElse(dummyHash));
        boolean ok = passwordMatches && account.map(UserAccount::active).orElse(false);
        throttle.record(normalized, ip, ok);
        if (!ok) {
            events.publishEvent(new UserAuditEvent(
                    null, account.map(UserAccount::id).orElse(null), "Невдалий вхід: " + normalized + ", IP " + ip));
            throw new ApiProblemException(HttpStatus.UNAUTHORIZED, "BAD_CREDENTIALS", BAD_CREDENTIALS);
        }
        UserAccount user = account.orElseThrow();
        users.markLogin(user.id());
        if (encoder.upgradeEncoding(user.passwordHash())) {
            users.updatePassword(user.id(), encoder.encode(password), user.mustChangePassword());
        }
        events.publishEvent(new UserAuditEvent(user.id(), user.id(), "Вхід, IP " + ip));
        return user.toCurrentUser();
    }

    @Transactional
    CurrentUser changePassword(CurrentUser user, String currentPassword, String newPassword, String currentSessionId) {
        UserAccount account = users.findById(user.id())
                .filter(UserAccount::active)
                .orElseThrow(() -> new ApiProblemException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", BAD_CREDENTIALS));
        if (!encoder.matches(currentPassword, account.passwordHash())) {
            throw new ApiProblemException(
                    HttpStatus.BAD_REQUEST, "BAD_CURRENT_PASSWORD", "Поточний пароль неправильний.");
        }
        if (encoder.matches(newPassword, account.passwordHash())) {
            throw new ApiProblemException(
                    HttpStatus.BAD_REQUEST, "WEAK_PASSWORD", "Новий пароль має відрізнятися від поточного.");
        }
        policy.check(newPassword, account.email());
        users.updatePassword(account.id(), encoder.encode(newPassword), false);
        users.deleteOtherSessions(account.email(), currentSessionId);
        events.publishEvent(new UserAuditEvent(account.id(), account.id(), "Змінено пароль"));
        return user.withPasswordChanged();
    }

    static String normalize(String email) {
        return email == null ? "" : email.strip().toLowerCase(Locale.ROOT);
    }
}
