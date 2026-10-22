package com.triomio.crm.audit;

import com.triomio.crm.auth.UserAuditEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class UserAuditWriter {

    private final JdbcClient jdbc;

    UserAuditWriter(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @EventListener
    @Transactional
    void on(UserAuditEvent event) {
        jdbc.sql("""
                        INSERT INTO audit_log (actor_user_id, entity_type, entity_id, kind, message)
                        VALUES (:actor, 'USER', :target, 'USERS', :message)
                        """)
                .param("actor", event.actorUserId())
                .param("target", event.targetUserId())
                .param("message", event.message())
                .update();
    }
}
