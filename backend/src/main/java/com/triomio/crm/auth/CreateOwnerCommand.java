package com.triomio.crm.auth;

import java.io.BufferedReader;
import java.io.Console;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.context.ConfigurableApplicationContext;

/**
 * {@code java -jar application.jar create-owner --email owner@example.com [--name "Ім'я"] [--reset]}; other
 * {@code --key=value} arguments go to Spring as usual.
 *
 * <p>The password is read from the terminal (twice, without echo) or as one line from stdin, so it never appears in
 * the shell history, the process list or the container logs that go to CloudWatch.
 */
public final class CreateOwnerCommand {

    public static final String NAME = "create-owner";

    private CreateOwnerCommand() {}

    public static int run(Class<?> application, String[] args) {
        PrintStream err = System.err;
        String email = null;
        String name = "Власник";
        boolean reset = false;
        List<String> springArgs = new ArrayList<>();
        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--email" -> email = i + 1 < args.length ? args[++i] : null;
                case "--name" -> name = i + 1 < args.length ? args[++i] : name;
                case "--reset" -> reset = true;
                default -> {
                    if (!args[i].startsWith("--") || !args[i].contains("=")) {
                        err.println("Невідомий аргумент: " + args[i]);
                        return usage(err);
                    }
                    springArgs.add(args[i]);
                }
            }
        }
        if (email == null || email.isBlank() || name.isBlank()) {
            return usage(err);
        }

        char[] password;
        try {
            password = readPassword(err);
        } catch (IOException | IllegalStateException e) {
            err.println(e.getMessage());
            return 1;
        }

        SpringApplication app = new SpringApplication(application);
        app.setWebApplicationType(WebApplicationType.NONE);
        app.setDefaultProperties(Map.of("spring.quartz.auto-startup", "false"));
        try (ConfigurableApplicationContext context = app.run(springArgs.toArray(String[]::new))) {
            OwnerProvisioning.Outcome outcome = context.getBean(OwnerProvisioning.class)
                    .createOrReset(email, name.strip(), new String(password), reset);
            System.out.println(
                    outcome == OwnerProvisioning.Outcome.CREATED
                            ? "Власника створено. Під час першого входу система попросить змінити пароль."
                            : "Пароль власника скинуто, усі його сесії завершено. Під час входу потрібно буде змінити пароль.");
            return 0;
        } catch (RuntimeException e) {
            err.println("Помилка: " + rootMessage(e));
            return 1;
        } finally {
            Arrays.fill(password, '\0');
        }
    }

    private static char[] readPassword(PrintStream err) throws IOException {
        Console console = System.console();
        if (console != null && console.isTerminal()) {
            char[] first = console.readPassword("Тимчасовий пароль (мін. 12 символів): ");
            char[] second = console.readPassword("Повторіть пароль: ");
            if (first == null || second == null || !Arrays.equals(first, second)) {
                throw new IllegalStateException("Паролі не збігаються.");
            }
            Arrays.fill(second, '\0');
            return first;
        }
        err.println("Читаю пароль зі stdin (один рядок)...");
        String line = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8)).readLine();
        if (line == null || line.isEmpty()) {
            throw new IllegalStateException("Пароль не передано.");
        }
        return line.toCharArray();
    }

    private static int usage(PrintStream err) {
        err.println("Використання: create-owner --email owner@example.com [--name \"Ім'я\"] [--reset]");
        return 2;
    }

    private static String rootMessage(Throwable e) {
        Throwable cause = e;
        while (cause.getCause() != null) {
            cause = cause.getCause();
        }
        return cause.getMessage() == null ? cause.getClass().getSimpleName() : cause.getMessage();
    }
}
