package com.triomio.crm.media;

import java.util.List;
import org.jspecify.annotations.Nullable;

public final class ProductImageDtos {

    private ProductImageDtos() {}

    public record ImageView(
            long id,
            String url,
            int position,
            String contentType,
            long sizeBytes,
            @Nullable Integer width,
            @Nullable Integer height) {}

    public record ReorderRequest(List<Long> orderedIds) {}
}
