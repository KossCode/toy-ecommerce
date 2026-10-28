package com.triomio.crm.media;

import com.triomio.crm.media.ProductImageDtos.ImageView;
import com.triomio.crm.shared.ApiProblemException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ProductImageService {

    private static final long MAX_BYTES = 10L * 1024 * 1024;
    private static final int MAX_IMAGES = 15;

    private final JdbcClient jdbc;
    private final MediaStorage storage;
    private final ApplicationEventPublisher events;

    ProductImageService(JdbcClient jdbc, MediaStorage storage, ApplicationEventPublisher events) {
        this.jdbc = jdbc;
        this.storage = storage;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public List<ImageView> listForProductId(long productId) {
        return jdbc.sql("""
                        SELECT id, storage_key, position, content_type, size_bytes, width, height
                        FROM product_images WHERE product_id = :id ORDER BY position
                        """)
                .param("id", productId)
                .query((rs, i) -> new ImageView(
                        rs.getLong("id"),
                        storage.publicUrl(rs.getString("storage_key")).toString(),
                        rs.getInt("position"),
                        rs.getString("content_type"),
                        rs.getLong("size_bytes"),
                        (Integer) rs.getObject("width"),
                        (Integer) rs.getObject("height")))
                .list();
    }

    @Transactional(readOnly = true)
    public List<ImageView> listForSku(String sku) {
        return listForProductId(requireProduct(sku).id());
    }

    @Transactional
    public ImageView upload(String sku, MultipartFile file) {
        ProductRef product = requireProduct(sku);
        if (file == null || file.isEmpty()) {
            throw new ApiProblemException(HttpStatus.BAD_REQUEST, "EMPTY_FILE", "Файл порожній");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new ApiProblemException(HttpStatus.BAD_REQUEST, "FILE_TOO_LARGE", "Максимум 10 MB на фото");
        }
        int count = jdbc.sql("SELECT count(*) FROM product_images WHERE product_id = :id")
                .param("id", product.id())
                .query(Integer.class)
                .single();
        if (count >= MAX_IMAGES) {
            throw new ApiProblemException(
                    HttpStatus.BAD_REQUEST, "TOO_MANY_IMAGES", "Не більше " + MAX_IMAGES + " фото на товар");
        }

        byte[] bytes;
        ImageType type;
        try (InputStream in = file.getInputStream()) {
            byte[] header = in.readNBytes(12);
            type = ImageType.detect(header);
            if (type == null) {
                throw new ApiProblemException(
                        HttpStatus.BAD_REQUEST, "UNSUPPORTED_IMAGE", "Дозволені JPEG, PNG або WebP");
            }
            bytes = ImageType.prepend(header, in);
        } catch (ApiProblemException e) {
            throw e;
        } catch (IOException e) {
            throw new ApiProblemException(HttpStatus.BAD_REQUEST, "READ_FAILED", "Не вдалося прочитати файл");
        }
        if (bytes.length > MAX_BYTES) {
            throw new ApiProblemException(HttpStatus.BAD_REQUEST, "FILE_TOO_LARGE", "Максимум 10 MB на фото");
        }

        String key = "products/" + product.sku() + "/" + UUID.randomUUID() + "." + type.extension();
        storage.put(key, new ByteArrayInputStream(bytes), bytes.length, type.contentType());

        int position =
                jdbc.sql("""
                        SELECT coalesce(max(position), -1) + 1 FROM product_images WHERE product_id = :id
                        """).param("id", product.id()).query(Integer.class).single();

        long id = jdbc.sql("""
                        INSERT INTO product_images (product_id, storage_key, position, content_type, size_bytes)
                        VALUES (:pid, :key, :pos, :ct, :size)
                        RETURNING id
                        """)
                .param("pid", product.id())
                .param("key", key)
                .param("pos", position)
                .param("ct", type.contentType())
                .param("size", (long) bytes.length)
                .query(Long.class)
                .single();

        jdbc.sql("UPDATE products SET updated_at = now() WHERE id = :id")
                .param("id", product.id())
                .update();
        events.publishEvent(new ProductImagesChanged(product.id()));

        return new ImageView(
                id, storage.publicUrl(key).toString(), position, type.contentType(), bytes.length, null, null);
    }

    @Transactional
    public List<ImageView> reorder(String sku, List<Long> orderedIds) {
        ProductRef product = requireProduct(sku);
        if (orderedIds == null || orderedIds.isEmpty()) {
            throw new ApiProblemException(HttpStatus.BAD_REQUEST, "EMPTY_ORDER", "Передайте orderedIds");
        }
        List<Long> existing = jdbc.sql("SELECT id FROM product_images WHERE product_id = :id ORDER BY position")
                .param("id", product.id())
                .query(Long.class)
                .list();
        if (orderedIds.size() != existing.size() || !new HashSet<>(orderedIds).equals(new HashSet<>(existing))) {
            throw new ApiProblemException(
                    HttpStatus.BAD_REQUEST, "INVALID_ORDER", "Список id має збігатися з фото товару");
        }
        // Two-phase to satisfy UNIQUE (product_id, position) DEFERRABLE — still set offset first for safety.
        for (int i = 0; i < orderedIds.size(); i++) {
            jdbc.sql("UPDATE product_images SET position = :pos WHERE id = :id AND product_id = :pid")
                    .param("pos", i + 1000)
                    .param("id", orderedIds.get(i))
                    .param("pid", product.id())
                    .update();
        }
        for (int i = 0; i < orderedIds.size(); i++) {
            jdbc.sql("UPDATE product_images SET position = :pos WHERE id = :id AND product_id = :pid")
                    .param("pos", i)
                    .param("id", orderedIds.get(i))
                    .param("pid", product.id())
                    .update();
        }
        jdbc.sql("UPDATE products SET updated_at = now() WHERE id = :id")
                .param("id", product.id())
                .update();
        events.publishEvent(new ProductImagesChanged(product.id()));
        return listForProductId(product.id());
    }

    @Transactional
    public void delete(String sku, long imageId) {
        ProductRef product = requireProduct(sku);
        record Row(long id, String storageKey) {}
        Row row = jdbc.sql("""
                        SELECT id, storage_key FROM product_images WHERE id = :id AND product_id = :pid
                        """)
                .param("id", imageId)
                .param("pid", product.id())
                .query(Row.class)
                .optional()
                .orElseThrow(
                        () -> new ApiProblemException(HttpStatus.NOT_FOUND, "IMAGE_NOT_FOUND", "Фото не знайдено"));

        jdbc.sql("DELETE FROM product_images WHERE id = :id")
                .param("id", row.id())
                .update();

        // Compact positions.
        List<Long> remaining = jdbc.sql("SELECT id FROM product_images WHERE product_id = :id ORDER BY position")
                .param("id", product.id())
                .query(Long.class)
                .list();
        for (int i = 0; i < remaining.size(); i++) {
            jdbc.sql("UPDATE product_images SET position = :pos WHERE id = :id")
                    .param("pos", i)
                    .param("id", remaining.get(i))
                    .update();
        }

        Integer refs = jdbc.sql("SELECT count(*) FROM product_images WHERE storage_key = :key")
                .param("key", row.storageKey())
                .query(Integer.class)
                .single();
        if (refs == 0) {
            storage.delete(row.storageKey());
        }

        jdbc.sql("UPDATE products SET updated_at = now() WHERE id = :id")
                .param("id", product.id())
                .update();
        events.publishEvent(new ProductImagesChanged(product.id()));
    }

    private ProductRef requireProduct(String sku) {
        return jdbc.sql("SELECT id, sku FROM products WHERE sku = :sku")
                .param("sku", sku)
                .query(ProductRef.class)
                .optional()
                .orElseThrow(
                        () -> new ApiProblemException(HttpStatus.NOT_FOUND, "PRODUCT_NOT_FOUND", "Товар не знайдено"));
    }

    private record ProductRef(long id, String sku) {}
}
