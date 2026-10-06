import { hasMp4Ftyp } from './recordingBlobFormat';

function readBoxType(buf: Uint8Array, offset: number): string | null {
  if (offset + 8 > buf.length) return null;
  return String.fromCharCode(buf[offset + 4], buf[offset + 5], buf[offset + 6], buf[offset + 7]);
}

function readBoxSize(buf: Uint8Array, offset: number): number {
  if (offset + 4 > buf.length) return 0;
  const size = (buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3];
  return size >= 8 ? size : 0;
}

/** Пропустить init (ftyp/moov/…) до первого moof/mdat — для склеенных fMP4 после перезапуска MediaRecorder. */
export function stripMp4InitToMediaSegment(buf: Uint8Array): Uint8Array {
  let offset = 0;
  while (offset + 8 <= buf.length) {
    const size = readBoxSize(buf, offset);
    const type = readBoxType(buf, offset);
    if (!type || size < 8 || offset + size > buf.length) break;
    if (type === 'moof' || type === 'mdat') return buf.subarray(offset);
    offset += size;
  }
  return buf;
}

async function blobToUint8(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Склеить фрагменты MediaRecorder (fMP4 на iOS: init + moof…) в один Blob для загрузки.
 * У повторных init-сегментов (перезапуск записи) оставляет только moof/mdat.
 */
export async function concatRecordingBlobsAsync(chunks: Blob[]): Promise<Blob> {
  const parts = chunks.filter((b) => b && b.size > 0);
  if (!parts.length) return new Blob([], { type: 'audio/mp4' });
  if (parts.length === 1) return parts[0];

  const type = parts.find((b) => b.type)?.type || 'audio/mp4';
  const decoded = await Promise.all(
    parts.map(async (part) => {
      const buf = await blobToUint8(part);
      const head = buf.subarray(0, Math.min(buf.length, 64));
      return { buf, hasInit: hasMp4Ftyp(head) };
    }),
  );
  decoded.sort((a, b) => Number(b.hasInit) - Number(a.hasInit));

  const buffers: Uint8Array[] = [];
  let sawInit = false;

  for (const { buf, hasInit } of decoded) {
    if (hasInit && sawInit) {
      const media = stripMp4InitToMediaSegment(buf);
      if (media.length > 0) buffers.push(media);
    } else {
      if (hasInit) sawInit = true;
      buffers.push(buf);
    }
  }

  return new Blob(buffers, { type });
}

/** @deprecated Prefer concatRecordingBlobsAsync — sync concat без очистки дублирующих init. */
export function concatRecordingBlobs(chunks: Blob[]): Blob {
  const parts = chunks.filter((b) => b && b.size > 0);
  if (!parts.length) return new Blob([], { type: 'audio/mp4' });
  if (parts.length === 1) return parts[0];
  const type = parts.find((b) => b.type)?.type || 'audio/mp4';
  return new Blob(parts, { type });
}
