package com.triomio.crm.media;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.triomio.crm.TestcontainersConfiguration;
import com.triomio.crm.auth.CurrentUser;
import com.triomio.crm.auth.Role;
import java.nio.file.Path;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class MediaTests {

    @TempDir
    static Path mediaDir;

    @DynamicPropertySource
    static void mediaProps(DynamicPropertyRegistry registry) {
        registry.add("app.media.dir", () -> mediaDir.toString());
        registry.add("app.media.public-base-url", () -> "http://localhost:8080");
    }

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    PasswordEncoder encoder;

    @Autowired
    JsonMapper json;

    CurrentUser owner;
    String sku;

    /** 1×1 PNG */
    static final byte[] TINY_PNG = new byte[] {
        (byte) 0x89,
        0x50,
        0x4E,
        0x47,
        0x0D,
        0x0A,
        0x1A,
        0x0A,
        0x00,
        0x00,
        0x00,
        0x0D,
        0x49,
        0x48,
        0x44,
        0x52,
        0x00,
        0x00,
        0x00,
        0x01,
        0x00,
        0x00,
        0x00,
        0x01,
        0x08,
        0x02,
        0x00,
        0x00,
        0x00,
        (byte) 0x90,
        0x77,
        0x53,
        (byte) 0xDE,
        0x00,
        0x00,
        0x00,
        0x0C,
        0x49,
        0x44,
        0x41,
        0x54,
        0x08,
        (byte) 0xD7,
        0x63,
        (byte) 0xF8,
        (byte) 0xCF,
        (byte) 0xC0,
        0x00,
        0x00,
        0x00,
        0x03,
        0x00,
        0x01,
        0x00,
        0x05,
        (byte) 0xFE,
        (byte) 0xD4,
        (byte) 0xEF,
        0x00,
        0x00,
        0x00,
        0x00,
        0x49,
        0x45,
        0x4E,
        0x44,
        (byte) 0xAE,
        0x42,
        0x60,
        (byte) 0x82
    };

    @BeforeEach
    void setup() throws Exception {
        String email = "media-owner-" + System.nanoTime() + "@test.local";
        long id = jdbc.sql("""
                        INSERT INTO users (email, password_hash, full_name, role, must_change_password)
                        VALUES (:email, :hash, 'Медіа Власник', 'OWNER', false) RETURNING id
                        """)
                .param("email", email)
                .param("hash", encoder.encode("Media-Owner-Pass-12"))
                .query(Long.class)
                .single();
        owner = new CurrentUser(id, email, "Медіа Власник", Role.OWNER, false);

        MvcResult created = mvc.perform(
                        org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/products")
                                .with(user(owner))
                                .with(csrf()))
                .andExpect(status().isCreated())
                .andReturn();
        sku = json.readTree(created.getResponse().getContentAsString())
                .get("sku")
                .asString();
    }

    @Test
    void uploadServeReorderDelete() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "a.png", "image/png", TINY_PNG);

        MvcResult uploaded = mvc.perform(multipart("/api/products/" + sku + "/images")
                        .file(file)
                        .with(user(owner))
                        .with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.url").value(org.hamcrest.Matchers.containsString("/media/products/")))
                .andExpect(jsonPath("$.position").value(0))
                .andReturn();

        long id1 = json.readTree(uploaded.getResponse().getContentAsString())
                .get("id")
                .asLong();
        String url = json.readTree(uploaded.getResponse().getContentAsString())
                .get("url")
                .asString();
        String path = url.substring(url.indexOf("/media/"));

        mvc.perform(get(path)).andExpect(status().isOk()).andExpect(header().string("Content-Type", "image/png"));

        MockMultipartFile file2 = new MockMultipartFile("file", "b.png", "image/png", TINY_PNG);
        MvcResult uploaded2 = mvc.perform(multipart("/api/products/" + sku + "/images")
                        .file(file2)
                        .with(user(owner))
                        .with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.position").value(1))
                .andReturn();
        long id2 = json.readTree(uploaded2.getResponse().getContentAsString())
                .get("id")
                .asLong();

        mvc.perform(get("/api/products/" + sku).with(user(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.images", hasSize(2)));

        mvc.perform(patch("/api/products/" + sku + "/images/order")
                        .with(user(owner))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"orderedIds\":[" + id2 + "," + id1 + "]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(id2))
                .andExpect(jsonPath("$[1].id").value(id1));

        mvc.perform(delete("/api/products/" + sku + "/images/" + id2)
                        .with(user(owner))
                        .with(csrf()))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/products/" + sku).with(user(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.images", hasSize(1)))
                .andExpect(jsonPath("$.images[0].id").value(id1));

        // Reject non-image
        MockMultipartFile bad = new MockMultipartFile("file", "x.txt", "text/plain", "hello".getBytes());
        mvc.perform(multipart("/api/products/" + sku + "/images")
                        .file(bad)
                        .with(user(owner))
                        .with(csrf()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_IMAGE"));
    }
}
