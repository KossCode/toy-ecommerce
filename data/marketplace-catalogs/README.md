# Marketplace category catalogs

## Prom — OK

- Source: https://my.prom.ua/cabinet/export_categories/xls (public XLS, no auth)
- Snapshot: `prom-categories.json.gz` (5847 leaves, fetched 2026-10-16)
- Toys subset for CRM mapping UI: `prom-kids-leaves.json` + wired into `data/categories.json` → `marketplaceLeaves.prom`

## Rozetka — blocked without seller auth

- Seller API: `GET https://api.seller.rozetka.com.ua/market-categories/get-categories-by-parent` requires Bearer token
- Storefront/catalog API behind Cloudflare (403/challenge from this environment)
- Need: seller cabinet login or API credentials (GitHub Actions secret later)

## Epicentr — blocked without seller cabinet

- Category / attribute dictionaries are exported from the merchant cabinet (Товари → Експорт / довідники) or Merchant API when enabled for the account
- No public unauthenticated category tree found

To refresh Prom later: download the XLS and re-parse into the gz snapshot.
