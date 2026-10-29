package com.triomio.crm.integrations.credentials;

import com.triomio.crm.shared.ApiProblemException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.jspecify.annotations.Nullable;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** AES-256-GCM for marketplace credentials (docs/backend/08-marketplace-sync.md §5). */
@Component
public class CredentialsCrypto {

    private static final int GCM_IV_LENGTH = 12;
    private static final int GCM_TAG_BITS = 128;
    /** Local-profile only when APP_CRYPTO_MASTER_KEY is unset (never use in prod). */
    private static final String LOCAL_FALLBACK_RAW = "local-dev-crm-master-key-32byte!";

    private final @Nullable SecretKey key;
    private final SecureRandom random = new SecureRandom();

    public CredentialsCrypto(CryptoProperties properties, Environment environment) {
        String configured = properties.masterKey();
        if ((configured == null || configured.isBlank()) && environment.matchesProfiles("local")) {
            configured = Base64.getEncoder().encodeToString(LOCAL_FALLBACK_RAW.getBytes(StandardCharsets.UTF_8));
        }
        this.key = parseKey(configured);
    }

    public boolean configured() {
        return key != null;
    }

    public byte[] encrypt(String plaintext) {
        SecretKey k = requireKey();
        try {
            byte[] iv = new byte[GCM_IV_LENGTH];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, k, new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] cipherText = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            ByteBuffer buf = ByteBuffer.allocate(iv.length + cipherText.length);
            buf.put(iv);
            buf.put(cipherText);
            return buf.array();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Failed to encrypt credentials", e);
        }
    }

    public String decrypt(byte[] blob) {
        SecretKey k = requireKey();
        if (blob == null || blob.length <= GCM_IV_LENGTH) {
            throw new ApiProblemException(HttpStatus.BAD_REQUEST, "CREDENTIALS_CORRUPT", "Збережені ключі пошкоджені");
        }
        try {
            byte[] iv = Arrays.copyOfRange(blob, 0, GCM_IV_LENGTH);
            byte[] cipherText = Arrays.copyOfRange(blob, GCM_IV_LENGTH, blob.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, k, new GCMParameterSpec(GCM_TAG_BITS, iv));
            return new String(cipher.doFinal(cipherText), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException e) {
            throw new ApiProblemException(
                    HttpStatus.BAD_REQUEST, "CREDENTIALS_CORRUPT", "Не вдалося розшифрувати ключі");
        }
    }

    private SecretKey requireKey() {
        if (key == null) {
            throw new ApiProblemException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "CRYPTO_NOT_CONFIGURED",
                    "Немає APP_CRYPTO_MASTER_KEY — задайте у .env.local (див. .env.local.example)");
        }
        return key;
    }

    private static @Nullable SecretKey parseKey(@Nullable String masterKey) {
        if (masterKey == null || masterKey.isBlank()) {
            return null;
        }
        byte[] raw;
        try {
            raw = Base64.getDecoder().decode(masterKey.strip());
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("app.crypto.master-key must be Base64", e);
        }
        if (raw.length != 32) {
            throw new IllegalStateException("app.crypto.master-key must decode to 32 bytes (AES-256)");
        }
        return new SecretKeySpec(raw, "AES");
    }
}
