import type { PluginController } from '../PluginController';
import { MediaContainer, type MediaChild } from './MediaPlugin';
import { MangaPlugin } from './MangaPlugin';
import { type StorageController, Store } from '../StorageController';
import type { InteractiveFileContentProvider } from '../InteractiveFileContentProvider';
import { ConvertToSerializedBookmark } from '../transformers/BookmarkConverter';
import { Bookmark, MissingWebsite, type BookmarkSerialized } from './Bookmark';
import { MissingInfoTracker } from '../trackers/IMediaInfoTracker';
import { NotImplementedError } from '../Error';
import { Key as GlobalKey } from '../SettingsGlobal';
import { type Check, type Numeric } from '../SettingsManager';

/**
 * localStorage key holding the timestamp (ms) of the last bookmark new-content
 * check, so the lazy scan (Suggestions view) runs only once per period.
 */
export const CheckNewContentTimestampKey = 'check-new-content-last-run';

/**
 * True when the bookmark new-content check should run again: either it never
 * ran, or the configured period (in minutes) has elapsed since the last run.
 */
export function ShouldRefreshContentFlags(lastRun: number, now: number, periodMinutes: number): boolean {
    return !lastRun || now - lastRun >= periodMinutes * 60_000;
}

export type BookmarkImportResult = {
    cancelled: boolean;
    found: number;
    imported: number;
    skipped: number;
    broken: number;
}

export type BookmarkExportResult = {
    cancelled: boolean;
    exported: number;
}

const defaultBookmarkFileType: FilePickerAcceptType = {
    description: 'HakuNeko Bookmarks',
    accept: {
        'application/json': [ '.bookmarks' ]
    }
};

export class BookmarkPlugin extends MediaContainer<Bookmark> {

    constructor(private readonly storage: StorageController, private readonly plugins: PluginController, private readonly fileIO: InteractiveFileContentProvider) {
        super('bookmarks', 'Bookmarks');
        this.Load();
    }

    private readonly OnUpdatedChangedCallback = (_: Date, sender: Bookmark) => {
        this.storage.SavePersistent<BookmarkSerialized>(this.Serialize(sender), Store.Bookmarks, sender.StorageKey);
        this.entries.Dispatch();
    };

    private Deserialize(serialized: BookmarkSerialized): Bookmark {
        const parent = this.plugins.WebsitePlugins.find(plugin => plugin.Identifier === serialized.Media.ProviderID) ?? new MissingWebsite(serialized.Media.ProviderID);
        const tracker = this.plugins.InfoTrackers.find(tracker => tracker.Identifier === serialized.Info.ProviderID) ?? new MissingInfoTracker(serialized.Info.ProviderID);
        const bookmark = new Bookmark(
            new Date(serialized.Created),
            new Date(serialized.Updated),
            parent,
            serialized.Media.EntryID,
            serialized.Title,
            tracker,
            serialized.Info?.EntryID
        );
        bookmark.Updated.Subscribe(this.OnUpdatedChangedCallback);
        return bookmark;
    }

    private async Load() {
        const bookmarks = await this.storage.LoadPersistent<BookmarkSerialized[]>(Store.Bookmarks);
        this.entries.Value = bookmarks.map(bookmark => this.Deserialize(bookmark));
    }

    public async RefreshAllFlags(skipWindowSites = false) {
        for (const media of super.Entries.Value) {
            if (skipWindowSites && this.RequiresVisibleWindow(media)) continue;
            try {
                await media.Update();
                HakuNeko.ItemflagManager.LoadContainerFlags(media);
            } catch {
                // Skip bookmarks whose site is unreachable (e.g. CrunchyScan
                // without cf_clearance). Prevents one failing site from
                // aborting the entire new-content scan.
                continue;
            }
        }
    }

    private RequiresVisibleWindow(bookmark: Bookmark): boolean {
        return bookmark.Parent instanceof MangaPlugin && bookmark.Parent.Scraper.RequiresVisibleBrowserWindow;
    }

    /**
     * Lazy replacement for the old boot-time flag preload: refreshes the flags of
     * all bookmarks only when the Suggestions view is opened AND the configured
     * period (check-new-content-period, default 1440 min) has elapsed. Fetching a
     * bookmark's chapters opens a real browser window for Cloudflare-protected
     * sites (e.g. CrunchyScan), so this must not run on every app launch.
     */
    /**
     * Refreshes the new-content flags of all bookmarks when the configured period
     * has elapsed, or immediately when `force` is set (manual trigger from the
     * Suggestions view).
     */
    public async RefreshFlagsIfDue(force = false): Promise<void> {
        const settings = HakuNeko.SettingsManager.OpenScope();
        if (!settings.Get<Check>(GlobalKey.CheckNewContent).Value) return;
        const periodMinutes = settings.Get<Numeric>(GlobalKey.CheckNewContentPeriod).Value;
        const lastRun = Number(window.localStorage.getItem(CheckNewContentTimestampKey) ?? 0);
        if (force || ShouldRefreshContentFlags(lastRun, Date.now(), periodMinutes)) {
            // When manually triggered (force), always check all bookmarks
            // including window-required sites like CrunchyScan.
            const silent = !force && settings.Get<Check>(GlobalKey.CheckNewContentSilent).Value;
            try {
                await this.RefreshAllFlags(silent);
            } finally {
                // Mémorise le scan même si un site échoue (ex. CrunchyScan sans
                // cf_clearance lève pendant Update) — sinon le scan retenterait
                // à chaque affichage de la vue Suggestions.
                window.localStorage.setItem(CheckNewContentTimestampKey, `${Date.now()}`);
            }
        }
    }

