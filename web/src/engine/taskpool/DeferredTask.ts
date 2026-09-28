export const enum Priority {
    /**
     * For background processing such as queued downloads
     */
    Low = 2,
    /**
     * ...
     */
    Normal = 4,
    /**
     * For realtime processing such as user interaction
     */
    High = 6,
}

export class DeferredTask<T> {

    public readonly Promise: Promise<T>;
    private resolve: (value: T) => void;
    private reject: (error: Error) => void;

    constructor(private readonly action: () => Promise<T>, public readonly Priority: Priority, public readonly Signal?: AbortSignal) {
        // TODO: Consider using `Promise.withResolvers()` instead
        this.Promise = new Promise<T>((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }

    public RejectWhenAborted(): boolean {
        if(this.Signal?.aborted) {
            // NOT `null`: WebIDL converts it to the literal string "null", which then
            // surfaced as `null` in the task's error list with no hint of an abort.
            this.reject(new DOMException('Aborted', 'AbortError'));
            return true;
        }
        return false;
    }

    public async Run(): Promise<void> {
        try {
            if(!this.RejectWhenAborted()) {
                this.resolve(await this.action());
            }
        } catch(error) {
            this.reject(error);
        }
    }
}