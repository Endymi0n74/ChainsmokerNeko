import JSZip from 'jszip';
import { MangaExporter } from './MangaExporter';
import { SanitizeFileName } from '../StorageController';

export class ComicBookArchiveExporter extends MangaExporter {

    private readonly xmlParser = new DOMParser();
    private readonly xmlSerializer = new XMLSerializer();

    protected CreateComicInfo(title: string, series: string, volume?: number) {
        const xml = this.xmlParser.parseFromString(`<?xml version="1.0" encoding="UTF-8"?>
            <ComicInfo>
                <Title></Title>
                <Series></Series>
            </ComicInfo>
        `, 'text/xml');

        xml.querySelector('Title').textContent = title;
        xml.querySelector('Series').textContent = series;
        if (volume) {
            const element = xml.createElement('Volume');
            element.textContent = String(volume);
            xml.querySelector('ComicInfo').appendChild(element);
        }

        return this.xmlSerializer.serializeToString(xml);
    }

    /**
     * Stream the given {@link populate} callback's zip archive chunk-by-chunk into a new file,
     * instead of materializing the whole archive in memory (`generateAsync`) — required for large
     * CBZ volumes that would otherwise exhaust the renderer's memory.
     *
     * NOTE: JSZip's streaming format writes files with STORE compression and data descriptors.
     * Images in a CBZ are already compressed (JPEG/PNG/WebP), so this does not bloat the archive.
     */
    protected async CreateStreamingArchive(targetDirectory: FileSystemDirectoryHandle, fileName: string, populate: (zip: JSZip) => void | Promise<void>): Promise<void> {
        const file = await targetDirectory.getFileHandle(SanitizeFileName(fileName), { create: true });
        const stream = await file.createWritable();
        try {
            const zip = new JSZip();
            await populate(zip);

            await new Promise<void>((resolve, reject) => {
                const internal = zip.generateInternalStream({
                    type: 'uint8array',
                    streamFiles: true,
                    compression: 'STORE',
                });
                // Serialize the writes: 'data' events can fire faster than the file stream
                // acknowledges them, so each write waits for the previous one to complete.
                let chain = Promise.resolve();
                internal.on('data', (chunk: Uint8Array) => {
                    // Copy into an ArrayBuffer-backed view: FileSystemWritableFileStream
                    // rejects views over a SharedArrayBuffer.
                    chain = chain.then(() => stream.write(new Uint8Array(chunk)));
                });
                internal.on('error', error => {
                    chain = chain.then(() => stream.close()).finally(() => reject(error));
                });
                internal.on('end', () => {
                    chain = chain.then(() => stream.close()).then(() => resolve(), error => reject(error));
                });
                internal.resume();
            });
        } catch (error) {
            await stream.abort?.();
            throw error;
        }
    }

    public override async Export(sourceFileList: Map<number, string>, targetDirectory: FileSystemDirectoryHandle, chapterTitle: string, mangaTitle?: string, _options?: JSONObject): Promise<void> {
        await this.CreateStreamingArchive(targetDirectory, chapterTitle + '.cbz', async zip => {
            const digits = sourceFileList.size.toString().length;
            zip.file('ComicInfo.xml', this.CreateComicInfo(chapterTitle, mangaTitle ?? chapterTitle), { compression: 'STORE' });
            for(const [ index, tempfile ] of sourceFileList) {
                const { name, data } = await super.ReadTempImageData(tempfile, index, digits);
                zip.file(name, data, { compression: 'STORE' });
            }
        });
    }
}