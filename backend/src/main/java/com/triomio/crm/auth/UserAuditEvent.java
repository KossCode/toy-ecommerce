package com.triomio.crm.auth;

import org.jspecify.annotations.Nullable;

/** Sign-ins, failed attempts, password and role changes; written to audit_log as kind USERS. */
public record UserAuditEvent(
        @Nullable Long actorUserId, @Nullable Long targetUserId, String message) {}
