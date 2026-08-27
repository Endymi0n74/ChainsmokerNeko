import path from 'node:path';
import fs from 'node:fs/promises';
import { run } from '../../tools.mjs';

const pkgFile = 'package.json';
const pkgConfig = JSON.parse(await fs.readFile(pkgFile));

export async function bundle(blinkApplicationSourceDirectory, blinkApplicationResourcesDirectory, blinkDeploymentTemporaryDirectory, blinkDeploymentOutputDirectory) {
    await bundleApp(blinkApplicationSourceDirectory, blinkDeploymentTemporaryDirectory);
    await updateBinary(blinkApplicationResourcesDirectory, blinkDeploymentTemporaryDirectory);
    await createZipArchive(blinkDeploymentTemporaryDirectory, blinkDeploymentOutputDirectory);
}

async function bundleApp(blinkApplicationSourceDirectory, blinkDeploymentTemporaryDirectory) {
    const target = path.join(blinkDeploymentTemporaryDirectory, 'resources', 'app');
    await fs.rm(target, { force: true, recursive: true });
    await fs.cp(blinkApplicationSourceDirectory, target, { recursive: true });
}

async function updateBinary(blinkApplicationResourcesDirectory, blinkDeploymentTemporaryDirectory) {
    const binary = path.join(blinkDeploymentTemporaryDirectory, 'electron.exe');
    const icon = path.join(blinkApplicationResourcesDirectory, process.platform, 'app.ico');
    const rcedit = path.join(blinkApplicationResourcesDirectory, process.platform, 'rcedit64.exe');
    
    try {
        const command = [
            rcedit,
            `"${binary}"`,
            `--set-version-string "ProductName" "${pkgConfig.title}"`,
            `--set-version-string "CompanyName" ""`,
            `--set-version-string "LegalCopyright" "${new Date().getFullYear()}"`,
            `--set-version-string "FileDescription" "${pkgConfig.description}"`,
            `--set-version-string "InternalName" ""`,
            `--set-version-string "OriginalFilename" "${pkgConfig.productName ?? pkgConfig.name}.exe"`,
            `--set-icon "${icon}"`
        ].join(' ');
        await run(command);
        console.log('  [rcedit] OK — icône et métadonnées appliquées');
    } catch (e) {
        console.warn('  [rcedit] Ignoré (permission) —', e.message);
    }
    
    await fs.rename(binary, binary.replace(/electron\.exe$/i, `${pkgConfig.productName ?? pkgConfig.name}.exe`));
}

async function createZipArchive(blinkDeploymentTemporaryDirectory, blinkDeploymentOutputDirectory) {
    const artifact = path.resolve(blinkDeploymentOutputDirectory, path.basename(blinkDeploymentTemporaryDirectory).replace(/^electron/i, pkgConfig.name) + '.zip');
    try {
        await fs.unlink(artifact);
    } catch(error) {/**/}
    const source = path.resolve(blinkDeploymentTemporaryDirectory);
    // Windows PowerShell Compress-Archive silently fails on deep/long paths
    // (resources/app/web/...), producing incomplete zips. Prefer 7-Zip or the
    // native `zip` CLI (preinstalled on macOS/Linux runners) instead.
    const sevenZip = await findExecutable(['7z', '7za', '7zz'], [
        'C:/Program Files/7-Zip/7z.exe',
        'C:/Program Files (x86)/7-Zip/7z.exe',
    ]);
    if (sevenZip) {
        // 7-Zip includes the folder basename in entry paths when given a glob;
        // pass cwd so entries land at the archive root.
        const command = `"${sevenZip}" a -tzip -mx5 "${artifact}" *`;
        await run(command, source);
        return;
    }
    if (process.platform !== 'win32') {
        // Native zip CLI is preinstalled on GitHub Actions macOS/Ubuntu runners.
        const command = `zip -r -9 "${artifact}" .`;
        await run(command, source);
        return;
    }
    // Last resort (Windows without 7-Zip): PowerShell Compress-Archive.
    const command = `powershell -Command "Compress-Archive -Path '${source}\*' -DestinationPath '${artifact}' -Force"`;
    await run(command);
}

async function findExecutable(names, fallbackPaths) {
    for (const candidate of fallbackPaths) {
        try {
            await fs.access(candidate);
            return candidate;
        } catch {/**/}
    }
    const { execSync } = await import('node:child_process');
    for (const name of names) {
        try {
            const probe = process.platform === 'win32' ? `where ${name}` : `which ${name}`;
            execSync(probe, { stdio: 'ignore' });
            return name;
        } catch {/**/}
    }
    return null;
}
