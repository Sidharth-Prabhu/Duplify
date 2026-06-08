import { PDFDocument, degrees } from 'pdf-lib';

export interface ProcessedPDFResult {
  sideABytes: Uint8Array;
  sideBBytes: Uint8Array;
  sheetsPreview: {
    sheetNum: number;
    front: string;
    back: string;
    isRotated: boolean;
  }[];
  sideAPages: string[];
  sideBPages: string[];
  totalSheets: number;
}

/**
 * Loads a PDF file's ArrayBuffer and splits it into Front and Back PDF byte arrays
 * based on printing options. Runs entirely in the client browser.
 */
export async function splitPdf(
  arrayBuffer: ArrayBuffer,
  reverseEven: boolean,
  rotateEven: boolean
): Promise<ProcessedPDFResult> {
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const totalPages = pdfDoc.getPageCount();

  if (totalPages === 0) {
    throw new Error("The PDF file contains no pages.");
  }
  if (pdfDoc.isEncrypted) {
    throw new Error("The PDF is password-protected or encrypted. Please decrypt it first.");
  }

  const oddIndices: number[] = [];
  const evenIndices: number[] = [];
  for (let i = 0; i < totalPages; i++) {
    if (i % 2 === 0) {
      oddIndices.push(i);
    } else {
      evenIndices.push(i);
    }
  }

  const numSheets = oddIndices.length;

  // Generate Side A (Front pages - 1, 3, 5...)
  const sideADoc = await PDFDocument.create();
  const copiedOddPages = await sideADoc.copyPages(pdfDoc, oddIndices);
  copiedOddPages.forEach(page => sideADoc.addPage(page));
  const sideABytes = await sideADoc.save();

  // Generate Side B (Back pages - 2, 4, 6...)
  const sideBDoc = await PDFDocument.create();

  // Create standard sheet mapping: Sheet i has front oddIndices[i] and back evenIndices[i]
  const backPagesList: (number | null)[] = [];
  for (let i = 0; i < numSheets; i++) {
    if (i < evenIndices.length) {
      backPagesList.push(evenIndices[i]);
    } else {
      backPagesList.push(null); // Pad odd document with a blank back page
    }
  }

  // If printing in reverse order, reverse the backs sequence
  if (reverseEven) {
    backPagesList.reverse();
  }

  // Get original page sizes for exact blank page matching
  const originalPages = pdfDoc.getPages();
  const defaultSizePage = originalPages[0];

  // Add pages to Side B document
  for (let i = 0; i < backPagesList.length; i++) {
    const pageIdx = backPagesList[i];
    if (pageIdx === null) {
      // Find matching front page size to ensure layout size parity
      const matchingFrontIdx = oddIndices[numSheets - 1];
      const sizePage = originalPages[matchingFrontIdx] || defaultSizePage;
      const { width, height } = sizePage.getSize();
      sideBDoc.addPage([width, height]);
    } else {
      const [copiedPage] = await sideBDoc.copyPages(pdfDoc, [pageIdx]);
      if (rotateEven) {
        copiedPage.setRotation(degrees(180));
      }
      sideBDoc.addPage(copiedPage);
    }
  }
  const sideBBytes = await sideBDoc.save();

  // Build structured descriptions for previews
  const sideAPages = oddIndices.map(idx => `Page ${idx + 1}`);
  const sideBPages = backPagesList.map(idx => idx === null ? "Blank" : `Page ${idx + 1}`);

  const sheetsPreview = [];
  for (let i = 0; i < numSheets; i++) {
    const frontName = `Page ${oddIndices[i] + 1}`;
    const backIdx = reverseEven ? backPagesList[numSheets - 1 - i] : backPagesList[i];
    const backName = backIdx === null ? "Blank" : `Page ${backIdx + 1}`;

    sheetsPreview.push({
      sheetNum: i + 1,
      front: frontName,
      back: backName,
      isRotated: rotateEven
    });
  }

  return {
    sideABytes,
    sideBBytes,
    sheetsPreview,
    sideAPages,
    sideBPages,
    totalSheets: numSheets
  };
}
