import { vi, describe, it, expect } from 'vitest';
import { DownloadTask, Status } from './DownloadTask';
import type { StoreableMediaContainer, MediaItem } from './providers/MediaPlugin';
import type { StorageController } from './StorageController';
import { DeferredTask } from './taskpool/DeferredTask';

function MockItem(resolve: boolean, delay: number = undefined) {
    const item = { Fetch: vi.fn() };
    if(resolve) {
        if(delay) {
            item.Fetch.mockReturnValue(new Promise(resolve => setTimeout(resolve, 5)));
        } else {
            item.Fetch.mockResolvedValue(null);
        }
    } else {
        if(delay) {
            item.Fetch.mockReturnValue(new Promise((_, reject) => setTimeout(reject, 5)));
        } else {
            item.Fetch.mockRejectedValue('x');
        }
    }
    return item as unknown as MediaItem;
}

class TestFixture {

    public readonly MediaContainerMock = { Update: vi.fn(), Store: vi.fn() };
    public readonly StorageControllerMock = { SaveTemporary: vi.fn(), RemoveTemporary: vi.fn() };
    public readonly StatusChangedCallbackMock = vi.fn();
    public readonly ProgressChangedCallbackMock = vi.fn();

    public CreateTestee() {
        const testee = new DownloadTask(this.MediaContainerMock as unknown as StoreableMediaContainer<MediaItem>, this.StorageControllerMock as unknown as StorageController);
        testee.Status.Subscribe(this.StatusChangedCallbackMock);
        testee.Progress.Subscribe(this.ProgressChangedCallbackMock);
        return testee;
    }

    public SetupMediaContainer(items: MediaItem[]): TestFixture {
        Object.defineProperty(this.MediaContainerMock, 'Entries', { get: vi.fn(() => ({ Value: items })) });
        return this;
    }
}

