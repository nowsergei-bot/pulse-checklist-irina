'use strict';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function sniffImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

function stripJpegExif(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return buffer;
  }
  const chunks = [buffer.subarray(0, 2)];
  let i = 2;
  while (i + 3 < buffer.length) {
    if (buffer[i] !== 0xff) {
      chunks.push(buffer.subarray(i));
      return Buffer.concat(chunks);
    }
    const marker = buffer[i + 1];
    if (marker === 0xda) {
      chunks.push(buffer.subarray(i));
      return Buffer.concat(chunks);
    }
    if (marker === 0xd8 || marker === 0xd9) {
      chunks.push(buffer.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const len = (buffer[i + 2] << 8) | buffer[i + 3];
    if (len < 2 || i + 2 + len > buffer.length) return buffer;
    if (marker !== 0xe1) chunks.push(buffer.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return Buffer.concat(chunks);
}

function sanitizeImageBuffer(buffer, allowed = IMAGE_TYPES) {
  const kind = sniffImage(buffer);
  if (!kind || !allowed.has(kind)) {
    return { ok: false, message: 'Файл не похож на допустимое изображение.' };
  }
  const clean = kind === 'image/jpeg' ? stripJpegExif(buffer) : buffer;
  return { ok: true, contentType: kind, buffer: clean };
}

function dataUrlFromBuffer(contentType, buffer) {
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

function hasZipHeader(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
  );
}

function sniffVideo(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return 'video/webm';
  }
  if (buffer.toString('ascii', 4, 8) === 'ftyp') return 'video/mp4';
  if (buffer.toString('ascii', 0, 4) === 'OggS') return 'video/ogg';
  return null;
}

function isDangerousUpload(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 2) return true;
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) return true;
  const head = buffer.subarray(0, 24).toString('latin1').toLowerCase();
  if (head.startsWith('#!')) return true;
  if (head.includes('<!doctype') || head.includes('<html') || head.includes('<?php')) return true;
  return false;
}

function assertXlsxBuffer(buffer) {
  if (!hasZipHeader(buffer)) return { ok: false, message: 'Нужен файл .xlsx' };
  return { ok: true };
}

function assertFileCollectionFile(format, buffer, filename) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    return { ok: false, message: 'Пустой файл.' };
  }
  if (isDangerousUpload(buffer)) {
    return { ok: false, message: 'Такой тип файла не принимается.' };
  }
  if (format === 'photo') return sanitizeImageBuffer(buffer);
  if (format === 'video') {
    if (!sniffVideo(buffer)) return { ok: false, message: 'Нужно видео MP4, WebM или Ogg.' };
    return { ok: true };
  }
  if (format === 'text') {
    const name = String(filename || '').toLowerCase();
    if (/\.(txt|csv|md)$/.test(name)) return { ok: true };
    if (hasZipHeader(buffer) && /\.(docx|xlsx|odt)$/.test(name)) return { ok: true };
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return { ok: true };
    }
    return { ok: false, message: 'Для текстового сбора нужны документ, PDF или текст.' };
  }
  return { ok: true };
}

module.exports = {
  IMAGE_TYPES,
  sniffImage,
  stripJpegExif,
  sanitizeImageBuffer,
  dataUrlFromBuffer,
  hasZipHeader,
  sniffVideo,
  isDangerousUpload,
  assertXlsxBuffer,
  assertFileCollectionFile,
};
