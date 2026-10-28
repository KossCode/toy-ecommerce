package com.triomio.crm.media;

import com.triomio.crm.media.ProductImageDtos.ImageView;
import com.triomio.crm.media.ProductImageDtos.ReorderRequest;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/products/{sku}/images")
class ProductImageController {

    private final ProductImageService images;

    ProductImageController(ProductImageService images) {
        this.images = images;
    }

    @GetMapping
    List<ImageView> list(@PathVariable String sku) {
        return images.listForSku(sku);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    ImageView upload(@PathVariable String sku, @RequestPart("file") MultipartFile file) {
        return images.upload(sku, file);
    }

    @PatchMapping("/order")
    List<ImageView> reorder(@PathVariable String sku, @RequestBody ReorderRequest body) {
        return images.reorder(sku, body.orderedIds());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable String sku, @PathVariable long id) {
        images.delete(sku, id);
    }
}
