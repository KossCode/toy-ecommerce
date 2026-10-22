package com.triomio.crm;

import com.triomio.crm.auth.CreateOwnerCommand;
import java.util.Arrays;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;

@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
public class CrmApplication {

    public static void main(String[] args) {
        if (args.length > 0 && args[0].equals(CreateOwnerCommand.NAME)) {
            System.exit(CreateOwnerCommand.run(CrmApplication.class, Arrays.copyOfRange(args, 1, args.length)));
        }
        SpringApplication.run(CrmApplication.class, args);
    }
}