    public async Import(): Promise<BookmarkImportResult> {
        let data: Blob;
        const result: BookmarkImportResult = {
            cancelled: false,
            found: 0,
            imported: 0,
            skipped: 0,
            broken: 0,
        };
        try {
            data = await this.fileIO.LoadFile({
                types: [ defaultBookmarkFileType ]
            });
        } catch(error) {
            if(this.fileIO.IsAbortError(error)) {
                result.cancelled = true;
                return result;
            } else {
                throw error;
            }
        }
        const found = (JSON.parse(await data.text()) as Array<unknown>).map(entry => this.Deserialize(ConvertToSerializedBookmark(entry)));
        result.found = found.length;
        const imported = found.filter(bookmark => this.Entries.Value.none(entry => entry.IsSameAs(bookmark)));
        for(const bookmark of imported) {
            await this.storage.SavePersistent<BookmarkSerialized>(this.Serialize(bookmark), Store.Bookmarks, bookmark.StorageKey);
        }
        await this.Load();
        result.imported = imported.length;
        result.skipped = found.length - imported.length;
        result.broken = imported.filter(entry => entry.Parent instanceof MissingWebsite).length;
        return result;
    }

    public async Export(): Promise<BookmarkExportResult> {
        const bookmarks = super.Entries.Value.map(bookmark => this.Serialize(bookmark));
        const result: BookmarkExportResult = {
            cancelled: false,
            exported: 0
        };
        const data = new Blob([ JSON.stringify(bookmarks, null, 2) ], { type: 'application/json' });
        const today = new Date(Date.now() - 60000 * new Date().getTimezoneOffset()).toISOString().split('T').at(0);
        try {
            await this.fileIO.SaveFile(data, {
                suggestedName: `HakuNeko (${today}).bookmarks`,
                types: [ defaultBookmarkFileType ]
            });
            result.exported = bookmarks.length;
            return result;
        } catch(error) {
            if(this.fileIO.IsAbortError(error)) {
                result.cancelled = true;
                return result;
            } else {
                throw error;
            }
        }
    }

    private Serialize(bookmark: Bookmark): BookmarkSerialized {
        return {
            Created: bookmark.Created.getTime(),
            Updated: bookmark.Updated.Value.getTime(),
            Title: bookmark.Title,
            Media: {
                ProviderID: bookmark.Parent.Identifier,
                EntryID: bookmark.Identifier
            },
            Info: {
                ProviderID: bookmark.Tracker?.Identifier ?? null,
                EntryID: bookmark.InfoID ?? null
            }
        };
    }

    public async Add(entry: MediaContainer<MediaContainer<MediaChild>>) {
        if(this.IsBookmarked(entry)) {
            // TODO: Keep duplicate bookmark, or replace with new one?
            return;
        }
        const now = new Date();
        const bookmark = new Bookmark(now, now, entry.Parent, entry.Identifier, entry.Title);
        bookmark.Updated.Subscribe(this.OnUpdatedChangedCallback);
        this.entries.Push(bookmark);
        await this.storage.SavePersistent<BookmarkSerialized>(this.Serialize(bookmark), Store.Bookmarks, bookmark.StorageKey);
    }

    public async Remove(bookmark: Bookmark) {
        bookmark.Updated.Unsubscribe(this.OnUpdatedChangedCallback);
        this.entries.Value = super.Entries.Value.filter(entry => entry !== bookmark);
        await this.storage.RemovePersistent(Store.Bookmarks, bookmark.StorageKey);
    }

    public async Toggle(entry: MediaContainer<MediaContainer<MediaChild>>): Promise<boolean> {
        const bookmark = this.Find(entry);
        if (bookmark) {
            await this.Remove(bookmark);
            return false;
        }
        else {
            await this.Add(entry);
            return true;
        }
    }

    public Find(entry: MediaContainer<MediaChild>): Bookmark | undefined {
        return this.Entries.Value.find(bookmark => bookmark.IsSameAs(entry));
    }

    public IsBookmarked(entry: MediaContainer<MediaChild>): boolean {
        return !!this.Find(entry);
    }

    /*
    public override async Initialize(): Promise<void> {
        await super.Initialize();
        await this.Load();
    }
    */

    protected async PerformUpdate(): Promise<Bookmark[]> {
        throw new NotImplementedError();
    }

    public async Update(): Promise<void> {
        await this.Load();
    }

    public async GetEntriesWithUnflaggedContent(): Promise<Bookmark[]> {
        const results = await Promise.all(this.Entries.Value.map(async bookmark => (await bookmark.GetUnflaggedContent()).length > 0));
        return this.Entries.Value.filter((_, index) => results[index]);
    }
}