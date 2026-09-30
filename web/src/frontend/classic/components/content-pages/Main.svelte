<script lang="ts">
    import Logo from '../../../../img/logo.png';
    import { Tile } from 'carbon-components-svelte';
    import { fade } from 'svelte/transition';
    import Suggestions from '../Suggestions.svelte';
    import WhatsNew from './WhatsNew.svelte';
</script>

<div id="Home" in:fade>
    <Tile class="border" style="margin-bottom:1em;">
        <p>
            <img
                alt="ChainsmokerNeko logo"
                class="logo"
                src={Logo}
                style="height:3em;"
            />
            <strong>ChainsmokerNeko</strong> is a fork of HaruNeko: same interface, same
            connectors, and its own releases — the application updates itself from them.<br />
            The philosophy is <u>ad-hoc consumption</u>: download what you want to read or
            watch, when you want it, instead of stocking up thousands of chapters.
        </p>
        <p class="credits">
            ChainsmokerNeko is a fork of
            <a href="https://github.com/manga-download/haruneko" rel="noopener" target="_blank">HaruNeko</a>,
            itself a code rework of
            <a href="https://github.com/manga-download/hakuneko" rel="noopener" target="_blank">HakuNeko</a>
            — all credits for the original work go to their authors.
        </p>
    </Tile>
    <Suggestions />
    <WhatsNew />
</div>

<style>
    #Home {
        padding: 0.5em;
    }
    #Home :global(#Suggestions) {
        margin-bottom: 1em;
    }
    .logo {
        margin-right: 1em;
        border-radius: 10%;
        float: left;
    }
    .credits {
        margin-top: 0.75em;
        font-size: 0.85em;
        opacity: 0.75;
    }
</style>
