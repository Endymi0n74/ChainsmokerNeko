import path from 'node:path';
import fs from 'node:fs/promises';
import { download, run } from '../../tools.mjs';

const pkgFile = 'package.json';
const pkgConfig = JSON.parse(await fs.readFile(pkgFile));
const product = pkgConfig.productName ?? pkgConfig.name;

// Official continuous build of appimagetool; `--appimage-extract-and-run` avoids the
// FUSE requirement, which is unavailable on GitHub-hosted runners.
const AppImageToolURL = 'https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage';

/**
 * Bundle Linux AppImage
 * See: https://docs.appimage.org/packaging-guide/index.html
 */
export async function bundle(appSourceDirectory, appResourcesDirectory, deploymentTemporaryDirectory, deploymentOutputDirectory) {
    await bundleApp(appSourceDirectory, deploymentTemporaryDirectory);
    await fs.rename(path.join(deploymentTemporaryDirectory, 'electron'), path.join(deploymentTemporaryDirectory, product));
    await createAppRun(deploymentTemporaryDirectory);
    await createDesktopFile(deploymentTemporaryDirectory);
    await copyIcon(appResourcesDirectory, deploymentTemporaryDirectory);
    await createAppImage(deploymentTemporaryDirectory, deploymentOutputDirectory);
}

async function bundleApp(appSourceDirectory, deploymentTemporaryDirectory) {
    const target = path.join(deploymentTemporaryDirectory, 'resources', 'app');
    await fs.rm(target, { force: true, recursive: true });
    await fs.cp(appSourceDirectory, target, { recursive: true });
}

async function createAppRun(deploymentTemporaryDirectory) {
    const file = path.join(deploymentTemporaryDirectory, 'AppRun');
    await fs.writeFile(file, [
        '#!/bin/sh',
        'SELF=$(readlink -f "$0")',
        'HERE=$(dirname "$SELF")',
        `exec "$HERE/${product}" --no-sandbox "$@"`,
        '',
    ].join('\n'), { mode: 0o755 });
}

async function createDesktopFile(deploymentTemporaryDirectory) {
    const file = path.join(deploymentTemporaryDirectory, `${product}.desktop`);
    await fs.writeFile(file, [
        '[Desktop Entry]',
        'Type=Application',
        `Name=${pkgConfig.title}`,
        `Exec=${product} --no-sandbox %U`,
        `Icon=${product}`,
        `Comment=${pkgConfig.description}`,
        'Categories=Graphics;Network;',
        'Terminal=false',
        '',
    ].join('\n'), 'utf8');
}

async function copyIcon(appResourcesDirectory, deploymentTemporaryDirectory) {
    // No dedicated Linux icon yet; reuse the macOS 256px PNG as the AppImage icon.
    const icon = path.join(appResourcesDirectory, 'darwin', 'app.iconset', 'icon_256x256.png');
    await fs.cp(icon, path.join(deploymentTemporaryDirectory, `${product}.png`));
    await fs.cp(icon, path.join(deploymentTemporaryDirectory, '.DirIcon'));
}

async function createAppImage(deploymentTemporaryDirectory, deploymentOutputDirectory) {
    const cache = process.env.HAKUNEKO_ELECTRON_CACHE ? path.resolve(process.env.HAKUNEKO_ELECTRON_CACHE) : path.resolve('.tmp', 'electron-zips');
    await fs.mkdir(cache, { recursive: true });
    const tool = path.join(cache, 'appimagetool-x86_64.AppImage');
    try {
        await fs.access(tool);
    } catch {
        console.log('Downloading:', AppImageToolURL);
        await download(AppImageToolURL, tool);
        await fs.chmod(tool, 0o755);
    }
    const suffix = process.platform === 'linux' ? ' (untested)' : '';
    const artifact = path.join(deploymentOutputDirectory, path.basename(deploymentTemporaryDirectory).replace(/^electron/i, pkgConfig.name) + suffix + '.AppImage');
    await fs.rm(artifact, { force: true });
    await run(`ARCH=x86_64 '${tool}' --appimage-extract-and-run '${deploymentTemporaryDirectory}' '${artifact}'`);
}
