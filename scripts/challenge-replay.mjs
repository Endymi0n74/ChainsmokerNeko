import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as puppeteer from 'puppeteer-core';

/**
 * Challenge replay harness — the "no more guessing" half of the Cloudflare work.
 *
 * It launches the REAL application (`app/electron/build`, i.e. the same code and the same window
 * flow the user runs) on the REAL profile (whose `cf_clearance` is warm), drives the engine through
 * the app's own renderer — exactly like `web/src/engine/websites/*_e2e.ts` do — and captures
 * everything a diagnosis needs into one session directory:
 *
 *   trace.log       the app's `diagnostics.log` (every `[KUMO]` decision, one line each)
 *   console.log     the renderer console as CDP saw it
 *   cookies.json    cookie METADATA only (names, domains, flags) — never a value
 *   frames.json     the debugger's frame tree of the application page
 *   screenshots/    one capture before the run, one after, one per failure
 *   session.json    the per-step outcome, durations and the app/user-agent facts
 *
 * It deliberately does NOT click a Turnstile: the interactive challenge is a human step, and
 * automating it would be both unreliable and hostile to the site. It removes the guessing, not the
 * click — solve the challenge in the window it opens and the trace records what the engine did.
 *
 * Usage (from the repository root):
 *   node scripts/challenge-replay.mjs --site japscan --manga https://www.japscan.foo/manga/dreamland/
 *   node scripts/challenge-replay.mjs --site crunchyscan --manga https://crunchyscan.org/lecture-en-ligne/xxx/
 * Run `--help` for every option. The build must exist: `npm run build:web && npm --workspace=app/electron run build`.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AppDirectory = path.join(root, 'app', 'electron', 'build');
const DefaultProfile = path.join(root, 'app', 'electron', '.user-data');
const LocalServerPort = 64210;

const Sites = {
    japscan: {
        id: 'japscan',
        // A whole volume is the case the reader-first extraction was built for.
        manga: 'https://www.japscan.foo/manga/dreamland/',
        chapter: '/manga/dreamland/volume-24/',
    },
    crunchyscan: {
        id: 'crunchyscan',
        manga: 'https://crunchyscan.org/lecture-en-ligne/demon-slayer/',
        chapter: undefined,
    },
};

function ParseArguments(argv) {
    const options = {
        site: 'japscan',
        manga: undefined,
        chapter: undefined,
        profile: DefaultProfile,
        out: undefined,
        timeout: 300_000,
        image: true,
        listing: false,
        force: false,
        keepOpen: false,
        help: false,
    };
    for (let index = 0; index < argv.length; index++) {
        const [ flag, inline ] = argv[index].split('=');
        const value = inline ?? argv[index + 1];
        const take = () => { if (inline === undefined) index++; return value; };
        switch (flag) {
            case '--site': options.site = take(); break;
            case '--manga': options.manga = take(); break;
            case '--chapter': options.chapter = take(); break;
            case '--profile': options.profile = path.resolve(take()); break;
            case '--out': options.out = path.resolve(take()); break;
            case '--timeout': options.timeout = Number(take()); break;
            case '--no-image': options.image = false; break;
            case '--listing': options.listing = true; break;
            case '--force': options.force = true; break;
            case '--keep-open': options.keepOpen = true; break;
            case '--help': case '-h': options.help = true; break;
            default: throw new Error(`Unknown option: ${flag}`);
        }
    }
    if (!Sites[options.site]) throw new Error(`Unknown site: ${options.site} (known: ${Object.keys(Sites).join(', ')})`);
    options.manga ??= Sites[options.site].manga;
    options.chapter ??= Sites[options.site].chapter;
    return options;
}

function PrintHelp() {
    console.log(`
Challenge replay harness — drives the real app on the real profile and captures the trace.

Options:
  --site <name>        Site scenario to run: ${Object.keys(Sites).join(', ')} (default: japscan)
  --manga <url>        Manga page to open (default: the site's scenario)
  --chapter <id>       Chapter identifier to extract (default: the first available chapter)
  --profile <dir>      Electron user data to run on (default: app/electron/.user-data, the warmed one)
  --out <dir>          Session directory (default: .tmp/traces/<timestamp>)
  --timeout <ms>       Budget of ONE step (default: 300000)
  --no-image           Skip fetching the first page image
  --listing            Also walk the whole catalogue listing (off by default: it is a heavy
                       multi-page request which the challenge trace does not need)
  --force              Run even if another instance uses the port/profile
  --keep-open          Leave the application running when the run ends
  -h, --help           This help

The application must be built first:
  npm run build:web && npm --workspace=app/electron run build
`);
}

/** Detects the Electron executable, mirroring what `test/PuppeteerGlobal.ts` does. */
function DetectElectron() {
    const candidates = [
        path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'),
        path.join(root, 'node_modules', 'electron', 'dist', 'electron'),
        path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron'),
        path.join(root, 'app', 'electron', 'node_modules', 'electron', 'dist', 'electron.exe'),
    ];
    const found = candidates.find(candidate => fs.existsSync(candidate));
    if (!found) throw new Error('Electron executable not found — run `npm install` first.');
    return found;
}

