package com.triomio.crm.integrations;

import com.triomio.crm.integrations.credentials.CryptoProperties;
import com.triomio.crm.integrations.mode.IntegrationsProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties({IntegrationsProperties.class, CryptoProperties.class})
class IntegrationsConfig {}
