package com.triomio.crm.auth;

public enum Role {
    OWNER,
    MANAGER;

    public String authority() {
        return "ROLE_" + name();
    }
}
