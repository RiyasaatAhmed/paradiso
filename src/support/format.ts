const GB = 1024 ** 3;
const MB = 1024 ** 2;

/** "2.5 GB" / "603 MB" -- the label shown on a card. */
export function formatSize(bytes: number): string {
  return bytes >= GB ? `${(bytes / GB).toFixed(1)} GB` : `${Math.round(bytes / MB)} MB`;
}
