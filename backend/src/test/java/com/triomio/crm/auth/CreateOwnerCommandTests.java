package com.triomio.crm.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.triomio.crm.CrmApplication;
import com.triomio.crm.TestcontainersConfiguration;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.testcontainers.postgresql.PostgreSQLContainer;

/** Runs the real command (its own non-web Spring context) against the test database. */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class CreateOwnerCommandTests {

    @Autowired
    PostgreSQLContainer postgres;

    @Autowired
    UserAccounts users;

    @Test
    void createsOwnerWithPasswordFromStdin() {
        String email = "cli-" + UUID.randomUUID() + "@test.local";

        int exit = runWithStdin("Tymchasovyi-Parol-2026\n", "--email", email, "--name", "Власник CLI");

        assertThat(exit).isZero();
        assertThat(users.findByEmail(email).orElseThrow())
                .returns(Role.OWNER, UserAccounts.UserAccount::role)
                .returns("Власник CLI", UserAccounts.UserAccount::fullName)
                .returns(true, UserAccounts.UserAccount::mustChangePassword);
    }

    @Test
    void rejectsWeakPasswordAndMissingEmail() {
        String email = "cli-" + UUID.randomUUID() + "@test.local";
        assertThat(runWithStdin("password1234\n", "--email", email)).isEqualTo(1);
        assertThat(users.findByEmail(email)).isEmpty();
        assertThat(runWithStdin("Tymchasovyi-Parol-2026\n")).isEqualTo(2);
    }

    private int runWithStdin(String stdin, String... commandArgs) {
        String[] args = new String[commandArgs.length + 3];
        System.arraycopy(commandArgs, 0, args, 0, commandArgs.length);
        args[commandArgs.length] = "--spring.datasource.url=" + postgres.getJdbcUrl();
        args[commandArgs.length + 1] = "--spring.datasource.username=" + postgres.getUsername();
        args[commandArgs.length + 2] = "--spring.datasource.password=" + postgres.getPassword();
        InputStream original = System.in;
        System.setIn(new ByteArrayInputStream(stdin.getBytes(StandardCharsets.UTF_8)));
        try {
            return CreateOwnerCommand.run(CrmApplication.class, args);
        } finally {
            System.setIn(original);
        }
    }
}
