import PDFDocument from 'pdfkit';
import { MangaExporter } from './MangaExporter';
import { SanitizeFileName } from '../StorageController';
import { Priority, TaskPool } from '../taskpool/TaskPool';
import { ConvertBitmap } from '../transformers/ImageConverter';

const pdfImageFormats = [ 'image/png', 'image/jpeg' ];
const pageWidth = 2400; // (W)QUXGA - Portrait

/**
 * Background themes available for PDF export.
 */
export const PDFPageTheme = {
    White: 'white',
    Sepia: 'sepia',
    Dark: 'dark',
} as const;
export type PDFPageTheme = typeof PDFPageTheme[ keyof typeof PDFPageTheme ];

type PDFTheme = {
    background: string;
    padding: number;
    /** Border drawn around the image on dark themes so white pages stay visible. */
    border: string | null;
};

const PDFThemes: Record<PDFPageTheme, PDFTheme> = {
    [PDFPageTheme.White]: { background: '#FFFFFF', padding: 32, border: null },
    [PDFPageTheme.Sepia]: { background: '#F5ECD9', padding: 32, border: null },
    [PDFPageTheme.Dark]: { background: '#141414', padding: 48, border: '#3A3A3A' },
};

const gutter = 48; // spacing between the two pages of a spread layout

type PreparedImage = {
    width: number;
    height: number;
    data: Blob;
};

export class PortableDocumentFormatExporter extends MangaExporter {

    private async PrepareImages(sourceFileList: Map<number, string>) {
        const taskPool = new TaskPool(8);
        const digits = sourceFileList.size.toString().length;
        const promises = new Array(sourceFileList.size).fill(null).map((_, index) => taskPool.Add(async () => {
            const { data } = await super.ReadTempImageData(sourceFileList.get(index), index, digits);
            const bitmap = await createImageBitmap(data);
            try {
                return {
                    width: bitmap.width,
                    height: bitmap.height,
                    // Conversion of unsupported images via jsPDF is slow and produces a large PDF => Using own implementation of image conversion
                    data: pdfImageFormats.includes(data.type) ? data : await ConvertBitmap(bitmap, 'image/jpeg', 0.95)
                };
            } finally {
                bitmap.close();
            }
        }, Priority.Normal));
        return Promise.all(promises);
    }

    private FillPage(pdf: PDFKit.PDFDocument, width: number, height: number, theme: PDFTheme) {
        pdf.addPage({
            size: [ width, height ],
            margin: 0,
        });
        pdf.rect(0, 0, width, height).fill(theme.background);
    }

    /**
     * Render a single image centered on one PDF page, applying the theme's
     * background (and a border on dark themes so white pages remain visible).
     */
    private async AddSinglePage(pdf: PDFKit.PDFDocument, image: PreparedImage, theme: PDFTheme) {
        const contentWidth = pageWidth;
        const contentHeight = image.height * contentWidth / image.width;
        const pageWidthPX = contentWidth + 2 * theme.padding;
        const pageHeight = contentHeight + 2 * theme.padding;
        this.FillPage(pdf, pageWidthPX, pageHeight, theme);
        if (theme.border) {
            pdf.rect(theme.padding - 1, theme.padding - 1, contentWidth + 2, contentHeight + 2).lineWidth(2).strokeColor(theme.border).stroke();
        }
        pdf.image(await image.data.arrayBuffer(), theme.padding, theme.padding, {
            width: contentWidth,
            height: contentHeight,
        });
    }

