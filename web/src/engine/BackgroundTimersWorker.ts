/// <reference lib="webworker" />

type Payload = { action: string } & Record<string, any>;

addEventListener('message', (event: MessageEvent<Payload>) => {
    const payload = event.data;
    switch(payload.action) {
        case 'Worker::SetTimeout': return SetTimeout(payload._uid, payload.ms);
        case 'Worker::ClearTimeout': return ClearTimeout(payload.timerID);
    }
});

function SetTimeout(uid: string, ms: number): void {
    const timerID = setTimeout(() => postMessage({ action: 'BackgroundTimers::TickTimeout', timerID }), ms);
    postMessage({ action: uid, timerID });
}

function ClearTimeout(timerID: number): void {
    clearTimeout(timerID);
}