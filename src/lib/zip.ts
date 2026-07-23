/**
 * In-browser ZIP extraction. We use the browser's native DecompressionStream
 * API for the *uncompressed* and *deflate* methods, and a tiny pure-JS
 * implementation for the *zip header* parsing.
 *
 * Telegram exports store the HTML files in a flat ZIP without nested
 * directories, so a full-format reader is unnecessary. We support the
 * common deflate-compressed entries.
 */

interface Entry {
  name: string;
  data: Uint8Array;
}

/** Read a 4-byte little-endian value. */
function readU32(buf: Uint8Array, off: number): number {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0;
}

/** Read a 2-byte little-endian value. */
function readU16(buf: Uint8Array, off: number): number {
  return (buf[off] | (buf[off + 1] << 8)) & 0xffff;
}

const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

async function inflateRaw(input: Uint8Array): Promise<Uint8Array> {
  // For data descriptor entries (general-purpose bit 3 set), the size is
  // stored *after* the entry. We've already located the central directory
  // before calling inflate, so this branch isn't taken for us.
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([input]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

export async function readZip(buf: ArrayBuffer): Promise<Entry[]> {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  const len = bytes.length;

  // Find the End-of-Central-Directory record (scan from the end).
  let eocdOff = -1;
  for (let i = len - 22; i >= 0 && i >= len - 65557; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOff = i;
      break;
    }
  }
  if (eocdOff < 0) throw new Error("ZIP: end-of-central-directory not found");

  const cdCount = readU16(bytes, eocdOff + 10);
  const cdOff = readU32(bytes, eocdOff + 16);
  const entries: Entry[] = [];

  let p = cdOff;
  for (let i = 0; i < cdCount; i++) {
    if (readU32(bytes, p) !== SIG_CENTRAL) throw new Error("ZIP: bad central header");
    const compMethod = readU16(bytes, p + 10);
    const compSize = readU32(bytes, p + 20);
    const nameLen = readU16(bytes, p + 28);
    const extraLen = readU16(bytes, p + 30);
    const commentLen = readU16(bytes, p + 32);
    const localOff = readU32(bytes, p + 42);

    const name = new TextDecoder("utf-8").decode(bytes.slice(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    // Read the local file header to get the actual compressed bytes.
    if (readU32(bytes, localOff) !== SIG_LOCAL) throw new Error("ZIP: bad local header");
    const localNameLen = readU16(bytes, localOff + 26);
    const localExtraLen = readU16(bytes, localOff + 28);
    const dataOff = localOff + 30 + localNameLen + localExtraLen;
    const comp = bytes.slice(dataOff, dataOff + compSize);

    let data: Uint8Array;
    if (compMethod === 0) {
      data = comp;
    } else if (compMethod === 8) {
      data = await inflateRaw(comp);
    } else {
      throw new Error(`ZIP: unsupported compression method ${compMethod}`);
    }
    entries.push({ name, data });
  }
  return entries;
}

const TEXT_EXT = new Set(["html", "htm", "css", "js", "json", "txt", "md"]);

export async function readTelegramZip(buf: ArrayBuffer): Promise<{ name: string; html: string }[]> {
  const entries = await readZip(buf);
  const out: { name: string; html: string }[] = [];
  for (const e of entries) {
    if (e.name.endsWith("/")) continue;
    const ext = e.name.split(".").pop()?.toLowerCase() ?? "";
    if (!TEXT_EXT.has(ext)) continue;
    if (!/^messages(\d+)?\.html?$/i.test(e.name)) continue;
    const html = new TextDecoder("utf-8").decode(e.data);
    out.push({ name: e.name, html });
  }
  return out;
}
