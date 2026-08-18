import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { run } from '../../tools.mjs';

const pkgFile = 'package.json';
const pkgConfig = JSON.parse(await fs.readFile(pkgFile));
const product = pkgConfig.productName ?? pkgConfig.name;
const title = pkgConfig.title ?? product;

/**
 * Bundle a Windows NSIS installer (per-user, MUI2, bilingual EN/FR).
 * The installer installs to %LOCALAPPDATA%\Programs\<title> without elevation and
 * registers itself in Add/Remove Programs (HKCU). Unlike the portable zips, the
 * installed app keeps the default userData location (%APPDATA%\hakuneko-electron)
 * so the `user-data-dir` manifest key is stripped from the packaged app.
 * See: https://nsis.sourceforge.io/Docs/Modern%20UI%202/
 */
export async function bundle(appSourceDirectory, appResourcesDirectory, deploymentTemporaryDirectory, deploymentOutputDirectory) {
    await bundleApp(appSourceDirectory, deploymentTemporaryDirectory);
    await ensureBinaryName(deploymentTemporaryDirectory);
    const nsiFile = await createInstallerScript(appResourcesDirectory, deploymentTemporaryDirectory, deploymentOutputDirectory);
    try {
        await runInstaller(nsiFile);
    } finally {
        await fs.rm(nsiFile, { force: true });
    }
}

async function bundleApp(appSourceDirectory, deploymentTemporaryDirectory) {
    const target = path.join(deploymentTemporaryDirectory, 'resources', 'app');
    await fs.rm(target, { force: true, recursive: true });
    await fs.cp(appSourceDirectory, target, { recursive: true });
    // Installed app uses the default userData location (%APPDATA%) instead of the
    // portable `userdata` folder next to the executable.
    const pkgfile = path.join(target, 'package.json');
    const pkg = JSON.parse(await fs.readFile(pkgfile));
    delete pkg['user-data-dir'];
    await fs.writeFile(pkgfile, JSON.stringify(pkg, null, 4));
    // The portable pass may have created an empty `userdata` folder — not wanted here.
    await fs.rm(path.join(deploymentTemporaryDirectory, 'userdata'), { force: true, recursive: true });
}

async function ensureBinaryName(deploymentTemporaryDirectory) {
    const binary = path.join(deploymentTemporaryDirectory, 'electron.exe');
    try {
        await fs.access(binary);
    } catch {
        return; // Already renamed (portable pass ran first).
    }
    await fs.rename(binary, path.join(deploymentTemporaryDirectory, `${product}.exe`));
}

