package com.triomio.crm;

import org.springframework.boot.SpringApplication;

/** Runs the app against a throwaway Testcontainers Postgres: {@code ./mvnw spring-boot:test-run}. */
public class TestCrmApplication {

    public static void main(String[] args) {
        SpringApplication.from(CrmApplication::main)
                .with(TestcontainersConfiguration.class)
                .run(args);
    }
}
