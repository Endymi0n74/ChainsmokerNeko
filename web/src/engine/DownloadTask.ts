import type { StoreableMediaContainer, MediaItem } from './providers/MediaPlugin';
import { Priority } from './taskpool/DeferredTask';
import type { StorageController } from './StorageController';
import { type IObservable, Observable, ObservableArray } from './Observable';
import { SetTimeout, ClearTimeout } from './BackgroundTimers';

/**
 * Maximum time a single network request inside a download task may stay stalled
 * (no response at all) before it is abandoned. Applies per page/request, NOT to
 * the whole task, so a hung image never freezes the rest of the queue.
 */
export const STALL_TIMEOUT_MS = 15_000;

/**
 * Maximum time a chapter's page-list resolution may take before it is abandoned.
 * Most connectors resolve pages with a quick request, but some (e.g. JapScan)
 * open a visible reader window and wait for the user to solve an interactive
 * anti-bot puzzle before the lazy-loaded pages are collected — which legitimately
 * takes far longer than a single stalled request. Kept well above the per-page
 * stall so interactive challenges can settle, while still bounding how long one
 * broken connector can occupy the shared download queue. (Note: JapScan's own
 * reader extraction keeps its longer internal budget — see JapScan.Extract.)
 */
export const CHAPTER_UPDATE_TIMEOUT_MS = 300_000;

/**
 * Reject if {@link promise} does not settle within {@link ms}.
 * Used to bound individual network operations inside a download task so one
 * blocked request can never stall the shared download queue indefinitely.
 */
export function WithTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timerID: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
        // BackgroundTimers.SetTimeout renvoie une Promise<number> résolue à l'ACK du worker.
        // Le mock de test (vitest.setup.ts) le remplace par le setTimeout natif qui renvoie
        // un objet Timeout sans .then : dans ce cas, aucun timer à nettoyer.
        const ret = SetTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        if (ret instanceof Promise) {
            ret.then(id => {
                timerID = id;
            });
        }
    });
    return Promise.race([promise, timeout]).finally(() => {
        if (timerID !== undefined) ClearTimeout(timerID);
    });
}

export const enum Status {
    Paused = 'paused',
    Queued = 'queued',
    Downloading = 'downloading',
    Processing = 'processing',
    Completed = 'completed',
    Failed = 'failed',
}

export class DownloadTask {

    public readonly ID = Symbol();
    public readonly Created = new Date();

    constructor(public readonly Media: StoreableMediaContainer<MediaItem>, private readonly storageController: StorageController) {}

    private errors = new ObservableArray<Error, typeof this>([], this);
    public get Errors(): IObservable<Error[], typeof this> {
        return this.errors;
    }

    private readonly status = new Observable(Status.Queued, this);
    public get Status(): IObservable<Status, typeof this> {
        return this.status;
    }

    private progress = new Observable(0.0, this);
    public get Progress(): IObservable<number, typeof this> {
        return this.progress;
    }

    private UpdateProgress(processed: number) {
        this.progress.Value = this.Media.Entries.Value.length > 0 ? processed / this.Media.Entries.Value.length : 0.0;
    }

    private get IsRunning(): boolean {
        return this.status.Value === Status.Downloading || this.status.Value === Status.Processing;
    }

    /**
     * Assert that the {@link Media} entries for this download task are valid
     * @throws {@link RangeError} if the media entries are empty
     */
    private AssertMediaEntries() {
        new Array(this.Media.Entries.Value.length - 1);
    }

    public async Run(/* Target Directory / Archive ? */): Promise<void> {

        if(this.IsRunning) {
            return;
        }
        this.errors.Value = [];
        this.status.Value = Status.Downloading;
        this.UpdateProgress(0);

        const resourcemap = new Map<number, string>();
        try {
            const cancellator = new AbortController();
            this.Abort = cancellator.abort.bind(cancellator);
            // Bound chapter resolution too. Interactive challenges are handled by the
            // fetch provider and must settle within its own timeout; a broken connector
            // must not permanently occupy the shared download queue.
            await WithTimeout(this.Media.Update(), CHAPTER_UPDATE_TIMEOUT_MS, `Chapter update for ${this.Media.Title ?? 'unknown chapter'}`);
            this.AssertMediaEntries();
            const promises = this.Media.Entries.Value.map(async (item, index: number) => {
                try {
                    // Bound each individual page request: a stalled request is
                    // abandoned after STALL_TIMEOUT_MS and skipped, so the rest of
                    // the pages (and the whole queue) keep moving.
                    const data = await WithTimeout(
                        item.Fetch(Priority.Low, cancellator.signal),
                        STALL_TIMEOUT_MS,
                        `Page fetch from ${this.Media.Title ?? 'unknown chapter'}`
                    );
                    // Skip empty or non-image blobs (e.g. JapScan CDN resources, placeholders):
                    // empty blobs export as 0-byte .bin; non-image blobs shift file numbering.
                    if (data instanceof Blob && (data.size === 0 || data.type.length > 0 && !data.type.startsWith("image/"))) {
                        return;
                    }
                    const resource = await this.storageController.SaveTemporary(data);
                    resourcemap.set(index, resource);
                    this.UpdateProgress(resourcemap.size);
                } catch(error) {
                    this.errors.Push(error instanceof Error ? error : new Error(error?.toString()));
                    // TODO: Abort all other pending downloads or keep running?
                    throw error;
                }
            });
            await Promise.allSettled(promises);
            if(this.errors.Value.length === 0) {
                this.UpdateProgress(-1 * this.Media.Entries.Value.length);
                this.status.Value = Status.Processing;
                // Re-index so the exported file numbering stays contiguous when
                // empty blobs were skipped (e.g. index 0 dropped -> 01, 02, ...).
                // Iterate by original index (not insertion order) to preserve
                // page order even when Promise.allSettled resolves out of order.
                const reindexed = new Map<number, string>();
                let newIdx = 0;
                for(let i = 0; i < this.Media.Entries.Value.length; i++) {
                    if(resourcemap.has(i)) {
                        reindexed.set(newIdx++, resourcemap.get(i));
                    }
                }
                await this.Media.Store(reindexed);
            }
        } catch(error) {
            this.errors.Push(error instanceof Error ? error : new Error(error.toString()));
        } finally {
            await this.storageController.RemoveTemporary(...resourcemap.values());
            this.UpdateProgress(resourcemap.size);
            this.status.Value = this.errors.Value.length > 0 ? Status.Failed : Status.Completed;
            this.Abort = this.DisabledAbort;
        }
    }

    private DisabledAbort(/*_reason?: string*/) { /* NO-OP */ }

    public Abort = this.DisabledAbort;

    /**
     * State accessors for subclasses (e.g. the collection/omnibus task), which
     * must not touch the private observables directly.
     */
    protected ResetErrors(): void {
        this.errors.Value = [];
    }

    protected SetStatus(status: Status): void {
        this.status.Value = status;
    }

    protected SetProgress(progress: number): void {
        this.progress.Value = progress;
    }

    protected PushError(error: Error): void {
        this.errors.Push(error);
    }
}