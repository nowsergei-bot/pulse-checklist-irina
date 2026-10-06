const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { sanitizeImageBuffer } = require('./sniff-upload');

const DEFAULT_S3_ENDPOINT = 'https://storage.yandexcloud.net';

/** SDK бросает «Invalid URL», если endpoint без схемы (частая ошибка в env: storage.yandexcloud.net). */
function normalizeS3Endpoint(raw) {
  let s = String(raw || '').trim();
  if (!s) return DEFAULT_S3_ENDPOINT;
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s.replace(/^\/+/, '')}`;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new Error('protocol');
    }
    return u.toString().replace(/\/+$/, '');
  } catch {
    throw new Error(
      `S3_ENDPOINT неверный: "${String(raw).slice(0, 96)}". Укажите полный URL, например https://storage.yandexcloud.net`,
    );
  }
}

function getBucket() {
  return String(
    process.env.PHOTO_WALL_BUCKET || process.env.S3_BUCKET || process.env.YC_BUCKET || '',
  ).trim();
}

function shouldUsePhotoWallStorage() {
  return (
    String(process.env.PHOTO_WALL_STORAGE || '').trim() === '1' &&
    Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) &&
    Boolean(getBucket())
  );
}

/** База публичных URL (хостинг бакета). Без слэша в конце. */
function getPublicBaseUrl() {
  const explicitRaw = String(process.env.PHOTO_WALL_PUBLIC_BASE_URL || '').trim();
  if (explicitRaw) {
    let s = explicitRaw.replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(s)) {
      s = `https://${s}`;
    }
    try {
      const u = new URL(s);
      const path = u.pathname.replace(/\/+$/, '');
      return path ? `${u.origin}${path}` : u.origin;
    } catch {
      throw new Error(
        `PHOTO_WALL_PUBLIC_BASE_URL неверный: "${explicitRaw.slice(0, 120)}". Пример: https://имя-бакета.website.yandexcloud.net`,
      );
    }
  }
  const b = getBucket();
  return b ? `https://${b}.website.yandexcloud.net` : '';
}

function getS3Client() {
  const endpoint = normalizeS3Endpoint(process.env.S3_ENDPOINT);
  return new S3Client({
    region: String(process.env.AWS_DEFAULT_REGION || 'ru-central1').trim(),
    endpoint,
    credentials: {
      accessKeyId: String(process.env.AWS_ACCESS_KEY_ID || '').trim(),
      secretAccessKey: String(process.env.AWS_SECRET_ACCESS_KEY || '').trim(),
    },
    forcePathStyle: true,
  });
}

function dataUrlToBuffer(dataUrl) {
  const s = String(dataUrl);
  const comma = s.indexOf(',');
  if (comma < 0 || !/^data:[^;]+;base64$/i.test(s.slice(0, comma).trim())) {
    throw new Error('Invalid data URL');
  }
  const head = s.slice(0, comma);
  const b64 = s.slice(comma + 1);
  const mt = /^data:([^;]+)/i.exec(head);
  const contentType = mt ? mt[1].trim() : 'image/jpeg';
  return { contentType, buffer: Buffer.from(b64, 'base64') };
}

async function putObject(client, key, buffer, contentType, extra = {}) {
  const useAcl =
    String(process.env.PHOTO_WALL_OBJECT_ACL_PUBLIC_READ || process.env.YC_OBJECT_ACL_PUBLIC_READ || '')
      .trim() === '1';
  const payload = {
    Bucket: getBucket(),
    Key: key,
    Body: buffer,
    ContentType: contentType || 'image/jpeg',
    ...(useAcl ? { ACL: 'public-read' } : {}),
    ...(extra.CacheControl ? { CacheControl: String(extra.CacheControl) } : {}),
  };
  let last = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await client.send(new PutObjectCommand(payload));
      return;
    } catch (e) {
      last = e;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
  }
  throw last;
}

/**
 * Пишет UTF-8 JSON в бакет статики (тот же YC_BUCKET / PHOTO_WALL_BUCKET).
 * Нужен PHOTO_WALL_STORAGE=1 + AWS-ключи (как для фотостены).
 * @param {string} key например data/gymnasium-signage-layout.json
 * @param {unknown} value
 * @param {{ cacheControl?: string; pretty?: boolean }} [opts]
 */
