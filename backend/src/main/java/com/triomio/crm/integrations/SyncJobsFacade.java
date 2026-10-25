package com.triomio.crm.integrations;

import com.triomio.crm.integrations.outbox.OutboxDispatcher;
import org.springframework.stereotype.Service;

/**
 * Narrow API for the {@code jobs} module so Modulith does not expose outbox/mode internals.
 */
@Service
public class SyncJobsFacade {

    private final OrdersPollService ordersPoll;
    private final OutboxDispatcher outbox;
    private final FeedBuildService feeds;
    private final ConfirmDeadlineService deadlines;
    private final ReconcileService reconcile;
    private final DictionariesRefreshService dictionaries;
    private final HousekeepingService housekeeping;

    public SyncJobsFacade(
            OrdersPollService ordersPoll,
            OutboxDispatcher outbox,
            FeedBuildService feeds,
            ConfirmDeadlineService deadlines,
            ReconcileService reconcile,
            DictionariesRefreshService dictionaries,
            HousekeepingService housekeeping) {
        this.ordersPoll = ordersPoll;
        this.outbox = outbox;
        this.feeds = feeds;
        this.deadlines = deadlines;
        this.reconcile = reconcile;
        this.dictionaries = dictionaries;
        this.housekeeping = housekeeping;
    }

    public void pollOrders(String marketplace) {
        ordersPoll.poll(marketplace);
    }

    public int dispatchOutbox() {
        return outbox.dispatchDue();
    }

    public void buildFeeds() {
        feeds.buildAll();
    }

    public int scanConfirmDeadlines() {
        return deadlines.scan();
    }

    public void reconcile() {
        reconcile.reconcileAll();
    }

    public void refreshDictionaries() {
        dictionaries.refresh();
    }

    public int housekeeping() {
        return housekeeping.cleanup();
    }
}
