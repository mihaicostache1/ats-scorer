import { describe, expect, it } from "vitest";
import {
  CV_NOT_PDF_MESSAGE,
  CV_TOO_LARGE_MESSAGE,
  MAX_CV_SIZE_BYTES,
  validateCvFile,
} from "./cv-upload-rules";

/** A file whose first bytes are a PDF header, padded to `size`. */
function pdfOfSize(size: number, name = "cv.pdf", type = "application/pdf"): File {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode("%PDF-1.4"));
  return new File([bytes], name, { type });
}

describe("validateCvFile", () => {
  it("accepts a PDF", async () => {
    expect(await validateCvFile(pdfOfSize(1000))).toBeNull();
  });

  it("accepts exactly 10 MiB and rejects one byte more, like the server", async () => {
    expect(MAX_CV_SIZE_BYTES).toBe(10 * 1024 * 1024);
    expect(await validateCvFile(pdfOfSize(MAX_CV_SIZE_BYTES))).toBeNull();
    expect(await validateCvFile(pdfOfSize(MAX_CV_SIZE_BYTES + 1))).toBe(CV_TOO_LARGE_MESSAGE);
  });

  it("checks the size before the type, like the server", async () => {
    const huge = new File([new Uint8Array(MAX_CV_SIZE_BYTES + 1)], "huge.png", {
      type: "image/png",
    });
    expect(await validateCvFile(huge)).toBe(CV_TOO_LARGE_MESSAGE);
  });

  it("rejects other file types", async () => {
    const png = new File(["\x89PNG"], "photo.png", { type: "image/png" });
    const doc = new File(["PK"], "cv.docx", { type: "application/msword" });
    expect(await validateCvFile(png)).toBe(CV_NOT_PDF_MESSAGE);
    expect(await validateCvFile(doc)).toBe(CV_NOT_PDF_MESSAGE);
  });

  it("rejects a file named .pdf whose content is not a PDF", async () => {
    const fake = new File(["just some text"], "cv.pdf", { type: "application/pdf" });
    expect(await validateCvFile(fake)).toBe(CV_NOT_PDF_MESSAGE);
  });

  it("rejects an empty file", async () => {
    expect(await validateCvFile(new File([], "empty.pdf", { type: "application/pdf" }))).toBe(
      CV_NOT_PDF_MESSAGE
    );
  });

  it("goes by the extension when the browser reports no type", async () => {
    expect(await validateCvFile(pdfOfSize(500, "scan.PDF", ""))).toBeNull();
  });
});
