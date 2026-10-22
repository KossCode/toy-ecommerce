package com.triomio.crm.auth;

import java.io.Serializable;
import java.util.Collection;
import java.util.List;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

/** The signed-in user kept in the session (serialized by Spring Session JDBC), without the password hash. */
public record CurrentUser(long id, String email, String fullName, Role role, boolean mustChangePassword)
        implements UserDetails, Serializable {

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority(role.authority()));
    }

    @Override
    public String getPassword() {
        return null;
    }

    @Override
    public String getUsername() {
        return email;
    }

    CurrentUser withPasswordChanged() {
        return new CurrentUser(id, email, fullName, role, false);
    }
}
