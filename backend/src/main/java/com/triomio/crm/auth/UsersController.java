package com.triomio.crm.auth;

import com.triomio.crm.auth.UserManagementService.IssuedPassword;
import com.triomio.crm.auth.UserManagementService.UserView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
class UsersController {

    record CreateUserRequest(
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(max = 200) String fullName,
            @NotNull Role role) {}

    record UpdateUserRequest(
            @Nullable @Size(max = 200) String fullName,
            @Nullable Role role,
            @Nullable Boolean active) {}

    private final UserManagementService users;

    UsersController(UserManagementService users) {
        this.users = users;
    }

    @GetMapping
    List<UserView> list() {
        return users.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    IssuedPassword create(@AuthenticationPrincipal CurrentUser actor, @Valid @RequestBody CreateUserRequest body) {
        return users.create(actor, body.email(), body.fullName(), body.role());
    }

    @PatchMapping("/{id}")
    UserView update(
            @AuthenticationPrincipal CurrentUser actor,
            @PathVariable long id,
            @Valid @RequestBody UpdateUserRequest body) {
        return users.update(actor, id, body.fullName(), body.role(), body.active());
    }

    @PostMapping("/{id}/reset-password")
    IssuedPassword resetPassword(@AuthenticationPrincipal CurrentUser actor, @PathVariable long id) {
        return users.resetPassword(actor, id);
    }
}
