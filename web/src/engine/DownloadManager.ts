import { DownloadTask, Status } from './DownloadTask';
import { CollectionDownloadTask } from './CollectionDownloadTask';
import type { Chapter } from './providers/MangaPlugin';
import { ObservableArray, type IObservable } from './Observable';
import type { StoreableMediaContainer, MediaItem } from './providers/MediaPlugin';
import type { StorageController } from './StorageController';
import { Delay, SetTimeout } from './BackgroundTimers';

const PROCESS_STALL_TIMEOUT_MS = 20_000;

export class DownloadManager {

    private processing = false;
    private queue = new ObservableArray<DownloadTask, DownloadManager>([], this);
    private queueTransactionLock = false;

    constructor(private readonly storageController: StorageController) {}

    public get Queue(): IObservable<DownloadTask[], DownloadManager> {
        return this.queue;
    }

    /**
     * Perform an (almost) thread/concurrency safe operation on {@link queue}
     */
    private async InvokeQueueTransaction<R>(transaction: () => R): Promise<R> {
        try {
            while(this.queueTransactionLock) await Delay(5);
            this.queueTransactionLock = true;
            return transaction();
        } finally {
            this.queueTransactionLock = false;
        }
    }

    /**
     * Add the given {@link containers} to the download queue.
     * Only containers that are not present in the download queue will be added.
     */
    public async Enqueue(...containers: StoreableMediaContainer<MediaItem>[]): Promise<void> {
        await this.InvokeQueueTransaction(() => {
            const tasks = containers.distinct()
                .filter(container => this.queue.Value.none(task => task.Media.IsSameAs(container)))
                .map(container => new DownloadTask(container, this.storageController));
            this.queue.Push(...tasks);
        });
        this.Process();
    }

    /**
     * Add a "collection / omnibus" task to the download queue: every page of the
     * given {@link chapters} is downloaded and merged into a single volume file.
     * Only chapters that are not already part of a queued task are added.
     */
    public async EnqueueCollection(chapters: Chapter[], volumeTitle = 'Omnibus'): Promise<void> {
        if (chapters.length === 0) {
            return;
        }
        await this.InvokeQueueTransaction(() => {
            const task = new CollectionDownloadTask(chapters, volumeTitle, this.storageController);
            this.queue.Push(task);
        });
        this.Process();
    }

    /**
     * Remove the given {@link tasks} from the download queue.
     * Only tasks that are present in the download queue will be removed.
     */
    public async Dequeue(...tasks: DownloadTask[]): Promise<void> {
        await this.InvokeQueueTransaction(() => {
            this.queue.Value = this.queue.Value.filter(task => {
                if(tasks.includes(task)) {
                    task.Abort();
                    return false;
                } else {
                    return true;
                }
            });
        });
    }

    private async Process() {
        if(this.processing) {
            return;
        }
        this.processing = true;

        while(this) {
            try {
                const task = await this.InvokeQueueTransaction(() => this.queue.Value.find(task => task.Status.Value === Status.Queued));
                if(task) {
                    await this.RunWithStallGuard(task);
                } else {
                    await new Promise<void>(resolve => SetTimeout(resolve, 750));
                }
            } catch { /* IGNORE */ }
        }

        this.processing = false;
    }

    private async RunWithStallGuard(task: DownloadTask): Promise<void> {
        let lastStatus = task.Status.Value;
        let lastProgress = task.Progress.Value;
        let lastActivity = Date.now();
        const poll = async (): Promise<void> => {
            while (task.Status.Value === Status.Queued || task.Status.Value === Status.Downloading || task.Status.Value === Status.Processing) {
                await Delay(1000);
                if (task.Status.Value !== lastStatus || task.Progress.Value !== lastProgress) {
                    lastStatus = task.Status.Value;
                    lastProgress = task.Progress.Value;
                    lastActivity = Date.now();
                } else if (Date.now() - lastActivity >= PROCESS_STALL_TIMEOUT_MS) {
                    task.Abort();
                    return;
                }
            }
        };
        await Promise.race([task.Run(), poll()]);
        if (task.Status.Value === Status.Downloading || task.Status.Value === Status.Processing) {
            task.Abort();
            await Delay(1000);
        }
    }
}