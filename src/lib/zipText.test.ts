import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync, crc32 } from "node:zlib";
import { extractTextFromZip } from "./zipText";
import { extractEmails } from "./emailImport";

/**
 * Builds a real, spec-shaped ZIP so the reader is tested against actual bytes rather than a mock.
 * Test-only - nothing in the app writes ZIPs.
 *
 * `stored` covers the uncompressed path, and deflate covers the one a real .xlsx uses. Sizes are
 * written into both the local and central headers, which is what a non-streaming writer (Excel,
 * LibreOffice) does.
 */
function buildZip(files: { name: string; content: string; stored?: boolean }[]): ArrayBuffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = Buffer.from(file.name, "utf8");
    const raw = Buffer.from(file.content, "utf8");
    const data = file.stored ? raw : deflateRawSync(raw);
    const method = file.stored ? 0 : 8;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // extra len
    chunks.push(local, nameBytes, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8); // flags
    cd.writeUInt16LE(method, 10);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBytes.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBytes);

    offset += local.length + nameBytes.length + data.length;
  }

  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  const all = Buffer.concat([...chunks, cdBuf, eocd]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength) as ArrayBuffer;
}

test("extractTextFromZip inflates the XML parts an .xlsx keeps its strings in", async () => {
  // The real shape: addresses live in sharedStrings.xml as <t> text, and the sheet itself only
  // references them by index - which is exactly why reading the raw XML works and no cell model
  // is needed.
  const zip = buildZip([
    { name: "[Content_Types].xml", content: '<?xml version="1.0"?><Types/>' },
    {
      name: "xl/sharedStrings.xml",
      content: '<?xml version="1.0"?><sst count="2"><si><t>ada@example.com</t></si><si><t>alan@example.org</t></si></sst>',
    },
    { name: "xl/worksheets/sheet1.xml", content: '<worksheet><sheetData><row r="1"><c t="s"><v>0</v></c></row></sheetData></worksheet>' },
  ]);

  assert.deepEqual(extractEmails(await extractTextFromZip(zip)), ["ada@example.com", "alan@example.org"]);
});

test("extractTextFromZip handles a stored (uncompressed) member", async () => {
  const zip = buildZip([{ name: "xl/sharedStrings.xml", content: "<sst><si><t>zoe@example.com</t></si></sst>", stored: true }]);
  assert.deepEqual(extractEmails(await extractTextFromZip(zip)), ["zoe@example.com"]);
});

test("extractTextFromZip skips binary members instead of decoding them as text", async () => {
  // A real workbook carries images and fonts. They can't hold a readable address, and an inflated
  // PNG decoded as UTF-8 is noise that the email scan would have to wade through.
  const zip = buildZip([
    { name: "xl/media/image1.png", content: "PNG\r\n\n not@an.address" },
    { name: "xl/sharedStrings.xml", content: "<sst><si><t>real@example.com</t></si></sst>" },
  ]);
  assert.deepEqual(extractEmails(await extractTextFromZip(zip)), ["real@example.com"]);
});

test("extractTextFromZip refuses something that isn't a zip at all", async () => {
  // Copied into its own ArrayBuffer rather than handing over `Buffer.from(...).buffer`: Node
  // allocates small Buffers out of a shared 8KB pool, so that property is the whole pool, carrying
  // whatever unrelated bytes other tests left in it. This assertion passed alone and failed in the
  // full suite precisely because of that - the pool happened to contain an EOCD signature.
  const text = Buffer.from("just some text, ada@example.com");
  const notAZip = new ArrayBuffer(text.length);
  new Uint8Array(notAZip).set(text);
  await assert.rejects(() => extractTextFromZip(notAZip), /not a zip archive/);
});
