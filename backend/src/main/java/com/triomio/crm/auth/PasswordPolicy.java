package com.triomio.crm.auth;

import com.triomio.crm.shared.ApiProblemException;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
class PasswordPolicy {

    static final int MIN_LENGTH = 12;
    private static final int MAX_LENGTH = 128;
    private static final String TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private static final int TEMP_LENGTH = 16;

    private final Set<String> common;
    private final SecureRandom random = new SecureRandom();

    PasswordPolicy() {
        try (InputStream in = new ClassPathResource("auth/common-passwords.txt").getInputStream()) {
            common = new String(in.readAllBytes(), StandardCharsets.UTF_8)
                    .lines()
                    .map(String::strip)
                    .filter(line -> !line.isEmpty() && !line.startsWith("#"))
                    .map(line -> line.toLowerCase(Locale.ROOT))
                    .collect(Collectors.toUnmodifiableSet());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    void check(String password, String email) {
        if (password == null || password.length() < MIN_LENGTH) {
            throw weak("Пароль має містити щонайменше " + MIN_LENGTH + " символів.");
        }
        if (password.length() > MAX_LENGTH) {
            throw weak("Пароль задовгий: максимум " + MAX_LENGTH + " символів.");
        }
        String lower = password.toLowerCase(Locale.ROOT);
        if (common.contains(lower) || lower.chars().distinct().count() < 4) {
            throw weak("Цей пароль занадто простий. Оберіть інший.");
        }
        String localPart = email == null ? "" : email.toLowerCase(Locale.ROOT).split("@")[0];
        if (localPart.length() >= 4 && lower.contains(localPart)) {
            throw weak("Пароль не має містити email.");
        }
    }

    String temporary() {
        StringBuilder sb = new StringBuilder(TEMP_LENGTH);
        for (int i = 0; i < TEMP_LENGTH; i++) {
            sb.append(TEMP_ALPHABET.charAt(random.nextInt(TEMP_ALPHABET.length())));
        }
        return sb.toString();
    }

    private static ApiProblemException weak(String detail) {
        return new ApiProblemException(HttpStatus.BAD_REQUEST, "WEAK_PASSWORD", detail);
    }
}