/** Whether something already listens on the port the application prefers for its own origin. */
function IsPortTaken(port) {
    return new Promise(resolve => {
        const socket = net.connect({ host: '127.0.0.1', port });
        socket.once('connect', () => { socket.destroy(); resolve(true); });
        socket.once('error', () => { socket.destroy(); resolve(false); });
        socket.setTimeout(1_000, () => { socket.destroy(); resolve(false); });
    });
}

/** Best-effort detection of another instance already running on the same profile. */
function IsProfileInUse(profile) {
    try {
        const output = execFileSync('powershell', [
            '-NoProfile', '-Command',
            `Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | ForEach-Object { $_.CommandLine }`,
        ], { encoding: 'utf-8', timeout: 10_000 });
        return output.split('\n').some(line => line.includes(profile));
    } catch {
        // The check is a courtesy, not a gate: a machine where PowerShell is unavailable still runs.
        return false;
    }
}

/** Cookie metadata only: a challenge trace must never leak a session cookie value. */
function DescribeCookies(cookies) {
    return cookies
        .map(({ name, domain, path: cookiePath, httpOnly, secure, sameSite, session, expires, value }) => ({
            name, domain, path: cookiePath, httpOnly, secure, sameSite, session, expires,
            valueLength: (value ?? '').length,
        }))
        .sort((left, right) => `${left.domain}${left.name}`.localeCompare(`${right.domain}${right.name}`));
}

function CollectFrames(node, into = []) {
    const frame = node?.frame;
    if (frame?.url && frame.url !== 'about:blank') into.push({ url: frame.url, mimeType: frame.mimeType });
    for (const child of node?.childFrames ?? []) CollectFrames(child, into);
    return into;
}

/**
 * One replay session: launch, drive, capture, close.
 * @param options - The parsed command line.
 */
