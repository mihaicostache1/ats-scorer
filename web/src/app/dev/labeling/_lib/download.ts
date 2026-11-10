/** Saves text as a file through the browser, the way a download link does. */
export function downloadTextFile(fileName: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  // The browser has started the download by now; give it a moment before letting go of the data.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
