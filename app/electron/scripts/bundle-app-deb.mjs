import path from 'node:path';
import fs from 'node:fs/promises';
import { run } from '../../tools.mjs';

const pkgFile = 'package.json';
const pkgConfig = JSON.parse(await fs.readFile(pkgFile));
const product = pkgConfig.productName ?? pkgConfig.name;

/**
 * Bundle Linux .deb package
 * Creates a standard Debian package that installs to /opt/hakuneko
 */
export async function bundle(appSourceDirectory, appResourcesDirectory, deploymentTemporaryDirectory, deploymentOutputDirectory) {
    // Use a separate staging dir outside deploymentTemporaryDirectory to avoid
    // ERR_FS_CP_EINVAL (cannot copy dir into a subdirectory of itself)
    const debDir = path.join(path.dirname(deploymentTemporaryDirectory), `deb-staging-${pkgConfig.version}`);
    const pkgDir = path.join(debDir, `${pkgConfig.name}_${pkgConfig.version}_amd64`);

    await fs.rm(debDir, { force: true, recursive: true });
    await fs.mkdir(pkgDir, { recursive: true });

    // 1. Create app directory structure: /opt/hakuneko/
    const optDir = path.join(pkgDir, 'opt', pkgConfig.name);
    await fs.mkdir(optDir, { recursive: true });

    // Copy the web + electron build into resources/app
    const appTarget = path.join(optDir, 'resources', 'app');
    await fs.rm(appTarget, { force: true, recursive: true });
    await fs.cp(appSourceDirectory, appTarget, { recursive: true });

    // Copy the Electron binary and other root files (hakuneko.exe, etc.)
    const electronEntries = await fs.readdir(deploymentTemporaryDirectory, { withFileTypes: true });
    for (const entry of electronEntries) {
        if (entry.name === 'deb-root' || entry.name === 'resources') continue;
        const src = path.join(deploymentTemporaryDirectory, entry.name);
        const dst = path.join(optDir, entry.name);
        await fs.cp(src, dst, { recursive: true });
    }

    // 3. Create DEBIAN/control
    const debianDir = path.join(pkgDir, 'DEBIAN');
    await fs.mkdir(debianDir, { recursive: true });
    await fs.writeFile(path.join(debianDir, 'control'), [
        `Package: ${pkgConfig.name}`,
        `Version: ${pkgConfig.version}`,
        'Section: graphics',
        'Priority: optional',
        'Architecture: amd64',
        `Depends: libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libuuid1, libsecret-1-0`,
        `Maintainer: Endymi0n74 <https://github.com/Endymi0n74>`,
        `Description: ChainsmokerNeko - Manga Reader & Downloader`,
        ' A fork of HakuNeko for scraping and reading manga from various sources.',
        ' Supports multiple sites, Cloudflare bypass, and auto-updates.',
        '',
    ].join('\n'), 'utf8');

    // 4. Create .desktop launcher
    const desktopDir = path.join(pkgDir, 'usr', 'share', 'applications');
    await fs.mkdir(desktopDir, { recursive: true });
    await fs.writeFile(path.join(desktopDir, `${pkgConfig.name}.desktop`), [
        '[Desktop Entry]',
        'Type=Application',
        `Name=${pkgConfig.title}`,
        `Exec=/opt/${pkgConfig.name}/${product} --no-sandbox %U`,
        `Icon=/opt/${pkgConfig.name}/resources/app/res/darwin/app.iconset/icon_256x256.png`,
        `Comment=${pkgConfig.description}`,
        'Categories=Graphics;Network;',
        'Terminal=false',
        '',
    ].join('\n'), 'utf8');

    // 5. Create postinst script to update alternatives if needed
    await fs.writeFile(path.join(debianDir, 'postinst'), [
        '#!/bin/bash',
        'set -e',
        `if [ ! -L /usr/local/bin/${pkgConfig.name} ]; then`,
        `    ln -sf /opt/${pkgConfig.name}/${product} /usr/local/bin/${pkgConfig.name}`,
        'fi',
        'update-desktop-database /usr/share/applications 2>/dev/null || true',
        '',
    ].join('\n'), { mode: 0o755 });

    // 6. Create prerm script to remove symlink
    await fs.writeFile(path.join(debianDir, 'prerm'), [
        '#!/bin/bash',
        'set -e',
        `rm -f /usr/local/bin/${pkgConfig.name}`,
        'update-desktop-database /usr/share/applications 2>/dev/null || true',
        '',
    ].join('\n'), { mode: 0o755 });

    // 7. Build the .deb
    const artifact = path.join(deploymentOutputDirectory, `${pkgConfig.name}_${pkgConfig.version}_amd64.deb`);
    await fs.rm(artifact, { force: true });
    await run(`dpkg-deb --build '${pkgDir}' '${artifact}'`);
    console.log('Created:', path.basename(artifact));

    // 8. Cleanup staging directory
    await fs.rm(debDir, { force: true, recursive: true });
}
