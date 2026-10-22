package com.triomio.crm.auth;

import com.triomio.crm.auth.UserAccounts.UserAccount;
import java.util.Optional;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Backs the server-side create-owner command; there is no HTTP endpoint for it. */
@Service
class OwnerProvisioning {

    enum Outcome {
        CREATED,
        RESET
    }

    private final UserAccounts users;
    private final PasswordPolicy policy;
    private final PasswordEncoder encoder;
    private final ApplicationEventPublisher events;

    OwnerProvisioning(
            UserAccounts users, PasswordPolicy policy, PasswordEncoder encoder, ApplicationEventPublisher events) {
        this.users = users;
        this.policy = policy;
        this.encoder = encoder;
        this.events = events;
    }

    /** The password is temporary: the owner must change it at first sign-in. */
    @Transactional
    Outcome createOrReset(String email, String fullName, String temporaryPassword, boolean reset) {
        String normalized = AuthService.normalize(email);
        if (!normalized.contains("@")) {
            throw new IllegalArgumentException("Невірний email: " + email);
        }
        policy.check(temporaryPassword, normalized);
        Optional<UserAccount> existing = users.findByEmail(normalized);
        if (existing.isPresent()) {
            UserAccount account = existing.get();
            if (!reset) {
                throw new IllegalStateException(
                        "Користувач " + normalized + " вже існує. Для скидання пароля додайте --reset.");
            }
            if (account.role() != Role.OWNER) {
                throw new IllegalStateException("Користувач " + normalized + " не є власником.");
            }
            users.updatePassword(account.id(), encoder.encode(temporaryPassword), true);
            users.update(account.id(), account.fullName(), Role.OWNER, true);
            users.deleteSessions(normalized);
            events.publishEvent(new UserAuditEvent(null, account.id(), "Пароль власника скинуто командою на сервері"));
            return Outcome.RESET;
        }
        if (reset) {
            throw new IllegalStateException("Власника " + normalized + " не знайдено.");
        }
        long id = users.insert(normalized, encoder.encode(temporaryPassword), fullName, Role.OWNER);
        events.publishEvent(new UserAuditEvent(null, id, "Власника створено командою на сервері"));
        return Outcome.CREATED;
    }
}
