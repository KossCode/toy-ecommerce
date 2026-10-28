package com.triomio.crm.media;

/** Fired after product photos are uploaded, reordered or deleted. */
public record ProductImagesChanged(long productId) {}