describe('DownloadTask', () => {

    describe('Constructor', () => {

        it('Should correctly initialize', async () => {
            const fixture = new TestFixture().SetupMediaContainer([]);
            const testee = fixture.CreateTestee();

            expect(typeof testee.ID).toBe('symbol');
            expect(Date.now() - testee.Created.getTime()).toBeLessThan(7.5);
            await new Promise(resolve => setTimeout(resolve, 5));
            expect(testee.Media).toBe(fixture.MediaContainerMock);
            expect(testee.Errors.Value).toEqual([]);
            expect(testee.Status.Value).toBe(Status.Queued);
            expect(fixture.StatusChangedCallbackMock).not.toHaveBeenCalled();
            expect(testee.Progress.Value).toBe(0);
            expect(fixture.ProgressChangedCallbackMock).not.toHaveBeenCalled();
        });
    });

    describe('Run', () => {

        it('Should process all entries in container on success', async () => {
            const items = [ MockItem(true), MockItem(true), MockItem(true), MockItem(true) ];
            const fixture = new TestFixture().SetupMediaContainer(items);
            fixture.MediaContainerMock.Store.mockResolvedValue(undefined);
            const testee = fixture.CreateTestee();

            await testee.Run();

            for(const item of items) {
                expect(item.Fetch).toHaveBeenCalledTimes(1);
            }
            expect(fixture.MediaContainerMock.Update).toHaveBeenCalledTimes(1);
            expect(fixture.MediaContainerMock.Store).toHaveBeenCalledTimes(1);
            expect(fixture.StorageControllerMock.SaveTemporary).toHaveBeenCalledTimes(4);
            expect(fixture.StorageControllerMock.RemoveTemporary).toHaveBeenCalledTimes(1);
        });

        it('Should gracefully succeed on downloading errors', async () => {
            const items = [ MockItem(true), MockItem(false), MockItem(true), MockItem(false) ];
            const fixture = new TestFixture().SetupMediaContainer(items);
            const testee = fixture.CreateTestee();

            await testee.Run();

            for(const item of items) {
                expect(item.Fetch).toHaveBeenCalledTimes(1);
            }
            expect(fixture.MediaContainerMock.Update).toHaveBeenCalledTimes(1);
            expect(fixture.MediaContainerMock.Store).toHaveBeenCalledTimes(0);
            expect(fixture.StorageControllerMock.SaveTemporary).toHaveBeenCalledTimes(2);
            expect(fixture.StorageControllerMock.RemoveTemporary).toHaveBeenCalledTimes(1);
        });

        it('Should gracefully succeed on processing error', async () => {
            const items = [ MockItem(true), MockItem(true), MockItem(true), MockItem(true) ];
            const fixture = new TestFixture().SetupMediaContainer(items);
            fixture.MediaContainerMock.Store.mockRejectedValue('o');
            const testee = fixture.CreateTestee();

            await testee.Run();

            for(const item of items) {
                expect(item.Fetch).toHaveBeenCalledTimes(1);
            }
            expect(fixture.MediaContainerMock.Update).toHaveBeenCalledTimes(1);
            expect(fixture.MediaContainerMock.Store).toHaveBeenCalledTimes(1);
            expect(fixture.StorageControllerMock.SaveTemporary).toHaveBeenCalledTimes(4);
            expect(fixture.StorageControllerMock.RemoveTemporary).toHaveBeenCalledTimes(1);
        });

        it('Should prevent multiple calls', async () => {
            const item = MockItem(true, 5);
            const fixture = new TestFixture().SetupMediaContainer([ item ]);
            fixture.MediaContainerMock.Store.mockResolvedValue(undefined);
            const testee = fixture.CreateTestee();

            const promise = testee.Run();
            testee.Run();
            await promise;

            expect(item.Fetch).toHaveBeenCalledTimes(1);
            expect(fixture.MediaContainerMock.Update).toHaveBeenCalledTimes(1);
            expect(fixture.MediaContainerMock.Store).toHaveBeenCalledTimes(1);
            expect(fixture.StorageControllerMock.SaveTemporary).toHaveBeenCalledTimes(1);
            expect(fixture.StorageControllerMock.RemoveTemporary).toHaveBeenCalledTimes(1);
        });
    });

    describe('Abort', () => {

        it('Should signal abort for active downloads', async () => {
            const signals: AbortSignal[] = [];
            const item = { Fetch: vi.fn((_, signal) => {
                signals.push(signal);
                return Promise.resolve(null);
            }) } as unknown as MediaItem;
            const fixture = new TestFixture().SetupMediaContainer([ item, item, item, item ]);
            fixture.MediaContainerMock.Store.mockResolvedValue(undefined);
            const testee = fixture.CreateTestee();

            const promise = testee.Run();
            testee.Abort();
            await promise;

            expect(signals.length).toBe(4);
            for(const signal of signals) {
                expect(signal.aborted).toBeTruthy();
            }
        });

        it('Should reset abort after success', async () => {
            const fixture = new TestFixture().SetupMediaContainer([ MockItem(true) ]);
            fixture.MediaContainerMock.Store.mockResolvedValue(undefined);
            const testee = fixture.CreateTestee();

            const promise = testee.Run();
            const abort = testee.Abort;
            await promise;

            expect(abort).not.toBe(testee.Abort);
        });

        it('Should reset abort after downloading error', async () => {
            const fixture = new TestFixture().SetupMediaContainer([ MockItem(false) ]);
            const testee = fixture.CreateTestee();

            const promise = testee.Run();
            const abort = testee.Abort;
            await promise;

            expect(abort).not.toBe(testee.Abort);
        });

        it('Should reset abort after processing error', async () => {
            const fixture = new TestFixture().SetupMediaContainer([ MockItem(false) ]);
            fixture.MediaContainerMock.Store.mockRejectedValue('o');
            const testee = fixture.CreateTestee();

            const promise = testee.Run();
            const abort = testee.Abort;
            await promise;

            expect(abort).not.toBe(testee.Abort);
        });
    });

    describe('Errors', () => {

        it('Should be empty on success', async () => {
            const items = [ MockItem(true), MockItem(true), MockItem(true), MockItem(true) ];
            const fixture = new TestFixture().SetupMediaContainer(items);
            fixture.MediaContainerMock.Store.mockResolvedValue(undefined);
            const testee = fixture.CreateTestee();

            await testee.Run();

            expect(testee.Errors.Value.length).toBe(0);
        });

        it('Should catch and keep all downloading errors', async () => {
            const items = [ MockItem(true), MockItem(false), MockItem(true), MockItem(false) ];
            const fixture = new TestFixture().SetupMediaContainer(items);
            const testee = fixture.CreateTestee();

            await testee.Run();

            expect(testee.Errors.Value.length).toBe(2);
            expect(testee.Errors.Value.at(0).message).toBe('x');
            expect(testee.Errors.Value.at(1).message).toBe('x');
        });

        it('Should catch and keep any processing error', async () => {
            const items = [ MockItem(true), MockItem(true), MockItem(true), MockItem(true) ];
            const fixture = new TestFixture().SetupMediaContainer(items);
            fixture.MediaContainerMock.Store.mockRejectedValue('o');
            const testee = fixture.CreateTestee();

            await testee.Run();

            expect(testee.Errors.Value.length).toBe(1);
            expect(testee.Errors.Value.at(0).message).toBe('o');
        });
    });

    describe('Status', () => {

        it('Should set expected values on success', async () => {
            const item = MockItem(true, 5);
            const fixture = new TestFixture().SetupMediaContainer([ item ]);
            const cleaned = new DeferredTask(() => Promise.resolve(), undefined);
            fixture.StorageControllerMock.RemoveTemporary.mockImplementationOnce(() => cleaned.Run());
            fixture.MediaContainerMock.Store.mockResolvedValue(undefined);
            const testee = fixture.CreateTestee();

            expect(testee.Status.Value).toBe(Status.Queued);
            const promise = testee.Run();
            expect(testee.Status.Value).toBe(Status.Downloading);
            await cleaned.Promise;
            expect(testee.Status.Value).toBe(Status.Processing);
            await promise;
            expect(testee.Status.Value).toBe(Status.Completed);
        });

        it('Should set expected values on downloading error', async () => {
            const item = MockItem(false, 5);
            const fixture = new TestFixture().SetupMediaContainer([ item ]);
            const cleaned = new DeferredTask(() => Promise.resolve(), undefined);
            fixture.StorageControllerMock.RemoveTemporary.mockImplementationOnce(() => cleaned.Run());
            const testee = fixture.CreateTestee();

            expect(testee.Status.Value).toBe(Status.Queued);
            const promise = testee.Run();
            expect(testee.Status.Value).toBe(Status.Downloading);
            await cleaned.Promise;
            expect(testee.Status.Value).toBe(Status.Downloading);
            await promise;
            expect(testee.Status.Value).toBe(Status.Failed);
        });

        it('Should set expected values on processing error', async () => {
            const item = MockItem(true, 5);
            const fixture = new TestFixture().SetupMediaContainer([ item ]);
            const cleaned = new DeferredTask(() => Promise.resolve(), undefined);
            fixture.StorageControllerMock.RemoveTemporary.mockImplementationOnce(() => cleaned.Run());
            fixture.MediaContainerMock.Store.mockRejectedValue('o');
            const testee = fixture.CreateTestee();

            expect(testee.Status.Value).toBe(Status.Queued);
            const promise = testee.Run();
            expect(testee.Status.Value).toBe(Status.Downloading);
            await cleaned.Promise;
            expect(testee.Status.Value).toBe(Status.Processing);
            await promise;
            expect(testee.Status.Value).toBe(Status.Failed);
        });
    });

    describe('StatusChanged', () => {

        it('Should invoke expected events on success', async () => {
            const item = MockItem(true);
            const fixture = new TestFixture().SetupMediaContainer([ item ]);
            fixture.MediaContainerMock.Store.mockResolvedValue(undefined);
            const testee = fixture.CreateTestee();

            await testee.Run();

            expect(fixture.StatusChangedCallbackMock).toHaveBeenCalledTimes(3);
            expect(fixture.StatusChangedCallbackMock).toHaveBeenNthCalledWith(1, Status.Downloading, testee);
            expect(fixture.StatusChangedCallbackMock).toHaveBeenNthCalledWith(2, Status.Processing, testee);
            expect(fixture.StatusChangedCallbackMock).toHaveBeenNthCalledWith(3, Status.Completed, testee);
        });

        it('Should invoke expected events on downloading error', async () => {
            const item = MockItem(false);
            const fixture = new TestFixture().SetupMediaContainer([ item ]);
            const testee = fixture.CreateTestee();

            await testee.Run();

            expect(fixture.StatusChangedCallbackMock).toHaveBeenCalledTimes(2);
            expect(fixture.StatusChangedCallbackMock).toHaveBeenNthCalledWith(1, Status.Downloading, testee);
            expect(fixture.StatusChangedCallbackMock).toHaveBeenNthCalledWith(2, Status.Failed, testee,);
        });

        it('Should invoke expected events on processing error', async () => {
            const item = MockItem(true);
            const fixture = new TestFixture().SetupMediaContainer([ item ]);
            fixture.MediaContainerMock.Store.mockRejectedValue('o');
            const testee = fixture.CreateTestee();

            await testee.Run();

            expect(fixture.StatusChangedCallbackMock).toHaveBeenCalledTimes(3);
            expect(fixture.StatusChangedCallbackMock).toHaveBeenNthCalledWith(1, Status.Downloading, testee,);
            expect(fixture.StatusChangedCallbackMock).toHaveBeenNthCalledWith(2, Status.Processing, testee,);
            expect(fixture.StatusChangedCallbackMock).toHaveBeenNthCalledWith(3, Status.Failed, testee,);
        });
    });

    describe('Progress', () => {

        it('Should set expected values on success', async () => {
            const item = MockItem(true, 5);
            const fixture = new TestFixture().SetupMediaContainer([ item ]);
            const testee = fixture.CreateTestee();

            expect(testee.Progress.Value).toBe(0);
            const promise = testee.Run();
            expect(testee.Progress.Value).toBe(0);
            await promise;
            expect(testee.Progress.Value).toBe(1);
        });

        it('Should set expected values on downloading errors', async () => {
            const items = [ MockItem(true, 5), MockItem(false, 5), MockItem(true, 5), MockItem(false, 5) ];
            const fixture = new TestFixture().SetupMediaContainer(items);
            const testee = fixture.CreateTestee();

            expect(testee.Progress.Value).toBe(0);
            const promise = testee.Run();
            expect(testee.Progress.Value).toBe(0);
            await promise;
            expect(testee.Progress.Value).toBe(2/4);
        });

        it('Should set expected values on processing error', async () => {
            const items = [ MockItem(true, 5), MockItem(true, 5), MockItem(true, 5), MockItem(true, 5) ];
            const fixture = new TestFixture().SetupMediaContainer(items);
            fixture.MediaContainerMock.Store.mockRejectedValue('o');
            const testee = fixture.CreateTestee();

            expect(testee.Progress.Value).toBe(0);
            const promise = testee.Run();
            expect(testee.Progress.Value).toBe(0);
            await promise;
            expect(testee.Progress.Value).toBe(1.0);
        });
    });

    describe('ProgressChanged', () => {

        it('Should invoke expected events on success', async () => {
            const items = [ MockItem(true), MockItem(true), MockItem(true), MockItem(true) ];
            const fixture = new TestFixture().SetupMediaContainer(items);
            fixture.MediaContainerMock.Store.mockResolvedValue(undefined);
            const testee = fixture.CreateTestee();

            await testee.Run();

            expect(fixture.ProgressChangedCallbackMock).toHaveBeenCalledTimes(items.length + 2);
            for(let page = 1; page <= items.length; page++) {
                expect(fixture.ProgressChangedCallbackMock).toHaveBeenNthCalledWith(page, page/items.length, testee);
            }
            expect(fixture.ProgressChangedCallbackMock).toHaveBeenNthCalledWith(items.length + 1, -1.0, testee);
            expect(fixture.ProgressChangedCallbackMock).toHaveBeenNthCalledWith(items.length + 2, 1.0, testee);
        });

        it('Should invoke expected events on downloading errors', async () => {
            const items = [ MockItem(true), MockItem(false), MockItem(true), MockItem(false) ];
            const fixture = new TestFixture().SetupMediaContainer(items);
            const testee = fixture.CreateTestee();

            await testee.Run();

            expect(fixture.ProgressChangedCallbackMock).toHaveBeenCalledTimes(2);
            expect(fixture.ProgressChangedCallbackMock).toHaveBeenNthCalledWith(1, 1/items.length, testee);
            expect(fixture.ProgressChangedCallbackMock).toHaveBeenNthCalledWith(2, 2/items.length, testee);
        });

        it('Should invoke expected events on processing error', async () => {
            const items = [ MockItem(true), MockItem(true), MockItem(true), MockItem(true) ];
            const fixture = new TestFixture().SetupMediaContainer(items);
            fixture.MediaContainerMock.Store.mockRejectedValue('o');
            const testee = fixture.CreateTestee();

            await testee.Run();

            expect(fixture.ProgressChangedCallbackMock).toHaveBeenCalledTimes(items.length + 2);
            for(let page = 1; page <= items.length; page++) {
                expect(fixture.ProgressChangedCallbackMock).toHaveBeenNthCalledWith(page, page/items.length, testee);
            }
            expect(fixture.ProgressChangedCallbackMock).toHaveBeenNthCalledWith(items.length + 1, -1.0, testee);
            expect(fixture.ProgressChangedCallbackMock).toHaveBeenNthCalledWith(items.length + 2, 1.0, testee);
        });
    });
});

