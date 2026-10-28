package com.triomio.crm.media;

import java.io.InputStream;
import java.net.URI;

/** Product photo blobs: local disk in local/test, S3 later in prod (docs/backend/09-media-s3.md). */
public interface MediaStorage {

    record StoredObject(String key, URI publicUrl) {}

    StoredObject put(String key, InputStream data, long size, String contentType);

    void delete(String key);

    URI publicUrl(String key);
}
