package com.triomio.crm.auth;

import com.triomio.crm.auth.UserAccounts.UserAccount;
import com.triomio.crm.shared.ApiProblemException;
import java.time.OffsetDateTime;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** "Користувачі" in settings: owner-only (docs/backend/06-auth-and-roles.md §3). */
@Service
@PreAuthorize("hasRole('OWNER')")
public class UserManagementService {

    public record UserView(
            long id,
            String email,
            String fullName,
            Role role,
            boolean active,
            boolean mustChangePassword,
            @Nullable OffsetDateTime lastLoginAt) {

        static UserView of(UserAccount account) {
            return new UserView(
                    account.id(),
                    account.email(),
                    account.fullName(),
                    account.role(),
                    account.active(),
                    account.mustChangePassword(),
                    account.lastLoginAt());
        }
    }

    /** The temporary password is returned once, to the owner's browser, and is never logged. */
    public record IssuedPassword(UserView user, String temporaryPassword) {}

    private final UserAccounts users;
    private final PasswordPolicy policy;
    private final PasswordEncoder encoder;
    private final ApplicationEventPublisher events;

    UserManagementService(
            UserAccounts users, PasswordPolicy policy, PasswordEncoder encoder, ApplicationEventPublisher events) {
        this.users = users;
        this.policy = policy;
        this.encoder = encoder;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public List<UserView> list() {
        return users.findAll().stream().map(UserView::of).toList();
    }

    @Transactional
    public IssuedPassword create(CurrentUser actor, String email, String fullName, Role role) {
        String normalized = AuthService.normalize(email);
        if (users.findByEmail(normalized).isPresent()) {
            throw new ApiProblemException(HttpStatus.CONFLICT, "EMAIL_TAKEN", "Користувач з таким email вже існує.");
        }
        String temporary = policy.temporary();
        long id = users.insert(normalized, encoder.encode(temporary), fullName.strip(), role);
        events.publishEvent(
                new UserAuditEvent(actor.id(), id, "Створено користувача " + normalized + " (" + role + ")"));
        return new IssuedPassword(UserView.of(users.findById(id).orElseThrow()), temporary);
    }

    @Transactional
    public UserView update(
            CurrentUser actor, long id, @Nullable String fullName, @Nullable Role role, @Nullable Boolean active) {
        UserAccount current = find(id);
        Role newRole = role == null ? current.role() : role;
        boolean newActive = active == null ? current.active() : active;
        String newName = fullName == null || fullName.isBlank() ? current.fullName() : fullName.strip();

        boolean losesAccess = newRole != current.role() || (current.active() && !newActive);
        if (id == actor.id() && losesAccess) {
            throw new ApiProblemException(
                    HttpStatus.CONFLICT, "SELF_LOCKOUT", "Не можна змінити роль або вимкнути власний обліковий запис.");
        }
        boolean wasActiveOwner = current.role() == Role.OWNER && current.active();
        boolean staysActiveOwner = newRole == Role.OWNER && newActive;
        if (wasActiveOwner && !staysActiveOwner && users.countActiveOwners() <= 1) {
            throw new ApiProblemException(
                    HttpStatus.CONFLICT, "LAST_OWNER", "У системі має залишитися хоча б один власник.");
        }

        users.update(id, newName, newRole, newActive);
        if (losesAccess) {
            users.deleteSessions(current.email());
        }
        if (newRole != current.role()) {
            events.publishEvent(new UserAuditEvent(
                    actor.id(), id, "Роль " + current.email() + ": " + current.role() + " → " + newRole));
        }
        if (newActive != current.active()) {
            events.publishEvent(
                    new UserAuditEvent(actor.id(), id, (newActive ? "Увімкнено " : "Вимкнено ") + current.email()));
        }
        return UserView.of(find(id));
    }

    @Transactional
    public IssuedPassword resetPassword(CurrentUser actor, long id) {
        UserAccount account = find(id);
        if (id == actor.id()) {
            throw new ApiProblemException(
                    HttpStatus.CONFLICT, "SELF_RESET", "Власний пароль змінюється в профілі, а не скиданням.");
        }
        String temporary = policy.temporary();
        users.updatePassword(id, encoder.encode(temporary), true);
        users.deleteSessions(account.email());
        events.publishEvent(new UserAuditEvent(actor.id(), id, "Скинуто пароль " + account.email()));
        return new IssuedPassword(UserView.of(find(id)), temporary);
    }

    private UserAccount find(long id) {
        return users.findById(id)
                .orElseThrow(() ->
                        new ApiProblemException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "Користувача не знайдено."));
    }
}
