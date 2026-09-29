import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * The window controller must be assigned to the store BEFORE the application is
 * mounted: every component reading it during `onMount` (the update notification)
 * would otherwise observe `undefined`, and the optional chain
 * `UI.WindowController?.CheckForUpdates()` silently skips the call — the update
 * check then never runs, without any error being raised anywhere.
 * `$effect`/`$derived` consumers re-run when the value is assigned, which is why
 * this bug stayed invisible: only the one-shot `onMount` reader was affected.
 */
describe('FrontendClassic.Render', () => {

    it('Should assign the window controller before mounting the application', () => {
        const source = readFileSync(new URL('./FrontendClassic.ts', import.meta.url), 'utf-8');
        const assignment = source.indexOf('Store.WindowController = windowController');
        const mount = source.indexOf('mount(App');

        expect(assignment, 'the controller assignment must exist').toBeGreaterThan(-1);
        expect(mount, 'the application must be mounted').toBeGreaterThan(-1);
        expect(assignment, 'assign the controller first').toBeLessThan(mount);
    });
});
