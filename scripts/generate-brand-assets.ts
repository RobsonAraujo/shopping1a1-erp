/**
 * Gera os assets estáticos da marca Maipo a partir de `src/lib/brand/maipo-mark.ts`:
 *
 * - public/brand/maipo-logo.svg e maipo-symbol.svg (recorte justo, cores oficiais)
 * - public/icons/*.png (favicon, PWA, apple-touch-icon)
 * - src/app/favicon.ico (16/32/48 px, PNG embutido)
 *
 * Usage:
 *   npm run brand:assets
 *
 * Rodar de novo só se o logo, as cores ou os tamanhos mudarem.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  MAIPO_COLORS,
  MAIPO_SYMBOL_VIEWBOX,
  maipoShapes,
  maipoViewBox,
  viewBoxAttr,
  type MaipoLogoVariant,
} from "../src/lib/brand/maipo-mark";

// Rodado via `npm run brand:assets`, sempre a partir da raiz do projeto.
const ROOT = process.cwd();

function shapesMarkup(
  variant: MaipoLogoVariant,
  colors: { primary: string; accent: string },
) {
  return maipoShapes(variant)
    .map(
      (s) =>
        `<path fill="${s.tone === "primary" ? colors.primary : colors.accent}" d="${s.d}"/>`,
    )
    .join("");
}

function logoSvg(variant: MaipoLogoVariant) {
  const box = maipoViewBox(variant);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxAttr(box)}" width="${box.width}" height="${box.height}">${shapesMarkup(variant, { primary: MAIPO_COLORS.navy, accent: MAIPO_COLORS.mist })}</svg>\n`;
}

/**
 * Ícone quadrado: símbolo em branco + cinza-azulado sobre o azul-marinho.
 * `padding` é a fração da largura livre em cada lado; `radius`, a fração do
 * lado usada no arredondamento (0 = quadrado, para o iOS aplicar a máscara).
 */
function iconSvg(size: number, { padding, radius }: { padding: number; radius: number }) {
  const box = MAIPO_SYMBOL_VIEWBOX;
  const w = size * (1 - 2 * padding);
  const h = (w * box.height) / box.width;
  const x = (size - w) / 2;
  const y = (size - h) / 2;
  const r = size * radius;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${r}" fill="${MAIPO_COLORS.navy}"/><svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${viewBoxAttr(box)}">${shapesMarkup("symbol", { primary: "#ffffff", accent: MAIPO_COLORS.mist })}</svg></svg>`;
}

function renderPng(svg: string) {
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

/** ICO com PNGs embutidos (suportado por todos os navegadores atuais). */
function buildIco(images: { size: number; png: Buffer }[]) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reservado
  header.writeUInt16LE(1, 2); // tipo: ícone
  header.writeUInt16LE(images.length, 4);

  const entries: Buffer[] = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // largura
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // altura
    entry.writeUInt8(0, 2); // paleta
    entry.writeUInt8(0, 3); // reservado
    entry.writeUInt16LE(1, 4); // planos
    entry.writeUInt16LE(32, 6); // bits por pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

async function main() {
  const brandDir = path.join(ROOT, "public/brand");
  const iconsDir = path.join(ROOT, "public/icons");
  await mkdir(brandDir, { recursive: true });
  await mkdir(iconsDir, { recursive: true });

  await writeFile(path.join(brandDir, "maipo-logo.svg"), logoSvg("full"));
  await writeFile(path.join(brandDir, "maipo-symbol.svg"), logoSvg("symbol"));

  // Tamanhos pequenos: menos respiro, senão o símbolo some na aba.
  const small = { padding: 0.1, radius: 0.22 };
  const large = { padding: 0.18, radius: 0.22 };

  const pngs: [string, number, { padding: number; radius: number }][] = [
    ["favicon-32.png", 32, small],
    ["icon-192.png", 192, large],
    ["icon-512.png", 512, large],
    ["apple-touch-icon.png", 180, { padding: 0.18, radius: 0 }],
  ];
  for (const [file, size, opts] of pngs) {
    await writeFile(path.join(iconsDir, file), await renderPng(iconSvg(size, opts)));
  }

  const ico = buildIco(
    await Promise.all(
      [16, 32, 48].map(async (size) => ({
        size,
        png: await renderPng(iconSvg(size, small)),
      })),
    ),
  );
  await writeFile(path.join(ROOT, "src/app/favicon.ico"), ico);

  console.log("Assets da marca gerados: public/brand, public/icons, src/app/favicon.ico");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