async function Run(options) {
    const electron = DetectElectron();
    if (!fs.existsSync(AppDirectory)) {
        throw new Error(`No application build at ${AppDirectory} — run \`npm run build:web && npm --workspace=app/electron run build\` first.`);
    }
    if (!fs.existsSync(options.profile)) {
        throw new Error(`Profile not found: ${options.profile} — pass --profile or warm one up in the app first.`);
    }
    if (!options.force) {
        if (await IsPortTaken(LocalServerPort)) {
            throw new Error(`Port ${LocalServerPort} is already taken — another instance (possibly the user's own) owns it. Close it, or pass --force.`);
        }
        if (IsProfileInUse(options.profile)) {
            throw new Error(`An Electron instance is already running on ${options.profile} — close it, or pass --force.`);
        }
    }

    const sessionDirectory = options.out ?? path.join(root, '.tmp', 'traces', new Date().toISOString().replace(/[:.]/g, '-'));
    const screenshotDirectory = path.join(sessionDirectory, 'screenshots');
    fs.mkdirSync(screenshotDirectory, { recursive: true });
    // The application writes its own console capture here (`Diagnostics.Capture`), so the decision
    // trace survives even if the renderer dies mid-run.
    const traceDirectory = path.join(sessionDirectory, 'app');
    fs.mkdirSync(traceDirectory, { recursive: true });

    const consoleLines = [];
    const steps = [];
    const startedAt = Date.now();
    const log = line => { consoleLines.push(line); console.log(line); };

    const browser = await puppeteer.launch({
        executablePath: electron,
        headless: false,
        defaultViewport: null,
        ignoreDefaultArgs: true,
        userDataDir: options.profile,
        protocolTimeout: 300_000,
        args: [
            AppDirectory,
            '--no-sandbox',
            '--disable-gpu',
            '--remote-debugging-port=0',
            '--ignore-certificate-errors',
            '--disable-features=UseDBus',
        ],
        env: { ...process.env, HAKUNEKO_TRACE_DIR: traceDirectory },
    });
    const appProcess = browser.process();
    log(`[replay] application launched (pid ${appProcess?.pid}) on profile ${options.profile}`);
    log(`[replay] trace directory: ${traceDirectory}`);

    let page;
    try {
        const deadline = Date.now() + 30_000;
        while (!page && Date.now() < deadline) {
            const pages = await browser.pages();
            page = pages.find(candidate => /^https?:\/\/127\.0\.0\.1:\d+\//.test(candidate.url()) && !/splash\.html/i.test(candidate.url()));
            if (!page) await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (!page) throw new Error('The application window never showed its local origin page.');
        log(`[replay] application page: ${page.url()} (remote debugger ${browser.wsEndpoint()})`);

        page.on('console', message => log(`[console:${message.type()}] ${message.text()}`));
        page.on('pageerror', error => log(`[pageerror] ${error.message}`));
        page.on('requestfailed', request => log(`[requestfailed] ${request.url()} ${request.failure()?.errorText ?? ''}`));

        await page.waitForSelector('body #app main#hakunekoapp', { timeout: 30_000 });
        await page.bringToFront();
        await page.screenshot({ path: path.join(screenshotDirectory, '00-start.png') });

        const scenario = {
            id: Sites[options.site].id,
            manga: options.manga,
            chapter: options.chapter,
            image: options.image,
            timeout: options.timeout,
        };
        // The listing is opt-in: it walks the site's whole catalogue, which is both slow and the most
        // aggressive request a diagnosis can make. The challenge path is fully exercised by the
        // manga → chapters → image walk, which is what a replay is for.
        const scenarioSteps = [ 'engine-ready', ...(options.listing ? [ 'listing' ] : []), 'manga', 'chapters', 'chapter-update', 'image' ];
        for (const step of scenarioSteps) {
            const startedStepAt = Date.now();
            try {
                const result = await WithBudget(RunStep(page, scenario, step), scenario.timeout, step);
                steps.push({ step, ok: true, milliseconds: Date.now() - startedStepAt, result });
                log(`[replay] step ${step} ok in ${Date.now() - startedStepAt}ms: ${JSON.stringify(result)}`);
            } catch (error) {
                steps.push({ step, ok: false, milliseconds: Date.now() - startedStepAt, error: String(error?.message ?? error) });
                log(`[replay] step ${step} FAILED in ${Date.now() - startedStepAt}ms: ${error?.message ?? error}`);
                await page.screenshot({ path: path.join(screenshotDirectory, `failure-${step}.png`) }).catch(() => {});
                if (step === 'engine-ready') break;
            }
        }
        await page.screenshot({ path: path.join(screenshotDirectory, '99-end.png') });

        const client = await page.createCDPSession();
        const { cookies } = await client.send('Network.getAllCookies');
        const { frameTree } = await client.send('Page.getFrameTree');
        fs.writeFileSync(path.join(sessionDirectory, 'cookies.json'), JSON.stringify(DescribeCookies(cookies), null, 2), 'utf-8');
        fs.writeFileSync(path.join(sessionDirectory, 'frames.json'), JSON.stringify(CollectFrames(frameTree), null, 2), 'utf-8');
        fs.writeFileSync(path.join(sessionDirectory, 'console.log'), consoleLines.join('\n'), 'utf-8');
        const traceFile = path.join(traceDirectory, 'diagnostics.log');
        const trace = fs.existsSync(traceFile) ? fs.readFileSync(traceFile, 'utf-8') : '';
        fs.writeFileSync(path.join(sessionDirectory, 'trace.log'), trace, 'utf-8');
        const decisions = trace.split('\n').filter(line => line.includes('[KUMO] trace '));
        fs.writeFileSync(path.join(sessionDirectory, 'session.json'), JSON.stringify({
            startedAt: new Date(startedAt).toISOString(),
            durationMilliseconds: Date.now() - startedAt,
            site: options.site,
            manga: options.manga,
            chapter: options.chapter,
            profile: options.profile,
            applicationPage: page.url(),
            steps,
            decisions: decisions.length,
            failedSteps: steps.filter(step => !step.ok).map(step => step.step),
        }, null, 2), 'utf-8');
        log(`[replay] ${decisions.length} decision(s) traced — see ${path.join(sessionDirectory, 'trace.log')}`);
        return steps.every(step => step.ok) ? 0 : 1;
    } finally {
        if (options.keepOpen) {
            log('[replay] leaving the application running (--keep-open)');
        } else {
            const pages = await browser.pages().catch(() => []);
            for (const candidate of pages) await candidate.removeAllListeners();
            await browser.close().catch(() => {});
        }
    }
}

/**
 * Bounds ONE step by its own budget, so a call the engine would let hang (the exact shape of the
 * reported "150 s timeout") ends the step instead of the whole run.
 * @param pending - The step to bound.
 * @param milliseconds - The budget of the step.
 * @param step - The step name, for the failure message.
 */
async function WithBudget(pending, milliseconds, step) {
    let timer;
    try {
        return await Promise.race([
            pending,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`step '${step}' exceeded its ${milliseconds}ms budget`)), milliseconds);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Runs ONE step of the scenario inside the application renderer.
 *
 * The engine is driven through the same public surface the website e2e suite uses
 * (`window.HakuNeko.PluginController`), so the replay exercises the real window flow — challenge
 * classification, budgets, pollers — and not a copy of it.
 */
async function RunStep(page, scenario, step) {
    return page.evaluate(async (input) => {
        const plugin = window.HakuNeko.PluginController.WebsitePlugins.find(website => website.Identifier === input.id);
        if (!plugin) throw new Error(`Website plugin not found: ${input.id}`);
        const state = (window.__challengeReplay ??= {});
        switch (input.step) {
            case 'engine-ready':
                return { plugins: window.HakuNeko.PluginController.WebsitePlugins.length, url: location.href };
            case 'listing': {
                await plugin.Update();
                state.listing = plugin.Entries.Value.length;
                return { entries: state.listing };
            }
            case 'manga': {
                state.manga = await plugin.TryGetEntry(input.manga);
                if (!state.manga) throw new Error(`Manga not found: ${input.manga}`);
                await state.manga.Update();
                state.chapters = state.manga.Entries.Value.length;
                return { title: state.manga.Title, chapters: state.chapters };
            }
            case 'chapters': {
                if (!state.chapters) throw new Error('No chapter list — the manga step did not complete.');
                state.chapter = input.chapter
                    ? state.manga.Entries.Value.find(child => child.Identifier === input.chapter)
                    : state.manga.Entries.Value[0];
                if (!state.chapter) throw new Error(`Chapter not found: ${input.chapter ?? 'first available'} (${state.chapters} available)`);
                return { identifier: state.chapter.Identifier, title: state.chapter.Title };
            }
            case 'chapter-update': {
                await state.chapter.Update();
                state.pages = state.chapter.Entries.Value.length;
                return { pages: state.pages };
            }
            case 'image': {
                if (!input.image) return { skipped: true };
                if (!state.pages) throw new Error('No pages — the chapter step did not complete.');
                // NOTE: 4 = Priority.Normal (a const enum cannot be imported with isolatedModules).
                const blob = await state.chapter.Entries.Value[0].Fetch(4, new AbortController().signal);
                return { size: blob.size, type: blob.type };
            }
            default:
                throw new Error(`Unknown step: ${input.step}`);
        }
    }, { ...scenario, step });
}

try {
    const options = ParseArguments(process.argv.slice(2));
    if (options.help) {
        PrintHelp();
        process.exit(0);
    }
    const status = await Run(options);
    process.exit(status ?? 0);
} catch (error) {
    console.error(`[replay] ${error?.message ?? error}`);
    process.exit(2);
}
