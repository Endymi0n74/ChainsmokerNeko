import { DownloadTask, Status } from './DownloadTask';
import { Priority } from './taskpool/DeferredTask';
import type { Chapter } from './providers/MangaPlugin';
import type { MediaItem, StoreableMediaContainer } from './providers/MediaPlugin';
import { type StorageController, SanitizeFileName } from './StorageController';
import { Key, Scope } from './SettingsGlobal';
import { type Choice, type Check, type Directory } from './SettingsManager';
import { CreateCollectionExportRegistry, MangaExportFormat } from './exporters/MangaExporterRegistry';
import type { CollectionVolume } from './exporters/CollectionExporter';

/**
 * Builds the minimal `Media`-shaped descriptor the download-manager UI reads
 * (title + parent chain) for a collection task.
 */
function CreateCollectionMedia(chapters: Chapter[], volumeTitle: string) {
    const manga = chapters[0]?.Parent;
    return {
        Title: volumeTitle,
        Parent: {
            Title: manga?.Title ?? 'Collection',
            Identifier: manga?.Identifier ?? 'collection',
            Parent: { Title: manga?.Parent?.Title ?? 'Collection' },
        },
    };
}

/**
 * Downloads every page of several chapters and merges them into a single volume
 * file ("collection / omnibus" export) using the configured export format
 * (CBZ, EPUB or PDF; image-folder formats fall back to CBZ).
 *
 * A chapter that fails to download is skipped and reported as an error instead
 * of aborting the whole collection, so one broken chapter does not lose the
 * successfully downloaded ones.
 */
export class CollectionDownloadTask extends DownloadTask {

    public readonly Chapters: ReadonlyArray<Chapter>;
    private readonly storage: StorageController;

    constructor(chapters: Chapter[], private readonly volumeTitle: string, storageController: StorageController) {
        super(CreateCollectionMedia(chapters, volumeTitle) as unknown as StoreableMediaContainer<MediaItem>, storageController);
        this.Chapters = chapters;
        this.storage = storageController;
    }

    public override async Run(): Promise<void> {
        if (this.Status.Value === Status.Downloading || this.Status.Value === Status.Processing) {
            return;
        }
        this.ResetErrors();
        this.SetStatus(Status.Downloading);
        this.SetProgress(0);

        const volumes: CollectionVolume[] = [];
        const temporaryFiles: string[] = [];

        try {
            const cancellator = new AbortController();
            this.Abort = cancellator.abort.bind(cancellator);

            // Phase 1 — resolve the page lists of every chapter, so the total
            // page count is known before any image is downloaded (progress).
            let totalPages = 0;
            const updates = this.Chapters.map(async chapter => {
                await chapter.Update();
                totalPages += chapter.Entries.Value.length;
            });
            const updateResults = await Promise.allSettled(updates);
            const failedChapters = new Set<Chapter>();
            updateResults.forEach((result, index) => {
                if (result.status === 'rejected') {
                    failedChapters.add(this.Chapters[index]);
                    this.PushError(result.reason instanceof Error ? result.reason : new Error(String(result.reason)));
                    console.warn('[KUMO] CollectionDownloadTask: chapter update failed, skipping', this.Chapters[index]?.Title, result.reason);
                }
            });

            // Phase 2 — download the images of every chapter that resolved.
            if (totalPages === 0 && failedChapters.size === this.Chapters.length) {
                throw new Error('No chapters could be loaded');
            }
            let processed = 0;
            for(const chapter of this.Chapters) {
                if (failedChapters.has(chapter)) continue;
                if (cancellator.signal.aborted) {
                    throw new Error('Download aborted');
                }
                const resourcemap = new Map<number, string>();
                const promises = chapter.Entries.Value.map(async (item, index) => {
                    try {
                        const data = await item.Fetch(Priority.Low, cancellator.signal);
                        // Skip empty or non-image blobs (e.g. JapScan CDN resources, placeholders)
                        if (data instanceof Blob && (data.size === 0 || (data.type.length > 0 && !data.type.startsWith('image/')))) {
                            return;
                        }
                        const resource = await this.storage.SaveTemporary(data);
                        resourcemap.set(index, resource);
                        processed++;
                        this.SetProgress(totalPages > 0 ? processed / totalPages : 0);
                    } catch (error) {
                        this.PushError(error instanceof Error ? error : new Error(String(error)));
                        throw error;
                    }
                });
                await Promise.allSettled(promises);

                // Re-index so the exported file numbering stays contiguous when
                // empty blobs were skipped.
                const reindexed = new Map<number, string>();
                let newIdx = 0;
                for(let i = 0; i < chapter.Entries.Value.length; i++) {
                    if (resourcemap.has(i)) {
                        reindexed.set(newIdx++, resourcemap.get(i));
                    }
                }
                if (reindexed.size > 0) {
                    volumes.push({ title: chapter.Title, resources: reindexed });
                    temporaryFiles.push(...reindexed.values());
                }
            }

            // Phase 3 — merge the successful chapters into a single volume.
            if (volumes.length > 0) {
                this.SetStatus(Status.Processing);
                await this.StoreCollection(volumes);
            }
        } catch (error) {
            this.PushError(error instanceof Error ? error : new Error(String(error)));
        } finally {
            await this.storage.RemoveTemporary(...temporaryFiles);
            this.SetProgress(1);
            this.SetStatus(this.Errors.Value.length > 0 ? Status.Failed : Status.Completed);
            this.Abort = this.#NoOpAbort;
        }
    }

    #NoOpAbort(/*_reason?: string*/) { /* NO-OP */ }

    private async StoreCollection(volumes: CollectionVolume[]): Promise<void> {
        const settings = HakuNeko.SettingsManager.OpenScope(Scope);
        const directory = settings.Get<Directory>(Key.MediaDirectory);
        await directory.EnsureAccess();
        let output = directory.Value;
        const manga = this.Chapters[0]?.Parent;
        if (settings.Get<Check>(Key.UseWebsiteSubDirectory).Value && manga?.Parent) {
            const website = SanitizeFileName(manga.Parent.Title);
            output = await output.getDirectoryHandle(website, { create: true });
        }
        if (manga) {
            output = await output.getDirectoryHandle(SanitizeFileName(manga.Title), { create: true });
        }

        const format = settings.Get<Choice>(Key.MangaExportFormat).Value;
        const registry = CreateCollectionExportRegistry(this.storage);
        const exporter = registry[format] ?? registry[MangaExportFormat.CBZ];
        const seriesTitle = manga?.Title ?? 'Collection';
        const exporterOptions = {
            theme: settings.Get<Choice>(Key.PDFTheme).Value,
            doublePage: settings.Get<Check>(Key.PDFDoublePage).Value,
        };
        await exporter.ExportCollection(volumes, output, this.volumeTitle, seriesTitle, exporterOptions);
    }
}
