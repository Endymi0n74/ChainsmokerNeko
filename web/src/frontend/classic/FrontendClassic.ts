import type { IAppWindow } from '../../engine/platform/AppWindow';
import type { IFrontendModule } from '../IFrontend';
import { mount } from 'svelte';
import App from './App.svelte';
import { Initialize } from './stores/Settings.svelte';
import { Store } from './stores/Stores.svelte';

class Classic implements IFrontendModule {
    async Render(root: HTMLElement, windowController: IAppWindow): Promise<void> {
        await Initialize();
        // Assign the controller BEFORE mounting: components reading it during onMount
        // (the update notification for instance) would otherwise see undefined, and
        // their optional chain would silently skip the call instead of failing.
        Store.WindowController = windowController;
        const app = mount(App, { target: root, props: {} });
        await app.FinishLoading;
    }
}

export default new Classic();