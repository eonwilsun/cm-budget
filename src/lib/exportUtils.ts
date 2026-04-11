/**
 * Export utilities – download a DOM element as PNG or PDF.
 * html2canvas and jsPDF are dynamically imported to keep them out of the
 * initial bundle (they are large).
 *
 * All processing happens entirely in the browser – no data is transmitted.
 */

/** Capture an element as a PNG and trigger a browser download. */
export async function downloadAsPNG(element: HTMLElement, filename: string): Promise<void> {
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });
  const url = canvas.toDataURL("image/png");
  triggerDownload(url, filename);
}

/**
 * Capture one or more elements and combine them into a single PDF file.
 * Each element becomes one or more A4 pages (portrait).
 */
export async function downloadAsPDF(
  sections: { element: HTMLElement; title?: string }[],
  filename: string,
  documentTitle?: string
): Promise<void> {
  const { default: html2canvas } = await import("html2canvas");
  const { jsPDF } = await import("jspdf");

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();   // 210 mm
  const pageH = pdf.internal.pageSize.getHeight();  // 297 mm
  const margin = 10;
  const printW = pageW - margin * 2;

  let isFirstPage = true;

  if (documentTitle) {
    pdf.setFontSize(18);
    pdf.setFont("helvetica", "bold");
    pdf.text(documentTitle, pageW / 2, margin + 6, { align: "center" });
    pdf.setFont("helvetica", "normal");
  }

  for (const { element, title } of sections) {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    // Scale canvas to fit page width (in mm)
    const imgW = printW;
    const imgH = (canvas.height / canvas.width) * imgW;

    // Y position after the document title (first section) or after page break
    let yStart = isFirstPage && documentTitle ? margin + 14 : margin;
    if (title) {
      if (!isFirstPage) {
        pdf.addPage();
        yStart = margin;
      }
      pdf.setFontSize(13);
      pdf.setFont("helvetica", "bold");
      pdf.text(title, margin, yStart + 5);
      pdf.setFont("helvetica", "normal");
      yStart += 10;
    } else if (!isFirstPage) {
      pdf.addPage();
      yStart = margin;
    }

    // Split into pages if image is taller than one page
    let srcY = 0;
    let remainingH = imgH;
    let firstSlice = true;

    while (remainingH > 0) {
      const available = pageH - (firstSlice ? yStart : margin);
      const sliceH = Math.min(remainingH, available);
      const srcSliceH = (sliceH / imgH) * canvas.height;

      // Cut a horizontal slice from the canvas
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = Math.ceil(srcSliceH);
      const ctx = sliceCanvas.getContext("2d")!;
      ctx.drawImage(
        canvas,
        0, srcY, canvas.width, srcSliceH,
        0, 0, canvas.width, srcSliceH
      );

      const sliceData = sliceCanvas.toDataURL("image/png");
      pdf.addImage(sliceData, "PNG", margin, firstSlice ? yStart : margin, imgW, sliceH);

      srcY += srcSliceH;
      remainingH -= sliceH;
      if (remainingH > 0) {
        pdf.addPage();
        firstSlice = false;
      }
    }

    isFirstPage = false;
  }

  pdf.save(filename);
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------
function triggerDownload(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

