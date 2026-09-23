#!/usr/bin/env node
/**
 * Generates documentation screenshots of the desktop app.
 *
 * It builds the web + electron bundles (if not already built), serves the web
 * app with `vite preview`, launches Electron, and captures a few representative
 * views (home, plugins, settings) into `docs/screenshots/`.
 *
 * Usage (from the repository root):
 *   node scripts/take-screenshots.mjs
 *
 * The same job can be run in CI to regenerate the screenshots; the PNGs are
 * committed so the README always shows real captures.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const Root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OutDir = path.join(Root, 'docs', 'screenshots');
const ViteBin = path.join(Root, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
const ElectronBinary = path.join(Root, 'node_modules', 'electron', 'dist',
    process.platform === 'win32' ? 'electron.exe'
        : process.platform === 'darwin' ? path.join('Electron.app', 'Contents', 'MacOS', 'Electron')
        : 'electron');
// The web app is served over HTTPS (self-signed cert) by vite preview.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const ElectronApp = path.join(Root, 'app', 'electron', 'build');
// Use a dedicated port (several other tools may sit on 5000/5001).
const Port = Number(process.env.HAKUNEKO_SCREENSHOT_PORT || 5031);
const AppURL = `https://localhost:${Port}/`;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const waitForServer = async (url) => {
    for (let i = 0; i < 40; i++) {
        try {
            const response = await fetch(url);
            return response.ok;
        } catch { /* not up yet */ }
        await delay(500);
    }
    return false;
};

function run(cmd, args, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
        child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)));
        child.on('error', reject);
    });
}

async function Capture(page, name, extraWait = 0) {
    if (extraWait) await delay(extraWait);
    const file = path.join(OutDir, name);
    await page.screenshot({ path: file, fullPage: false });
    console.log('📷 captured', name, '->', path.relative(Root, file));
}

async function ClickText(page, selectorPrefix, text) {
    // Find the element whose text content matches among the given selector(s).
    const selectors = Array.isArray(selectorPrefix) ? selectorPrefix : [ selectorPrefix ];
    for (const selector of selectors) {
        const found = await page.evaluate(({ selector, text }) => {
            for (const element of document.querySelectorAll(selector)) {
                if ((element.textContent || '').trim().toLowerCase().includes(text.toLowerCase())) {
                    element.click();
                    return true;
                }
            }
            return false;
        }, { selector, text });
        if (found) return true;
    }
    return false;
}

async function OpenSettingsGeneral(page) {
    // Expand the sidebar (hamburger), then Settings -> General.
    try {
        await page.click('button.bx--header__action');
        await delay(800);
    } catch { /* sidebar already open */ }
    await ClickText(page, [ 'button.bx--side-nav__submenu', '.bx--side-nav__submenu' ], 'Settings');
    await delay(600);
    await ClickText(page, 'a.bx--side-nav__link', 'General');
    await page.waitForSelector('#settingModal', { timeout: 15_000 });
    await delay(1500);
}

async function main() {
    fs.mkdirSync(OutDir, { recursive: true });

    // 1. Build if the bundles are missing or stale.
    const needsBuild = !fs.existsSync(ElectronApp) && !fs.existsSync(path.join(Root, 'web', 'build', 'index.html'));
    if (needsBuild) {
        console.log('Building web + electron (this can take a while)…');
        await run(ViteBin, [ 'build' ], path.join(Root, 'web'));
        const electronDir = path.join(Root, 'app', 'electron');
        await run('node', [ 'scripts/build-app.mjs' ], electronDir);
        await run(ViteBin, [ 'build' ], electronDir);
        await run(ViteBin, [ 'build', '--config', 'vite.preload.config.ts' ], electronDir);
    }

    // 2. Serve the built web app.
    const preview = spawn(ViteBin, [ 'preview', `--port=${Port}`, '--strictPort' ], {
        cwd: path.join(Root, 'web'),
        stdio: 'ignore',
        shell: process.platform === 'win32',
    });
    const stopPreview = () => { try { preview.kill(); } catch { /* ignore */ } };
    process.on('exit', stopPreview);
    if (!await waitForServer(AppURL)) {
        throw new Error(`vite preview did not come up on ${AppURL}`);
    }

    // 3. Launch the app under Electron.
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hakuneko-shot-'));
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        ignoreDefaultArgs: true,
        executablePath: ElectronBinary,
        args: [
            ElectronApp,
            '--no-sandbox',
            '--disable-gpu',
            '--remote-debugging-port=0',
            '--disable-features=UseDBus',
            '--ignore-certificate-errors',
            `--origin=${AppURL}`,
        ],
        userDataDir,
        protocolTimeout: 300_000,
        env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' },
    });

    try {
        // Wait for the main window to reach the app URL.
        let page;
        const start = Date.now();
        while (!page && Date.now() - start < 60_000) {
            for (const candidate of await browser.pages()) {
                if (candidate.url().includes(`localhost:${Port}`)) { page = candidate; break; }
            }
            if (!page) await delay(1000);
        }
        if (!page) throw new Error('Could not find the app page on ' + AppURL);

        await page.bringToFront();
        await page.waitForSelector('#app main#hakunekoapp', { timeout: 60_000 });
        console.log('App loaded:', page.url());

        // 4. Captures.
        await Capture(page, 'home.png', 3000);

        // Plugins list (sidebar 'Plugins' -> plugin select modal).
        try {
            await page.click('button.bx--header__action').catch(() => {});
            await delay(600);
            await ClickText(page, 'a.bx--side-nav__link', 'Plugins');
            await delay(2500);
            await Capture(page, 'plugins.png');
        } catch (error) {
            console.warn('Plugins capture skipped:', error?.message);
        }

        // Settings -> General (Cloudflare bypass, export format, auto-download).
        try {
            await OpenSettingsGeneral(page);
            await Capture(page, 'settings-general.png');
        } catch (error) {
            console.warn('Settings capture skipped:', error?.message);
        }

        console.log('Done. Screenshots written to', path.relative(Root, OutDir));
    } finally {
        for (const p of await browser.pages()) { await p.close().catch(() => {}); }
        await browser.close().catch(() => {});
        stopPreview();
        fs.rmSync(userDataDir, { recursive: true, force: true });
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});