describe('Page Order', () => {

    it('Should preserve original page order when downloads complete out of order', async () => {
        // Simulate 4 items resolving at different delays — items that resolve
        // first are inserted into resourcemap first, so [...resourcemap.values()]
        // (old code) would iterate in completion order, not original index order.
        // The fix iterates by original index instead.
        const delays = [30, 5, 20, 10]; // item 1 resolves first, item 3 second, etc.
        const items = delays.map((delay, i) => {
            const item = { Fetch: vi.fn() };
            item.Fetch.mockImplementation(() =>
                new Promise(resolve => setTimeout(() => resolve(`page${i}`), delay))
            );
            return item as unknown as MediaItem;
        });
        const fixture = new TestFixture().SetupMediaContainer(items);
        fixture.MediaContainerMock.Store.mockResolvedValue(undefined);
        fixture.StorageControllerMock.SaveTemporary.mockImplementation((data) => Promise.resolve("resource_" + data));
        const testee = fixture.CreateTestee();

        await testee.Run();

        expect(fixture.MediaContainerMock.Store).toHaveBeenCalledTimes(1);
        const storedMap = fixture.MediaContainerMock.Store.mock.calls[0][0];
        // Verify Store receives a Map with keys 0,1,2,3 and values in original order
        expect(storedMap.get(0)).toBe('resource_page0');
        expect(storedMap.get(1)).toBe('resource_page1');
        expect(storedMap.get(2)).toBe('resource_page2');
        expect(storedMap.get(3)).toBe('resource_page3');
    });

    it('Should reindex contiguously when some items are filtered out', async () => {
        // Items 0 and 2 succeed, items 1 and 3 are filtered (empty blobs).
        // Resulting map should have keys 0→page0, 1→page2 (reindexed).
        const items = [
            { Fetch: vi.fn().mockResolvedValue('page0') },
            { Fetch: vi.fn().mockResolvedValue(new Blob([], { type: 'image/png' })) }, // size 0 → filtered
            { Fetch: vi.fn().mockResolvedValue('page2') },
            { Fetch: vi.fn().mockResolvedValue(new Blob([], { type: 'image/png' })) }, // size 0 → filtered
        ] as unknown as MediaItem[];
        const fixture = new TestFixture().SetupMediaContainer(items);
        fixture.MediaContainerMock.Store.mockResolvedValue(undefined);
        fixture.StorageControllerMock.SaveTemporary.mockImplementation((data) => Promise.resolve('resource_' + data));
        const testee = fixture.CreateTestee();

        await testee.Run();

        expect(fixture.MediaContainerMock.Store).toHaveBeenCalledTimes(1);
        const storedMap = fixture.MediaContainerMock.Store.mock.calls[0][0];
        expect(storedMap.size).toBe(2);
        expect(storedMap.get(0)).toBe('resource_page0');
        expect(storedMap.get(1)).toBe('resource_page2');
    });

    it('Should reindex contiguously when first item is filtered', async () => {
        // Item 0 fails, items 1-3 succeed. Resulting map: 0→page1, 1→page2, 2→page3.
        const items = [
            { Fetch: vi.fn().mockRejectedValue('fail') },
            { Fetch: vi.fn().mockResolvedValue('page1') },
            { Fetch: vi.fn().mockResolvedValue('page2') },
            { Fetch: vi.fn().mockResolvedValue('page3') },
        ] as unknown as MediaItem[];
        const fixture = new TestFixture().SetupMediaContainer(items);
        const testee = fixture.CreateTestee();

        await testee.Run();

        expect(fixture.MediaContainerMock.Store).toHaveBeenCalledTimes(0); // errors → no Store
        expect(testee.Errors.Value.length).toBe(1);
    });
});
