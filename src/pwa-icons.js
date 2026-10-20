// Ícones PNG gerados apenas com APIs nativas, sem dependências externas.
const signature = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const cached = new Map();

function chunk(name, data) {
  const kind = new TextEncoder().encode(name);
  const bytes = new Uint8Array(12 + data.length);
  new DataView(bytes.buffer).setUint32(0, data.length);
  bytes.set(kind, 4);
  bytes.set(data, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < bytes.length - 4; i++) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  new DataView(bytes.buffer).setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0);
  return bytes;
}

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x >= right || y < top || y >= bottom) return false;
  const dx = Math.max(left + radius - x, 0, x - (right - radius));
  const dy = Math.max(top + radius - y, 0, y - (bottom - radius));
  return dx * dx + dy * dy <= radius * radius;
}

function pixel(x, y) {
  // Reproduz o favicon existente: fundo azul, quadrado verde e letra F.
  if ((x >= 22 && x < 30 && y >= 16 && y < 51) ||
      (x >= 30 && x < 47 && y >= 16 && y < 23) ||
      (x >= 30 && x < 45 && y >= 30 && y < 37)) return [248, 255, 252];
  if (insideRoundedRect(x, y, 5, 5, 59, 59, 13)) return [20, 156, 128];
  return [11, 18, 32];
}

async function buildIcon(size) {
  const raw = new Uint8Array(size * (size * 3 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filtro PNG: nenhum
    for (let x = 0; x < size; x++) {
      const rgb = pixel((x + 0.5) * 64 / size, (y + 0.5) * 64 / size);
      raw.set(rgb, p);
      p += 3;
    }
  }
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 2; // RGB
  const parts = [signature, chunk("IHDR", ihdr), chunk("IDAT", compressed), chunk("IEND", new Uint8Array())];
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

export function iconPng(size) {
  if (size !== 192 && size !== 512) throw new RangeError("Tamanho de ícone inválido.");
  if (!cached.has(size)) cached.set(size, buildIcon(size));
  return cached.get(size);
}
