/// <reference lib="webworker" />

import Fuse from 'fuse.js';

type Payload = { action: string } & Record<string, any>;

let fuse: Fuse<{ title: string }> | undefined;

addEventListener('message', (event: MessageEvent<Payload>) => {
    switch(event.data.action) {
        case 'FuseSearch::SetCollection': return SetCollection(event.data.titles);
        case 'FuseSearch::Search': return Search(event.data.requestID, event.data.query);
    }
});

function SetCollection(titles: string[]): void {
    fuse = new Fuse(titles.map(title => ({ title })), {
        keys: ['title'],
        threshold: 0.4,
        ignoreLocation: true,
        minMatchCharLength: 2,
        fieldNormWeight: 0.3,
    });
    postMessage({ action: 'FuseSearch::Ready' });
}

function Search(requestID: string, query: string): void {
    const indices = fuse ? fuse.search(query).map(result => result.refIndex) : [];
    postMessage({ action: requestID, indices });
}
