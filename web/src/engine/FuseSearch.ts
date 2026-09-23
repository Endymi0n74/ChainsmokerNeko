/**
 * Delegates the fuzzy index/search to a web worker so that searching tens of
 * thousands of titles does not block the UI thread.
 */

import FuseSearchWorker from './FuseSearchWorker.ts?worker&inline';

type Payload = { action: string } & Record<string, any>;

const worker = new FuseSearchWorker();
const pending = new Map<string, (indices: number[]) => void>();

worker.addEventListener('message', (event: MessageEvent<Payload>) => {
    const { action, indices } = event.data;
    if (pending.has(action)) {
        pending.get(action).call(undefined, indices ?? []);
        pending.delete(action);
    }
});

function GenerateUID(): string {
    return `${Date.now()}${Math.random()}`;
}

/**
 * Rebuilds the fuzzy index from the given titles. The order must match the list
 * the caller maps the returned indices back onto.
 */
export function SetFuseCollection(titles: string[]): void {
    worker.postMessage({ action: 'FuseSearch::SetCollection', titles });
}

/**
 * Searches the indexed titles and resolves with the indices of the matches
 * (in score order).
 */
export function SearchFuse(query: string): Promise<number[]> {
    return new Promise(resolve => {
        const requestID = GenerateUID();
        pending.set(requestID, resolve);
        worker.postMessage({ action: 'FuseSearch::Search', requestID, query });
    });
}
