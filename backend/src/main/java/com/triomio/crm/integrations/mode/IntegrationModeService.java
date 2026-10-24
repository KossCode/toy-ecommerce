package com.triomio.crm.integrations.mode;

import com.triomio.crm.auth.CurrentUser;
import com.triomio.crm.auth.Role;
import com.triomio.crm.shared.ApiProblemException;
import com.triomio.crm.shared.WireLabels;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class IntegrationModeService {

    private final JdbcClient jdbc;
    private final IntegrationsProperties properties;

    public IntegrationModeService(JdbcClient jdbc, IntegrationsProperties properties) {
        this.jdbc = jdbc;
        this.properties = properties;
    }

    /** min(DB mode, INTEGRATIONS_MAX_MODE / app.integrations.max-mode). */
    @Transactional(readOnly = true)
    public WriteMode effectiveMode(String marketplace) {
        WriteMode db = dbMode(marketplace);
        return db.min(properties.maxMode());
    }

    @Transactional(readOnly = true)
    public WriteMode dbMode(String marketplace) {
        return jdbc.sql("SELECT mode FROM integration_settings WHERE marketplace = :mp")
                .param("mp", marketplace)
                .query(String.class)
                .optional()
                .map(WriteMode::parse)
                .orElse(WriteMode.READ_ONLY);
    }

    @Transactional(readOnly = true)
    public WriteMode maxMode() {
        return properties.maxMode();
    }

    @Transactional
    public WriteMode setMode(CurrentUser actor, String marketplaceWire, String modeRaw) {
        if (actor.role() != Role.OWNER) {
            throw new ApiProblemException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Лише власник може змінювати режим");
        }
        String marketplace = WireLabels.marketplaceCode(marketplaceWire);
        if (!marketplace.equals("PROM") && !marketplace.equals("ROZETKA") && !marketplace.equals("EPICENTR")) {
            throw new ApiProblemException(HttpStatus.NOT_FOUND, "INTEGRATION_NOT_FOUND", "Площадку не знайдено");
        }
        WriteMode requested = WriteMode.parse(modeRaw);
        if (requested.ordinal() > properties.maxMode().ordinal()) {
            throw new ApiProblemException(
                    HttpStatus.CONFLICT,
                    "MODE_CEILING",
                    "Потолок INTEGRATIONS_MAX_MODE = " + properties.maxMode()
                            + "; підняти LIVE можна лише через .env і перезапуск");
        }
        jdbc.sql("""
                        UPDATE integration_settings
                        SET mode = :mode, updated_at = now(), updated_by = :actor,
                            paused_reason = CASE WHEN :mode = 'LIVE' THEN null ELSE paused_reason END
                        WHERE marketplace = :mp
                        """)
                .param("mode", requested.name())
                .param("actor", actor.id())
                .param("mp", marketplace)
                .update();
        jdbc.sql("""
                        INSERT INTO audit_log (entity_type, entity_id, sku, kind, message, actor_user_id)
                        VALUES ('INTEGRATION', null, :mp, 'INTEGRATION', :msg, :actor)
                        """)
                .param("mp", marketplace)
                .param("msg", "Режим → " + requested.name())
                .param("actor", actor.id())
                .update();
        return requested;
    }
}
