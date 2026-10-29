package com.triomio.crm.integrations.credentials;

import com.triomio.crm.auth.CurrentUser;
import com.triomio.crm.shared.ApiProblemException;
import com.triomio.crm.shared.WireLabels;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Service
public class CredentialsService {

    private final JdbcClient jdbc;
    private final CredentialsCrypto crypto;
    private final JsonMapper json;

    public CredentialsService(JdbcClient jdbc, CredentialsCrypto crypto, JsonMapper json) {
        this.jdbc = jdbc;
        this.crypto = crypto;
        this.json = json;
    }

    public boolean hasCiphertext(String marketplace) {
        Boolean present = jdbc.sql("""
                        SELECT credentials_ciphertext IS NOT NULL FROM integration_settings WHERE marketplace = :mp
                        """)
                .param("mp", marketplace)
                .query(Boolean.class)
                .optional()
                .orElse(false);
        return Boolean.TRUE.equals(present);
    }

    @Transactional
    public Map<String, Object> save(CurrentUser actor, String marketplaceWire, Map<String, Object> body) {
        String marketplace = WireLabels.marketplaceCode(marketplaceWire);
        if (!marketplace.equals("PROM") && !marketplace.equals("ROZETKA") && !marketplace.equals("EPICENTR")) {
            throw new ApiProblemException(HttpStatus.NOT_FOUND, "INTEGRATION_NOT_FOUND", "Площадку не знайдено");
        }
        String secretForHint;
        Map<String, Object> payload = new LinkedHashMap<>();
        if ("PROM".equals(marketplace)) {
            String token = string(body.get("token"));
            if (token.isBlank()) {
                throw new ApiProblemException(HttpStatus.BAD_REQUEST, "TOKEN_REQUIRED", "Вкажіть token");
            }
            payload.put("token", token);
            secretForHint = token;
        } else {
            String login = string(body.get("login"));
            String password = string(body.get("password"));
            if (login.isBlank() || password.isBlank()) {
                throw new ApiProblemException(
                        HttpStatus.BAD_REQUEST, "LOGIN_PASSWORD_REQUIRED", "Вкажіть login і password");
            }
            payload.put("login", login);
            payload.put("password", password);
            secretForHint = password;
        }
        String hint = mask(secretForHint);
        byte[] cipher = crypto.encrypt(json.writeValueAsString(payload));
        jdbc.sql("""
                        UPDATE integration_settings SET
                          credentials_ciphertext = :cipher,
                          credentials_hint = :hint,
                          credentials_updated_at = now(),
                          updated_at = now(),
                          updated_by = :actor
                        WHERE marketplace = :mp
                        """)
                .param("cipher", cipher)
                .param("hint", hint)
                .param("actor", actor.id())
                .param("mp", marketplace)
                .update();
        jdbc.sql("""
                        INSERT INTO audit_log (entity_type, entity_id, sku, kind, message, actor_user_id)
                        VALUES ('INTEGRATION', null, :mp, 'INTEGRATION', :msg, :actor)
                        """)
                .param("mp", marketplace)
                .param("msg", "Оновлено ключі API (маска " + hint + ")")
                .param("actor", actor.id())
                .update();
        return connectionFields(marketplace, hint, OffsetDateTime.now());
    }

    /** Fills connection map keys for GET /integrations (never plaintext secrets). */
    public void putConnectionFields(String marketplace, Map<String, Object> connection) {
        record Row(@Nullable String hint, @Nullable OffsetDateTime updatedAt, byte @Nullable [] cipher) {}
        Row row = jdbc.sql("""
                        SELECT credentials_hint AS hint, credentials_updated_at AS updated_at, credentials_ciphertext AS cipher
                        FROM integration_settings WHERE marketplace = :mp
                        """)
                .param("mp", marketplace)
                .query(Row.class)
                .optional()
                .orElse(new Row(null, null, null));
        if (row.hint() == null) {
            return;
        }
        connection.putAll(connectionFields(marketplace, row.hint(), row.updatedAt()));
        if (!"PROM".equals(marketplace) && row.cipher() != null && crypto.configured()) {
            try {
                JsonNode node = json.readTree(crypto.decrypt(row.cipher()));
                if (node.get("login") != null && !node.get("login").asString().isBlank()) {
                    connection.put("login", node.get("login").asString());
                }
            } catch (RuntimeException ignored) {
                /* hint still shown */
            }
        }
    }

    private Map<String, Object> connectionFields(String marketplace, String hint, @Nullable OffsetDateTime updatedAt) {
        Map<String, Object> out = new LinkedHashMap<>();
        if ("PROM".equals(marketplace)) {
            out.put("tokenMasked", hint);
        } else {
            out.put("passwordMasked", hint);
        }
        if (updatedAt != null) {
            out.put("credentialsUpdatedAt", updatedAt.toString());
        }
        return out;
    }

    static String mask(String secret) {
        String s = secret.strip();
        String tail = s.length() <= 4 ? s : s.substring(s.length() - 4);
        return "••••" + tail;
    }

    private static String string(@Nullable Object v) {
        return v == null ? "" : String.valueOf(v).strip();
    }
}
