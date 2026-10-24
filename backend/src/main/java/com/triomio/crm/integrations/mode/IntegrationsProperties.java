package com.triomio.crm.integrations.mode;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.integrations")
public record IntegrationsProperties(WriteMode maxMode) {

    public IntegrationsProperties {
        if (maxMode == null) {
            maxMode = WriteMode.DRY_RUN;
        }
    }
}
