import { vi, describe, it, expect } from 'vitest';
import type { HakuNeko } from '../../engine/HakuNeko';
import type { Choice, ISettings, SettingsManager } from '../SettingsManager';
import { LocaleID } from '../../i18n/ILocale';
import { Key } from '../SettingsGlobal';
import { Exception } from '../Error';
import { Runtime, type PlatformInfo } from './PlatformInfo';
import { CreateRemoteBrowserWindow } from './RemoteBrowserWindow';

// Mocking globals so that Exception.message can resolve the en-US locale
{
    const mockChoice = { Value: LocaleID.Locale_enUS } as unknown as Choice;
    const mockSettings = { Get: vi.fn(key => key === Key.Language ? mockChoice : undefined) } as unknown as ISettings;
    const mockSettingsManager = { OpenScope: vi.fn(() => mockSettings) } as unknown as SettingsManager;

    globalThis.HakuNeko = Object.assign(globalThis.HakuNeko ?? {}, {
        SettingsManager: mockSettingsManager
    }) as unknown as HakuNeko;
}

describe('CreateRemoteBrowserWindow', () => {

    const unsupportedRuntimes = [
        Runtime.Unknown,
        Runtime.Deno,
        Runtime.Node,
        Runtime.Chrome,
        Runtime.Gecko,
        Runtime.WebKit,
    ];

    it.each(unsupportedRuntimes)(`Should raise a localized exception for runtime '%s'`, (runtime: Runtime) => {
        try {
            CreateRemoteBrowserWindow({ Runtime: runtime } as PlatformInfo);
            throw new Error('Expected CreateRemoteBrowserWindow to throw!');
        } catch(error) {
            expect(error).toBeInstanceOf(Exception);
            expect(error.name).toBe('Exception<FetchProvider_FetchWindow_UnsupportedEnvironmentError>');
            expect(error.message).toContain(runtime);
        }
    });
});
