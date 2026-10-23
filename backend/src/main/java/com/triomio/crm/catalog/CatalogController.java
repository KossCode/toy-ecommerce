package com.triomio.crm.catalog;

import com.triomio.crm.auth.CurrentUser;
import com.triomio.crm.catalog.ProductDtos.CategoriesFile;
import com.triomio.crm.catalog.ProductDtos.CategoryView;
import com.triomio.crm.catalog.ProductDtos.HistoryItem;
import com.triomio.crm.catalog.ProductDtos.ProductView;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
class CatalogController {

    record CreateCategoryRequest(String name, @Nullable String parentId) {}

    record UpdateCategoryRequest(
            @Nullable String name,
            @Nullable String parentId,
            @Nullable Map<String, Object> mappings) {}

    private final ProductService products;
    private final CategoryService categories;

    CatalogController(ProductService products, CategoryService categories) {
        this.products = products;
        this.categories = categories;
    }

    @GetMapping("/products")
    List<ProductView> listProducts() {
        return products.list();
    }

    @PostMapping("/products")
    @ResponseStatus(HttpStatus.CREATED)
    ProductView createProduct(@AuthenticationPrincipal CurrentUser user) {
        return products.create(user);
    }

    @GetMapping("/products/{sku}")
    ProductView getProduct(@PathVariable String sku) {
        return products.get(sku);
    }

    @PatchMapping("/products/{sku}")
    ProductView patchProduct(
            @AuthenticationPrincipal CurrentUser user,
            @PathVariable String sku,
            @RequestBody Map<String, Object> body) {
        return products.patch(user, sku, body);
    }

    @GetMapping("/products/{sku}/history")
    List<HistoryItem> history(@PathVariable String sku) {
        return products.history(sku);
    }

    @GetMapping("/categories")
    CategoriesFile listCategories() {
        return categories.get();
    }

    @PostMapping("/categories")
    @ResponseStatus(HttpStatus.CREATED)
    CategoryView createCategory(@RequestBody CreateCategoryRequest body) {
        return categories.create(body.name(), body.parentId());
    }

    @PatchMapping("/categories/{id}")
    CategoryView updateCategory(@PathVariable String id, @RequestBody UpdateCategoryRequest body) {
        return categories.update(id, body.name(), body.parentId(), body.mappings());
    }

    @PostMapping("/categories/refresh-dictionaries")
    @ResponseStatus(HttpStatus.ACCEPTED)
    CategoriesFile refreshDictionaries() {
        return categories.refreshDictionaries();
    }
}