    /**
     * Render two consecutive pages side by side (spread layout), like a printed
     * manga volume. Each image is scaled to half of the page width and the pair
     * is vertically centered on the page.
     */
    private async AddDoublePage(pdf: PDFKit.PDFDocument, left: PreparedImage, right: PreparedImage, theme: PDFTheme) {
        const halfWidth = pageWidth / 2;
        const leftHeight = left.height * halfWidth / left.width;
        const rightHeight = right.height * halfWidth / right.width;
        const contentHeight = Math.max(leftHeight, rightHeight);
        const pageWidthPX = halfWidth * 2 + gutter + 2 * theme.padding;
        const pageHeight = contentHeight + 2 * theme.padding;
        this.FillPage(pdf, pageWidthPX, pageHeight, theme);
        if (theme.border) {
            pdf.rect(theme.padding - 1, theme.padding - 1, halfWidth * 2 + gutter + 2, contentHeight + 2).lineWidth(2).strokeColor(theme.border).stroke();
        }
        const leftY = theme.padding + (contentHeight - leftHeight) / 2;
        pdf.image(await left.data.arrayBuffer(), theme.padding, leftY, {
            width: halfWidth,
            height: leftHeight,
        });
        const rightY = theme.padding + (contentHeight - rightHeight) / 2;
        pdf.image(await right.data.arrayBuffer(), theme.padding + halfWidth + gutter, rightY, {
            width: halfWidth,
            height: rightHeight,
        });
    }

    public override async Export(sourceFileList: Map<number, string>, targetDirectory: FileSystemDirectoryHandle, chapterTitle: string, _mangaTitle?: string, options?: JSONObject): Promise<void> {
        const theme = PDFThemes[ options?.['theme'] as PDFPageTheme ] ?? PDFThemes[PDFPageTheme.White];
        const doublePage = Boolean(options?.['doublePage']);
        const file = await targetDirectory.getFileHandle(SanitizeFileName(chapterTitle + '.pdf'), { create: true });
        const stream = await file.createWritable();
        const pdf = new PDFDocument({
            autoFirstPage: false,
            compress: false,
            margin: 0,
        });
        pdf.on('data', (bytes: Uint8Array<ArrayBuffer>) => void stream.write(bytes));
        pdf.once('error', () => void stream.close());
        pdf.once('end', () => void stream.close());

        const images = await this.PrepareImages(sourceFileList);
        for(let index = 0; index < images.length; index++) {
            if(doublePage && index + 1 < images.length) {
                await this.AddDoublePage(pdf, images[index], images[index + 1], theme);
                index++; // Consume the pair
            } else {
                await this.AddSinglePage(pdf, images[index], theme);
            }
        }

        pdf.end();
    }

    /** Render a chapter divider page carrying the chapter title on the themed background. */
    private AddTitlePage(pdf: PDFKit.PDFDocument, title: string, theme: PDFTheme) {
        const width = pageWidth + 2 * theme.padding;
        const height = Math.round(width * 1.4142); // A4-like portrait ratio
        this.FillPage(pdf, width, height, theme);
        pdf.fontSize(56);
        pdf.fillColor(theme.background === '#FFFFFF' ? '#1A1A1A' : '#EDEDED');
        pdf.text(title, theme.padding, height / 2 - 40, {
            width: width - 2 * theme.padding,
            align: 'center',
        });
    }

    /**
     * Merges several already-downloaded chapters into a single PDF volume
     * ("collection / omnibus" export): each chapter starts with a divider page.
     */
    public async ExportCollection(
        volumes: { title: string; resources: Map<number, string> }[],
        targetDirectory: FileSystemDirectoryHandle,
        volumeTitle: string,
        seriesTitle: string,
        options?: JSONObject
    ): Promise<void> {
        const theme = PDFThemes[ options?.['theme'] as PDFPageTheme ] ?? PDFThemes[PDFPageTheme.White];
        const file = await targetDirectory.getFileHandle(SanitizeFileName(`${seriesTitle} - ${volumeTitle}.pdf`), { create: true });
        const stream = await file.createWritable();
        const pdf = new PDFDocument({
            autoFirstPage: false,
            compress: false,
            margin: 0,
        });
        pdf.on('data', (bytes: Uint8Array<ArrayBuffer>) => void stream.write(bytes));
        pdf.once('error', () => void stream.close());
        pdf.once('end', () => void stream.close());

        for(const chapter of volumes) {
            this.AddTitlePage(pdf, chapter.title, theme);
            const images = await this.PrepareImages(chapter.resources);
            for(const image of images) {
                await this.AddSinglePage(pdf, image, theme);
            }
        }

        pdf.end();
    }
}