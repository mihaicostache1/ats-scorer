/**
 * Checks a file before it is sent. They mirror the server (`cv_documents.py`), so the same limit
 * and the same wording apply whether the browser or the API says no.
 */

/** Exactly 10 MiB is accepted; one byte more is not. */
export const MAX_CV_SIZE_BYTES = 10 * 1024 * 1024;

export const CV_TOO_LARGE_MESSAGE = "The file is larger than the 10 MB limit.";
export const CV_NOT_PDF_MESSAGE = "Only PDF files are accepted.";
export const CV_ONE_FILE_MESSAGE = "Upload one CV at a time.";

/** What the file picker should offer. The server ignores names and types and checks the bytes. */
export const CV_ACCEPT = "application/pdf,.pdf";

function readStart(file: File, length: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file.slice(0, length));
  });
}

/** `null` if the file can be uploaded, otherwise a sentence saying why not. */
export async function validateCvFile(file: File): Promise<string | null> {
  // The server checks the size before the content, so do the same.
  if (file.size > MAX_CV_SIZE_BYTES) return CV_TOO_LARGE_MESSAGE;

  const looksLikePdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!looksLikePdf) return CV_NOT_PDF_MESSAGE;

  try {
    if ((await readStart(file, 5)) !== "%PDF-") return CV_NOT_PDF_MESSAGE;
  } catch {
    return "The file could not be read. Try choosing it again.";
  }
  return null;
}
