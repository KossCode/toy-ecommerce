package com.triomio.crm.integrations.mode;

/** Marketplace write modes from docs/backend/08-marketplace-sync.md §2. Ordered weakest → strongest. */
public enum WriteMode {
    OFF,
    READ_ONLY,
    DRY_RUN,
    LIVE;

    public boolean allowsRead() {
        return this != OFF;
    }

    public boolean allowsHttpWrite() {
        return this == LIVE;
    }

    public boolean isDryRun() {
        return this == DRY_RUN;
    }

    /** Effective mode = min(DB mode, env ceiling). */
    public WriteMode min(WriteMode other) {
        return ordinal() <= other.ordinal() ? this : other;
    }

    public static WriteMode parse(String raw) {
        return WriteMode.valueOf(raw.trim().toUpperCase());
    }
}
