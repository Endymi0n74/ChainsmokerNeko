import { ComicBookArchiveExporter } from './ComicBookArchiveExporter';
import { SanitizeFileName } from '../StorageController';

/**
 * A chapter that has already been downloaded to temporary storage and is ready
 * to be merged into a collection volume.
 */
export interface CollectionVolume {
    title: string;
    resources: Map<number, string>;
}

/**
 * Merges several already-downloaded chapters into a single CBZ volume
 * ("collection / omnibus" export). Each chapter is stored in its own folder
 * inside the archive, so the volume stays readable both in dedicated comic
 * readers (which render folder structure) and in plain file managers.
 *
 * The archive is streamed chunk-by-chunk (see {@link ComicBookArchiveExporter.CreateStreamingArchive}),
 * so even very large omnibus volumes do not need to be materialized in memory.
 */
export class ComicBookCollectionExporter extends ComicBookArchiveExporter {

    public async ExportCollection(
        volumes: CollectionVolume[],
        targetDirectory: FileSystemDirectoryHandle,
        volumeTitle: string,
        seriesTitle: string,
        volumeNumber?: number
    ): Promise<void> {
        await this.CreateStreamingArchive(targetDirectory, `${SanitizeFileName(seriesTitle)} - ${SanitizeFileName(volumeTitle)}.cbz`, async zip => {
            zip.file('ComicInfo.xml', this.CreateComicInfo(volumeTitle, seriesTitle, volumeNumber), { compression: 'STORE' });
            for(const [ chapterIndex, chapter ] of volumes.entries()) {
                const folder = zip.folder(SanitizeFileName(chapter.title) || `Chapter-${chapterIndex + 1}`);
                const digits = chapter.resources.size.toString().length;
                for(const [ index, tempfile ] of chapter.resources) {
                    const { name, data } = await super.ReadTempImageData(tempfile, index, digits);
                    folder?.file(name, data, { compression: 'STORE' });
                }
            }
        });
    }
}
