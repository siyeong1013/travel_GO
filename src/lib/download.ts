/** Saves `file` with the browser's download (on iPhones: Files > Downloads). */
export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  // Not right away: Safari starts the download after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
