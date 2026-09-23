import * as puppeteer from 'puppeteer-core';
import { AppURL } from './PuppeteerGlobal';

export class PuppeteerFixture {

    static #browser = puppeteer.connect({
        browserWSEndpoint: process.env.browserWS,
        defaultViewport: null,
        // The fixture re-connects over the WS endpoint, so launch options do not apply
        // here: a long `page.evaluate` (e.g. listing a large Cloudflare-protected
        // catalogue) can exceed the 180 s default protocol timeout. Keep it above the
        // test timeouts (240 s) so network slowness is bounded by the test timeout.
        protocolTimeout: 300_000,
    });
    static #page = this.#browser.then(browser => browser.pages()).then(async pages => {
        const page = pages.find(page => page.url() === AppURL);
        await page!.setCacheEnabled(false);
        return page;
    });

    public async GetPage() {
        const page = await PuppeteerFixture.#page;
        await page.bringToFront();
        return page;
    }

    public async Screenshot(page: puppeteer.Page) {
        await page.screenshot({
            type: 'png',
            fullPage: true,
            captureBeyondViewport: true,
            path: `./screenshot_${Date.now().toString(36)}.png`,
        });
    }

    protected EvaluateHandle: typeof puppeteer.Page.prototype.evaluateHandle = async (pageFunction, ...args) => (await PuppeteerFixture.#page)!.evaluateHandle(pageFunction, ...args);
}
