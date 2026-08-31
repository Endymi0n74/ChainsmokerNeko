import type { StorageController } from '../StorageController';
import type { MangaExporter } from './MangaExporter';
import { ImageDirectoryExporter } from './ImageDirectoryExporter';
import { ComicBookArchiveExporter } from './ComicBookArchiveExporter';
import { ElectronicPublicationExporter } from './ElectronicPublicationExporter';
import { PortableDocumentFormatExporter } from './PortableDocumentFormatExporter';
import { ComicBookCollectionExporter } from './CollectionExporter';
import type { CollectionVolume } from './CollectionExporter';

export enum MangaExportFormat {
    /**
     * Save images from website in a folder
     */
    RAWs = 'image/*',
    /**
     * Save images from website in a folder, convert non-PNG to PNG
     */
    PNGs = 'image/png',
    /**
     * Save images from website in a folder, convert non-JPEG to JPEG
     */
    JPEGs = 'image/jpeg',
    /**
     * Save images from website in a folder, convert non-WEBP to WEBP
     */
    WEBPs = 'image/webp',
    /**
     * Save images from website in a zip-archive
     */
    CBZ = 'application/x-cbz',
    /**
     * Save images from website in a EPUB file
     */
    EPUB = 'application/epub+zip',
    /**
     * Save images from website in a document, non-compliant images will be converted to JPEG with q=95%
     */
    PDF = 'application/pdf',
}

export function CreateChapterExportRegistry(storageController: StorageController): Record<string, MangaExporter> {
    return {
        [MangaExportFormat.RAWs]: new ImageDirectoryExporter(storageController),
        [MangaExportFormat.CBZ]: new ComicBookArchiveExporter(storageController),
        [MangaExportFormat.PDF]: new PortableDocumentFormatExporter(storageController),
        [MangaExportFormat.EPUB]: new ElectronicPublicationExporter(storageController),
    };
}

type CollectionExporter = {
    ExportCollection(volumes: CollectionVolume[], targetDirectory: FileSystemDirectoryHandle, volumeTitle: string, seriesTitle: string, ...args: unknown[]): Promise<void>;
};

/**
 * Registry of exporters able to merge several chapters into a single volume
 * ("collection / omnibus" export). Image-folder formats fall back to CBZ.
 */
export function CreateCollectionExportRegistry(storageController: StorageController): Record<string, CollectionExporter> {
    return {
        [MangaExportFormat.CBZ]: new ComicBookCollectionExporter(storageController),
        [MangaExportFormat.EPUB]: new ElectronicPublicationExporter(storageController),
        [MangaExportFormat.PDF]: new PortableDocumentFormatExporter(storageController),
    };
}