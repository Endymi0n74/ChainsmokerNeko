import { FetchProvider } from '../FetchProviderCommon';
import { SetChallengeTraceSink } from '../ChallengeTrace';
import type { FeatureFlags } from '../../FeatureFlags';
import type { IPC } from '../InterProcessCommunication';
import { Diagnostics, FetchProvider as Channels } from '../../../../../app/src/ipc/Channels';

// See: https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name
const fetchApiSupportedPrefix = 'X-FetchAPI-';
const fetchApiForbiddenHeaders = [
    'User-Agent',
    'Referer',
    'Cookie',
    'Origin',
    'Host',
    'Sec-Fetch-Mode',
    'Sec-Fetch-Dest',
    'Sec-Fetch-Site',
];

function ConcealHeaders(init: HeadersInit): Headers {
    const headers = new Headers(init);
    for(const name of fetchApiForbiddenHeaders) {
        if(headers.has(name)) {
            headers.set(fetchApiSupportedPrefix + name, headers.get(name));
            headers.delete(name);
        }
    }
    return headers;
}

class FetchRequest extends Request {
    readonly #referrer: string = undefined;
    public override get referrer() { return this.#referrer; }
    constructor(input: URL | RequestInfo, init?: RequestInit) {
        if(init?.headers) init.headers = ConcealHeaders(init.headers);
        super(input, init);
        if(init?.referrer) this.#referrer = init.referrer;
    }
}

export default class extends FetchProvider {

    constructor(private readonly ipc: IPC<Channels.App, Channels.Web>) {
        super();
    }

    public Initialize(featureFlags: FeatureFlags): void {

        super.Initialize(featureFlags);

        // Persist every challenge decision: the `Diagnostics.App.WriteLog` channel appends it to the
        // rotating `diagnostics.log` of the main process (which `HAKUNEKO_TRACE_DIR` can point at the
        // workspace). Installed BEFORE the "already initialized" guard below, so a second call can
        // never drop the sink. The NodeWebKit build has no such channel and keeps the console output.
        SetChallengeTraceSink(this.Trace.bind(this));

        // Abuse the global Request type to check if system is already initialized
        if(globalThis.Request === FetchRequest) {
            return;
        }

        // NOTE: Monkey patching of the browser's native functionality to allow forbidden headers
        globalThis.Request = FetchRequest;

        this.ipc.Send(Channels.App.Initialize, fetchApiSupportedPrefix);
    }

    /**
     * Appends one challenge trace line to the main process log, fire and forget.
     *
     * The renderer IPC is typed per channel namespace while its runtime is a plain channel string, so
     * the (documented) widening below is the only way to reach the diagnostics channel from here.
     */
    private Trace(line: string): void {
        void (this.ipc as unknown as IPC<string, string>).Send(Diagnostics.App.WriteLog, line).catch(() => {});
    }

    protected async FetchCore(request: Request): Promise<Response> {
        const response = await fetch(request);
        await super.ValidateResponse(response);
        return response;
    }
}