async function putJsonObject(key, value, opts = {}) {
  if (!shouldUsePhotoWallStorage()) {
    throw new Error(
      'Object Storage для статики отключён. На функции: PHOTO_WALL_STORAGE=1, PHOTO_WALL_BUCKET/YC_BUCKET, AWS_ACCESS_KEY_ID и AWS_SECRET_ACCESS_KEY.',
    );
  }
  const safeKey = String(key || '')
    .trim()
    .replace(/^\/+/, '');
  if (!safeKey || safeKey.includes('..') || safeKey.includes('\\')) {
    throw new Error('Недопустимый ключ объекта');
  }
  const pretty = opts.pretty !== false;
  const body = Buffer.from(JSON.stringify(value, null, pretty ? 2 : 0) + '\n', 'utf8');
  const client = getS3Client();
  const cacheControl =
    String(opts.cacheControl || '').trim() || 'public, max-age=15, must-revalidate';
  await putObject(client, safeKey, body, 'application/json; charset=utf-8', {
    CacheControl: cacheControl,
  });
  const base = getPublicBaseUrl();
  return {
    key: safeKey,
    bytes: body.length,
    public_url: base ? `${base}/${safeKey}` : null,
  };
}

/**
 * Загружает полный и превью JPEG в бакет, возвращает HTTPS URL для сайта.
 * @param {{ uploadId: string, fullDataUrl: string, thumbDataUrl: string | null }} opts
 */
async function uploadPhotoWallPair(opts) {
  const { uploadId, fullDataUrl, thumbDataUrl } = opts;
  const base = getPublicBaseUrl();
  if (!base) {
    throw new Error('Не задан публичный URL бакета: укажите PHOTO_WALL_PUBLIC_BASE_URL или PHOTO_WALL_BUCKET/YC_BUCKET');
  }
  const client = getS3Client();
  const full = dataUrlToBuffer(fullDataUrl);
  const sniffed = sanitizeImageBuffer(full.buffer);
  if (!sniffed.ok) throw new Error(sniffed.message);
  const fullKey = `photo-wall/${uploadId}.jpg`;
  await putObject(client, fullKey, sniffed.buffer, sniffed.contentType);

  const image_public_url = `${base}/${fullKey}`;

  let thumb_public_url = image_public_url;
  if (thumbDataUrl && String(thumbDataUrl).trim()) {
    const thumb = dataUrlToBuffer(thumbDataUrl);
    const thumbSniff = sanitizeImageBuffer(thumb.buffer, new Set(['image/jpeg']));
    if (!thumbSniff.ok) throw new Error(thumbSniff.message);
    const thumbKey = `photo-wall/${uploadId}-t.jpg`;
    await putObject(client, thumbKey, thumbSniff.buffer, 'image/jpeg');
    thumb_public_url = `${base}/${thumbKey}`;
  }

  return { image_public_url, thumb_public_url };
}

/** Удаляет все объекты с префиксом photo-wall/ (полный кадр и превью). */
async function purgePhotoWallObjectStorage() {
  if (!shouldUsePhotoWallStorage()) {
    return { deleted: 0, skipped: true };
  }
  const client = getS3Client();
  const bucket = getBucket();
  const prefix = 'photo-wall/';
  let deleted = 0;
  let continuationToken;
  do {
    const list = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    const contents = list.Contents || [];
    for (let i = 0; i < contents.length; i += 1000) {
      const chunk = contents.slice(i, i + 1000).map((o) => ({ Key: o.Key }));
      if (chunk.length === 0) continue;
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: chunk, Quiet: true },
        }),
      );
      deleted += chunk.length;
    }
  } while (continuationToken);
  return { deleted, skipped: false };
}

/**
 * @deprecated Prefer file-collection-s3.uploadStaffPhotoPair — avatars live on FILE_COLLECTION_BUCKET.
 * Kept as a thin re-export for older callers.
 */
async function uploadStaffPhotoPair(opts) {
  const { uploadStaffPhotoPair: upload } = require('./file-collection-s3');
  return upload(opts);
}

module.exports = {
  shouldUsePhotoWallStorage,
  uploadPhotoWallPair,
  uploadStaffPhotoPair,
  putJsonObject,
  purgePhotoWallObjectStorage,
  dataUrlToBuffer,
  getPublicBaseUrl,
  getBucket,
  normalizeS3Endpoint,
};
