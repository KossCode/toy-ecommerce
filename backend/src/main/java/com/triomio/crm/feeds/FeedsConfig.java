package com.triomio.crm.feeds;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(FeedsProperties.class)
class FeedsConfig {}