async function createInstallerScript(appResourcesDirectory, deploymentTemporaryDirectory, deploymentOutputDirectory) {
    const nsiFile = path.join(os.tmpdir(), `${product}-installer-${Date.now()}.nsi`);
    // The .nsi lives in the OS temp dir, so every referenced path must be absolute
    // (makensis resolves relative paths against the script location).
    const artifact = path.resolve(deploymentOutputDirectory, path.basename(deploymentTemporaryDirectory).replace(/^electron/i, pkgConfig.name) + '-setup.exe');
    const icon = path.resolve(appResourcesDirectory, 'win32', 'app.ico');
    const bitmap = path.resolve(appResourcesDirectory, 'win32', 'WizModernImage.bmp');
    const source = path.resolve(deploymentTemporaryDirectory);
    const version = pkgConfig.version;
    // NSIS requires a 4-part numeric version for the version resource.
    const viVersion = `${version}.0`.split('.').slice(0, 4).map((n, i) => i < 3 ? (parseInt(n) || 0) : (parseInt(n) || 0)).join('.');
    // Keep backslashes: NSIS on Windows fails to match absolute paths written with
    // forward slashes ("File: ... -> no files found"). A lone \ is literal in NSIS strings.

    await fs.writeFile(nsiFile, [
        'Unicode true',
        '!include "MUI2.nsh"',
        '',
        `Name "${title}"`,
        `OutFile "${artifact}"`,
        'InstallDir "$LOCALAPPDATA\\Programs\\' + title + '"',
        'InstallDirRegKey HKCU "Software\\' + title + '" "InstallDir"',
        'RequestExecutionLevel user',
        'SetCompressor lzma',
        'CRCCheck on',
        '',
        `!define MUI_ICON "${icon}"`,
        `!define MUI_UNICON "${icon}"`,
        '!define MUI_ABORTWARNING',
        `!define MUI_WELCOMEFINISHPAGE_BITMAP "${bitmap}"`,
        `!define MUI_FINISHPAGE_RUN "$INSTDIR\\${product}.exe"`,
        '',
        '!insertmacro MUI_PAGE_WELCOME',
        '!insertmacro MUI_PAGE_DIRECTORY',
        '!insertmacro MUI_PAGE_INSTFILES',
        '!insertmacro MUI_PAGE_FINISH',
        '',
        '!insertmacro MUI_UNPAGE_CONFIRM',
        '!insertmacro MUI_UNPAGE_INSTFILES',
        '',
        '!insertmacro MUI_LANGUAGE "English"',
        '!insertmacro MUI_LANGUAGE "French"',
        '',
        `VIProductVersion "${viVersion}"`,
        `VIAddVersionKey "ProductName" "${title}"`,
        `VIAddVersionKey "FileDescription" "${pkgConfig.description}"`,
        `VIAddVersionKey "FileVersion" "${version}"`,
        `VIAddVersionKey "ProductVersion" "${version}"`,
        `VIAddVersionKey "LegalCopyright" "${new Date().getFullYear()}"`,
        '',
        'Section "Install"',
        '    SetOutPath "$INSTDIR"',
        `    File /r "${source}\\*"`,
        '    CreateDirectory "$SMPROGRAMS\\' + title + '"',
        `    CreateShortcut "$SMPROGRAMS\\${title}\\${title}.lnk" "$INSTDIR\\${product}.exe"`,
        `    CreateShortcut "$SMPROGRAMS\\${title}\\Uninstall ${title}.lnk" "$INSTDIR\\Uninstall.exe"`,
        `    WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${title}" "DisplayName" "${title}"`,
        `    WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${title}" "DisplayVersion" "${version}"`,
        `    WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${title}" "Publisher" ""`,
        `    WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${title}" "InstallLocation" "$INSTDIR"`,
        `    WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${title}" "DisplayIcon" "$INSTDIR\\${product}.exe"`,
        `    WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${title}" "UninstallString" '"$INSTDIR\\Uninstall.exe"'`,
        `    WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${title}" "QuietUninstallString" '"$INSTDIR\\Uninstall.exe" /S'`,
        `    WriteRegDWORD HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${title}" "NoModify" 1`,
        `    WriteRegDWORD HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${title}" "NoRepair" 1`,
        `    WriteRegStr HKCU "Software\\${title}" "InstallDir" "$INSTDIR"`,
        '    WriteUninstaller "$INSTDIR\\Uninstall.exe"',
        'SectionEnd',
        '',
        'Section "Uninstall"',
        '    Delete "$INSTDIR\\Uninstall.exe"',
        '    RMDir /r "$INSTDIR"',
        `    Delete "$SMPROGRAMS\\${title}\\${title}.lnk"`,
        `    Delete "$SMPROGRAMS\\${title}\\Uninstall ${title}.lnk"`,
        `    RMDir "$SMPROGRAMS\\${title}"`,
        `    DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${title}"`,
        `    DeleteRegKey HKCU "Software\\${title}"`,
        'SectionEnd',
        '',
    ].join('\r\n'), 'utf8');

    return nsiFile;
}

async function runInstaller(nsiFile) {
    const makensis = await findMakensis();
    await run(`"${makensis}" /V2 "${nsiFile}"`);
}

async function findMakensis() {
    const candidates = [
        process.env.MAKENSIS,
        'makensis',
        'C:\\Program Files (x86)\\NSIS\\makensis.exe',
        'C:\\Program Files\\NSIS\\makensis.exe',
        path.join(process.env.LOCALAPPDATA || '', 'NSIS', 'makensis.exe'),
    ].filter(Boolean);
    for (const candidate of candidates) {
        try {
            await run(`"${candidate}" /VERSION`);
            return candidate;
        } catch { /* try next candidate */ }
    }
    throw new Error('makensis not found. Install NSIS (choco install nsis -y) or set the MAKENSIS environment variable.');
}