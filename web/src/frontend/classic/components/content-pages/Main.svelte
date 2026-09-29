<script lang="ts">
    import Logo from '../../../../img/logo.png';
    import { Tile } from 'carbon-components-svelte';
    import { fade } from 'svelte/transition';
    import Suggestions from '../Suggestions.svelte';
    import Documentation from './Documentation.svelte';
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
            <strong>ChainsmokerNeko</strong> was made to help users who download media
            for circumstances that requires offline usage. <br />
            The philosophy is <u>ad-hoc consumption</u>, get it when you want to
            read/watch it.
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
    <Tile id="documentation" class="border ">
        <Documentation />
    </Tile>
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
