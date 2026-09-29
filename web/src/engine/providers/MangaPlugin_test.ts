import { vi, describe, it, expect } from 'vitest';
import { MangaPlugin } from './MangaPlugin';
import type { StorageController } from '../StorageController';
import type { ISettings, SettingsManager } from '../SettingsManager';
import KomaScans from '../websites/KomaScans';
import { Tags } from '../Tags';

describe('MangaPlugin', () => {

    function CreatePlugin(storedEntries: { id: string, title: string }[] = []): MangaPlugin {
        const storage = {
            LoadPersistent: vi.fn(async (_store: unknown, key?: string) => key === 'komascans' ? storedEntries : undefined),
            SavePersistent: vi.fn(async () => undefined),
            RemovePersistent: vi.fn(async () => undefined),
        } as unknown as StorageController;
        const settings = {
            Initialize: vi.fn(async () => undefined),
            Get: vi.fn(() => undefined),
        } as unknown as ISettings;
        const settingsManager = {
            OpenScope: vi.fn(() => settings),
        } as unknown as SettingsManager;
        return new MangaPlugin(storage, settingsManager, new KomaScans());
    }

    it('Should include the tags provided by the website when creating an entry', () => {
        const plugin = CreatePlugin();
        expect(plugin.CreateEntry('/es/series/nano-machine', 'Nano Machine').Tags.Value).toEqual([ Tags.Language.Spanish ]);
    });

    it('Should restore the tags of the mangas which are loaded from the local media list cache', async () => {
        const plugin = CreatePlugin([
            { id: '/fr/series/the-greatest-estate-developer', title: 'The Greatest Estate Developer' },
            { id: '/en/series/the-greatest-estate-developer', title: 'The Greatest Estate Developer' },
        ]);
        await vi.waitFor(() => expect(plugin.Entries.Value).toHaveLength(2));
        expect(plugin.Entries.Value.map(entry => entry.Tags.Value)).toEqual([
            [ Tags.Language.French ],
            [ Tags.Language.English ],
        ]);
    });
});
