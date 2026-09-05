import sharp from 'sharp';

export async function fitTextToWidth(value: string, size: number, width: number): Promise<string> {
  const clean = value.replace(/\s+/g, ' ').trim();
  const parts = [...new Intl.Segmenter('ru', { granularity: 'grapheme' }).segment(clean)].map(p => p.segment);
  const fits = async (text: string) => {
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const meta = await sharp({ text: { text: escaped || ' ', font: `DejaVu Serif ${size}`, dpi: 72 } }).metadata();
    return (meta.width || 0) <= width;
  };
  if (await fits(clean)) return clean;
  let lo = 0, hi = parts.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (await fits(parts.slice(0, mid).join('') + '…')) lo = mid; else hi = mid - 1;
  }
  return parts.slice(0, lo).join('') + '…';
}
