const fs = require('fs');
const { pipeline } = require('stream/promises');
const {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectsCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { normalizeS3Endpoint } = require('./photo-wall-s3');
const { slugSurveyTitleCaps, slugFioLatin, pickFioFromAnswers } = require('./file-collection-path');

const PREFIX = 'file-collection/';
const VIDEO_EXT_RE = /\.(mp4|webm|mov|mkv|avi|mpeg|mpg|m4v|3gp)$/i;
const MAX_FILE_COLLECTION_FILES = 120;
/** Выше — presigned multipart (части по 16 МБ), иначе один presigned PUT. */
const FILE_COLLECTION_SINGLE_PUT_MAX_BYTES = 64 * 1024 * 1024;
const FILE_COLLECTION_MULTIPART_PART_BYTES = 16 * 1024 * 1024;
const FILE_COLLECTION_PRESIGN_EXPIRES_SEC = 7200;

/** 0 = без лимита. Иначе МБ из FILE_COLLECTION_MAX_MB. */
function maxFileCollectionBytes() {
  const raw = String(process.env.FILE_COLLECTION_MAX_MB ?? '').trim();
  if (!raw || raw === '0' || raw.toLowerCase() === 'none' || raw.toLowerCase() === 'unlimited') {
    return 0;
  }
  const mb = Number(raw);
  if (Number.isFinite(mb) && mb > 0) {
    return Math.min(Math.floor(mb), 51200) * 1024 * 1024;
  }
  return 0;
}

function maxFileCollectionBytesLabel() {
  const n = maxFileCollectionBytes();
  if (n <= 0) return null;
  return `${Math.round(n / (1024 * 1024))} МБ`;
}

function getBucket() {
  return String(process.env.FILE_COLLECTION_BUCKET || '').trim();
}

function shouldUseFileCollectionStorage() {
  return (
    String(process.env.FILE_COLLECTION_STORAGE || '').trim() === '1' &&
    Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) &&
    Boolean(getBucket())
  );
}

/**
 * Public HTTPS base for staff avatars in FILE_COLLECTION_BUCKET (not the static site bucket).
 * Prefer STAFF_PHOTO_PUBLIC_BASE_URL / FILE_COLLECTION_PUBLIC_BASE_URL; else path-style Object Storage URL.
 */
function getStaffPhotoPublicBaseUrl() {
  const explicitRaw = String(
    process.env.STAFF_PHOTO_PUBLIC_BASE_URL || process.env.FILE_COLLECTION_PUBLIC_BASE_URL || '',
  ).trim();
  if (explicitRaw) {
    let s = explicitRaw.replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
    try {
      const u = new URL(s);
      const path = u.pathname.replace(/\/+$/, '');
      return path ? `${u.origin}${path}` : u.origin;
    } catch {
      throw new Error(
        `STAFF_PHOTO_PUBLIC_BASE_URL / FILE_COLLECTION_PUBLIC_BASE_URL неверный: "${explicitRaw.slice(0, 120)}"`,
      );
    }
  }
  const bucket = getBucket();
  // Virtual-hosted style matches Pulse CSP img-src (*.storage.yandexcloud.net).
  // Path-style https://storage.yandexcloud.net/$bucket also works if CSP allows that origin.
  return bucket ? `https://${bucket}.storage.yandexcloud.net` : '';
}

function shouldUseStaffPhotoStorage() {
  return shouldUseFileCollectionStorage() && Boolean(getStaffPhotoPublicBaseUrl());
}

function staffPhotoUseAclPublicRead() {
  const raw = String(process.env.STAFF_PHOTO_OBJECT_ACL_PUBLIC_READ || '').trim();
  if (raw === '0' || raw.toLowerCase() === 'false') return false;
  if (raw === '1' || raw.toLowerCase() === 'true') return true;
  // Avatars must load in <img> without auth — default public-read on the uploads bucket.
  return true;
}

/**
 * Cabinet avatar → FILE_COLLECTION_BUCKET (videofotos1), never the static site bucket.
 * Key: staff-photos/{userId}/{stamp}.jpg — survives frontend sync --delete.
 * @param {{ userId: number, fullDataUrl: string, thumbDataUrl?: string | null }} opts
 */
async function uploadStaffPhotoPair(opts) {
  const { dataUrlToBuffer } = require('./photo-wall-s3');
  const userId = Number(opts.userId);
  const fullDataUrl = opts.fullDataUrl;
  const thumbDataUrl = opts.thumbDataUrl;
  if (!Number.isFinite(userId) || userId <= 0) throw new Error('Некорректный пользователь');
  if (!shouldUseFileCollectionStorage()) {
    throw new Error(
      'Фото сотрудников: задайте FILE_COLLECTION_STORAGE=1, FILE_COLLECTION_BUCKET (отдельный бакет загрузок), AWS_ACCESS_KEY_ID и AWS_SECRET_ACCESS_KEY.',
    );
  }
  const base = getStaffPhotoPublicBaseUrl();
  if (!base) {
    throw new Error(
      'Не задан публичный URL бакета загрузок: FILE_COLLECTION_BUCKET или STAFF_PHOTO_PUBLIC_BASE_URL / FILE_COLLECTION_PUBLIC_BASE_URL.',
    );
  }
  const bucket = getBucket();
  const client = getS3Client();
  const useAcl = staffPhotoUseAclPublicRead();
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const full = dataUrlToBuffer(fullDataUrl);
  const fullKey = `staff-photos/${userId}/${stamp}.jpg`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: fullKey,
      Body: full.buffer,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=86400, stale-while-revalidate=604800',
      ...(useAcl ? { ACL: 'public-read' } : {}),
    }),
  );
  const image_public_url = `${base}/${fullKey}`;
  let thumb_public_url = image_public_url;
  if (thumbDataUrl && String(thumbDataUrl).trim()) {
    const thumb = dataUrlToBuffer(thumbDataUrl);
    const thumbKey = `staff-photos/${userId}/${stamp}-t.jpg`;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: thumbKey,
        Body: thumb.buffer,
        ContentType: 'image/jpeg',
        CacheControl: 'public, max-age=86400, stale-while-revalidate=604800',
        ...(useAcl ? { ACL: 'public-read' } : {}),
      }),
    );
    thumb_public_url = `${base}/${thumbKey}`;
  }
  return { image_public_url, thumb_public_url };
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

function sanitizeFilename(name) {
  let s = String(name || 'file')
    .replace(/[/\\]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/[\x00-\x1f\x7f]/g, '_')
    .trim();
  if (s.length > 200) s = s.slice(0, 200);
  return s || 'file';
}

function useAclPublicRead() {
  return (
    String(process.env.FILE_COLLECTION_OBJECT_ACL_PUBLIC_READ || process.env.YC_OBJECT_ACL_PUBLIC_READ || '').trim() ===
    '1'
  );
}

/**
 * Следующий номер папки 001,002,… для пары (опрос, ФИО).
 * @param {string} surveySlug
 * @param {string} fioSlug
 */
async function nextSeqForSurveyFio(surveySlug, fioSlug) {
  const bucket = getBucket();
  const client = getS3Client();
  const base = `${PREFIX}${surveySlug}/${fioSlug}/`;
  let maxSeq = 0;
  let continuationToken;
  do {
    const list = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: base,
        Delimiter: '/',
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    );
    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    for (const p of list.CommonPrefixes || []) {
      const pref = String(p.Prefix || '');
      const m = /\/(\d{3})\/$/.exec(pref);
      if (m) maxSeq = Math.max(maxSeq, Number(m[1]));
    }
    for (const o of list.Contents || []) {
      const key = o.Key || '';
      if (!key.startsWith(base)) continue;
      const rel = key.slice(base.length);
      const m2 = /^(\d{3})\//.exec(rel);
      if (m2) maxSeq = Math.max(maxSeq, Number(m2[1]));
    }
  } while (continuationToken);
  const next = maxSeq + 1;
  if (next > 999) throw new Error('Превышен лимит 999 загрузок для этой пары опрос+ФИО');
  return String(next).padStart(3, '0');
}

/**
 * @param {string} title
 * @param {Record<string, string>} participantAnswers
 * @param {string} [fioFieldId]
 * @returns {Promise<string>} относительный путь без PREFIX: SURVEY_CAPS/fio_lat/NNN
 */
async function allocateFileCollectionUploadFolder(title, participantAnswers, fioFieldId) {
  const surveySlug = slugSurveyTitleCaps(title);
  const fioRaw = pickFioFromAnswers(participantAnswers || {}, fioFieldId || '');
  const fioSlug = slugFioLatin(fioRaw);
  const seq = await nextSeqForSurveyFio(surveySlug, fioSlug);
  return `${surveySlug}/${fioSlug}/${seq}`;
}

/**
 * @param {string} key полный ключ объекта
 * @returns {string} идентификатор «папки загрузки»: uuid ИЛИ SURVEY/FIO/NNN
 */
function batchFolderIdFromObjectKey(key) {
  const k = String(key || '');
  if (!k.startsWith(PREFIX)) return '';
  const rel = k.slice(PREFIX.length);
  const m3 = /^([^/]+)\/([^/]+)\/(\d{3})\/(.+)$/.exec(rel);
  if (m3) return `${m3[1]}/${m3[2]}/${m3[3]}`;
  const m1 = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(.+)$/i.exec(rel);
  if (m1) return m1[1];
  const slash = rel.indexOf('/');
  if (slash > 0) return rel.slice(0, slash);
  return rel;
}

function isLegacyUuidBatchId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || '').trim());
}

/** Проверка batch_id из presign/finalize (новый путь или старый UUID). */
function isValidFileCollectionBatchId(id) {
  const s = String(id || '').trim();
  if (!s || s.includes('..') || s.includes('\\')) return false;
  if (isLegacyUuidBatchId(s)) return true;
  const p = s.split('/');
  if (p.length !== 3) return false;
  const [a, b, seq] = p;
  if (!/^\d{3}$/.test(seq)) return false;
  if (!/^[A-Z0-9_]+$/.test(a) || a.length < 1 || a.length > 72) return false;
  if (!/^[a-z0-9_]+$/.test(b) || b.length < 1 || b.length > 64) return false;
  return true;
}

/**
 * @param {{ buffer: Buffer, filename: string, mimeType: string }[]} files
 * @param {{ title: string, description: string, format: string, maxVideoDurationSec: string, participantAnswers: Record<string, string>, fioFieldId?: string }} fields
 */
async function uploadFileCollectionBatch(files, fields) {
  const bucket = getBucket();
  if (!bucket) throw new Error('FILE_COLLECTION_BUCKET не задан');
  const client = getS3Client();
  const batchId = await allocateFileCollectionUploadFolder(
    fields.title,
    fields.participantAnswers || {},
    fields.fioFieldId || '',
  );
  const useAcl = useAclPublicRead();

  const metaJson = JSON.stringify({
    uploaded_at: new Date().toISOString(),
    title: fields.title,
    description: fields.description,
    format: fields.format,
    max_video_duration_sec: fields.maxVideoDurationSec || null,
    participant_answers: fields.participantAnswers && typeof fields.participantAnswers === 'object'
      ? fields.participantAnswers
      : {},
    batch_id: batchId,
  });

  const keys = [];

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${PREFIX}${batchId}/_meta.json`,
      Body: Buffer.from(metaJson, 'utf8'),
      ContentType: 'application/json; charset=utf-8',
      ...(useAcl ? { ACL: 'public-read' } : {}),
    }),
  );
  keys.push(`${PREFIX}${batchId}/_meta.json`);

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const safe = sanitizeFilename(f.filename);
    const key = `${PREFIX}${batchId}/${String(i).padStart(3, '0')}_${safe}`;
    const ct = f.mimeType && String(f.mimeType).trim() ? String(f.mimeType).trim() : 'application/octet-stream';
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: f.buffer,
        ContentType: ct,
        ...(useAcl ? { ACL: 'public-read' } : {}),
      }),
    );
    keys.push(key);
  }

  return { batchId, keys };
}

async function streamToBuffer(body) {
  const chunks = [];
  for await (const chunk of body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Список ключей в бакете сбора файлов (не сайт-статика). */
async function listAllKeysWithPrefix() {
  const bucket = getBucket();
  const client = getS3Client();
  const out = [];
  let continuationToken;
  do {
    const list = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: PREFIX,
        ContinuationToken: continuationToken,
      }),
    );
    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    for (const o of list.Contents || []) {
      if (o.Key) out.push(o.Key);
    }
  } while (continuationToken);
  return out;
}

function isVideoKey(key) {
  const k = String(key);
  if (k.endsWith('/_meta.json')) return false;
  return VIDEO_EXT_RE.test(k);
}

async function listVideoObjectKeys() {
  const all = await listAllKeysWithPrefix();
  return all.filter(isVideoKey).sort();
}

async function getObjectBuffer(key) {
  const bucket = getBucket();
  const client = getS3Client();
  const r = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
  return streamToBuffer(r.Body);
}

/** Потоковая загрузка в файл (длинное аудио без загрузки всего в RAM). */
async function downloadObjectToFile(key, destPath) {
  const bucket = getBucket();
  if (!bucket) throw new Error('FILE_COLLECTION_BUCKET не задан');
  const safe = assertSafeCollectionKey(key);
  const client = getS3Client();
  const r = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: safe,
    }),
  );
  if (!r.Body) throw new Error('Пустой объект в бакете');
  const partPath = `${destPath}.part`;
  await pipeline(r.Body, fs.createWriteStream(partPath));
  fs.renameSync(partPath, destPath);
  return destPath;
}

/** Текстовый артефакт рядом с загрузкой (расшифровка Пульс и т.п.). */
async function putObjectBuffer(key, buffer, contentType = 'application/octet-stream') {
  const bucket = getBucket();
  if (!bucket) throw new Error('FILE_COLLECTION_BUCKET не задан');
  const safe = assertSafeCollectionKey(key);
  const client = getS3Client();
  const useAcl = useAclPublicRead();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: safe,
      Body: buffer,
      ContentType: contentType,
      ...(useAcl ? { ACL: 'public-read' } : {}),
    }),
  );
  return safe;
}

async function getObjectUtf8(key) {
  const buf = await getObjectBuffer(key);
  return buf.toString('utf8');
}

async function putObjectUtf8(key, text, contentType = 'text/plain; charset=utf-8') {
  const bucket = getBucket();
  if (!bucket) throw new Error('FILE_COLLECTION_BUCKET не задан');
  const safe = assertSafeCollectionKey(key);
  const client = getS3Client();
  const useAcl = useAclPublicRead();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: safe,
      Body: Buffer.from(String(text ?? ''), 'utf8'),
      ContentType: contentType,
      ...(useAcl ? { ACL: 'public-read' } : {}),
    }),
  );
  return safe;
}

/** Ключ только внутри PREFIX, без path traversal. */
function assertSafeCollectionKey(key) {
  const k = String(key || '').trim();
  if (!k.startsWith(PREFIX)) throw new Error('Недопустимый ключ объекта');
  if (k.includes('..') || k.includes('\\')) throw new Error('Недопустимый ключ объекта');
  const rest = k.slice(PREFIX.length);
  if (!rest || rest.includes('//')) throw new Error('Недопустимый ключ объекта');
  return k;
}

/**
 * Presigned GET для скачивания одного файла из браузера (минует лимит ответа шлюза на большие видео).
 * @param {string} key
 * @param {number} [expiresSec]
 */
async function deleteObjectKeys(keys) {
  const bucket = getBucket();
  if (!bucket) throw new Error('FILE_COLLECTION_BUCKET не задан');
  const list = (Array.isArray(keys) ? keys : [])
    .map((k) => assertSafeCollectionKey(String(k || '').trim()))
    .filter(Boolean);
  if (!list.length) return { deleted: 0 };
  const client = getS3Client();
  const chunkSize = 100;
  let deleted = 0;
  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize).map((Key) => ({ Key }));
    const res = await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk, Quiet: true },
      }),
    );
    deleted += (res.Deleted || []).length;
  }
  return { deleted };
}

/**
 * @param {string} filename
 * @returns {string}
 */
function contentDispositionAttachment(filename) {
  const raw = String(filename || 'file')
    .replace(/[\r\n"]/g, '_')
    .replace(/[\\/]+/g, '_')
    .trim()
    .slice(0, 180);
  const ascii =
    raw.replace(/[^\x20-\x7E]/g, '_').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_') || 'file';
  const encoded = encodeURIComponent(raw || 'file').replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * @param {string} key
 * @param {number} [expiresSec]
 * @param {{ filename?: string }} [opts]
 */
async function getPresignedGetObjectUrl(key, expiresSec = 3600, opts = {}) {
  const bucket = getBucket();
  if (!bucket) throw new Error('FILE_COLLECTION_BUCKET не задан');
  const safe = assertSafeCollectionKey(key);
  const client = getS3Client();
  const filename = opts && typeof opts.filename === 'string' ? opts.filename.trim() : '';
  const cmd = new GetObjectCommand({
    Bucket: bucket,
    Key: safe,
    ...(filename
      ? {
          ResponseContentDisposition: contentDispositionAttachment(filename),
          ResponseContentType: 'application/octet-stream',
        }
      : {}),
  });
  return getSignedUrl(client, cmd, { expiresIn: Math.min(Math.max(expiresSec, 60), 86400) });
}

/**
 * @param {string} folderRel путь без PREFIX: SURVEY_CAPS/fio/NNN
 * @param {Array<{ filename: string, content_type: string, size: number }>} fileDescriptors
 */
async function presignSinglePut(client, bucket, key, mime, useAcl) {
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: mime,
    ...(useAcl ? { ACL: 'public-read' } : {}),
  });
  const url = await getSignedUrl(client, cmd, { expiresIn: FILE_COLLECTION_PRESIGN_EXPIRES_SEC });
  return { mode: 'put', key, url, content_type: mime };
}

async function presignMultipartPut(client, bucket, key, mime, useAcl, size) {
  const create = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: mime,
      ...(useAcl ? { ACL: 'public-read' } : {}),
    }),
  );
  const uploadId = create.UploadId;
  if (!uploadId) throw new Error('Object Storage не вернул upload_id для multipart');
  const partSize = FILE_COLLECTION_MULTIPART_PART_BYTES;
  const numParts = Math.ceil(size / partSize);
  if (numParts > 10000) {
    throw new Error('Файл слишком большой для multipart (больше 10000 частей)');
  }
  const parts = [];
  for (let partNumber = 1; partNumber <= numParts; partNumber++) {
    const partCmd = new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    const url = await getSignedUrl(client, partCmd, { expiresIn: FILE_COLLECTION_PRESIGN_EXPIRES_SEC });
    parts.push({ part_number: partNumber, url });
  }
  return {
    mode: 'multipart',
    key,
    upload_id: uploadId,
    content_type: mime,
    part_size: partSize,
    parts,
  };
}

async function presignFileCollectionPuts(folderRel, fileDescriptors) {
  const bucket = getBucket();
  if (!bucket) throw new Error('FILE_COLLECTION_BUCKET не задан');
  if (!folderRel || String(folderRel).includes('..')) throw new Error('Недопустимый путь загрузки');
  if (!Array.isArray(fileDescriptors) || fileDescriptors.length === 0) {
    throw new Error('Нет файлов для подписи');
  }
  if (fileDescriptors.length > MAX_FILE_COLLECTION_FILES) {
    throw new Error(`Не больше ${MAX_FILE_COLLECTION_FILES} файлов`);
  }
  const client = getS3Client();
  const useAcl = useAclPublicRead();
  const uploads = [];
  for (let i = 0; i < fileDescriptors.length; i++) {
    const fd = fileDescriptors[i];
    const safe = sanitizeFilename(fd.filename);
    const mime =
      fd.content_type && String(fd.content_type).trim()
        ? String(fd.content_type).trim().slice(0, 200)
        : 'application/octet-stream';
    const size = Number(fd.size);
    const maxBytes = maxFileCollectionBytes();
    if (!Number.isFinite(size) || size <= 0) {
      throw new Error(`Недопустимый размер файла «${safe}»`);
    }
    if (maxBytes > 0 && size > maxBytes) {
      const label = maxFileCollectionBytesLabel();
      throw new Error(`Недопустимый размер файла «${safe}» (макс. ${label})`);
    }
    const key = `${PREFIX}${folderRel}/${String(i).padStart(3, '0')}_${safe}`;
    const spec =
      size > FILE_COLLECTION_SINGLE_PUT_MAX_BYTES
        ? await presignMultipartPut(client, bucket, key, mime, useAcl, size)
        : await presignSinglePut(client, bucket, key, mime, useAcl);
    uploads.push(spec);
  }
  return uploads;
}

/**
 * Завершает multipart после успешных PUT частей с клиента.
 * @param {Array<{ key: string, upload_id: string, parts: Array<{ part_number: number, etag: string }> }>} completions
 */
async function completeFileCollectionMultipartUploads(completions) {
  if (!Array.isArray(completions) || completions.length === 0) return;
  const bucket = getBucket();
  if (!bucket) throw new Error('FILE_COLLECTION_BUCKET не задан');
  const client = getS3Client();
  for (const item of completions) {
    const key = assertSafeCollectionKey(String(item.key || '').trim());
    const uploadId = String(item.upload_id || '').trim();
    if (!uploadId) throw new Error('Не передан upload_id для multipart');
    const rawParts = item.parts;
    if (!Array.isArray(rawParts) || rawParts.length === 0) {
      throw new Error(`Нет частей для завершения multipart (${key})`);
    }
    const parts = rawParts
      .map((p) => ({
        PartNumber: Number(p.part_number),
        ETag: String(p.etag || '').trim(),
      }))
      .filter((p) => Number.isFinite(p.PartNumber) && p.PartNumber >= 1 && p.ETag)
      .sort((a, b) => a.PartNumber - b.PartNumber);
    if (parts.length !== rawParts.length) {
      throw new Error(`Некорректные ETag/part_number для ${key}`);
    }
    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
  }
}

async function verifyBatchFileKeysExist(batchId, keys) {
  const bucket = getBucket();
  const client = getS3Client();
  const prefix = `${PREFIX}${batchId}/`;
  if (!Array.isArray(keys) || keys.length === 0) throw new Error('Не переданы ключи загруженных файлов');
  for (const key of keys) {
    const k = assertSafeCollectionKey(key);
    if (!k.startsWith(prefix)) throw new Error('Ключ не относится к этой загрузке');
    if (k.endsWith('/_meta.json')) throw new Error('Недопустимый ключ');
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: k }));
  }
}

/**
 * @param {string} batchId
 * @param {{ title: string, description: string, format: string, maxVideoDurationSec: string, participantAnswers: Record<string, string> }} fields
 */
async function writeFileCollectionMetaOnly(batchId, fields) {
  const bucket = getBucket();
  const client = getS3Client();
  const useAcl = useAclPublicRead();
  const metaJson = JSON.stringify({
    uploaded_at: new Date().toISOString(),
    title: fields.title,
    description: fields.description,
    format: fields.format,
    max_video_duration_sec: fields.maxVideoDurationSec || null,
    participant_answers:
      fields.participantAnswers && typeof fields.participantAnswers === 'object' ? fields.participantAnswers : {},
    batch_id: batchId,
  });
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${PREFIX}${batchId}/_meta.json`,
      Body: Buffer.from(metaJson, 'utf8'),
      ContentType: 'application/json; charset=utf-8',
      ...(useAcl ? { ACL: 'public-read' } : {}),
    }),
  );
  return `${PREFIX}${batchId}/_meta.json`;
}

/**
 * Все загрузки (батчи) под file-collection/{uuid}/ — для админки.
 * @returns {Promise<{ batches: Array<{ batch_id: string, meta: object|null, files: Array<{ key: string, name: string, size: number, last_modified: string|null }> }> }>}
 */
async function listFileCollectionBatches() {
  const bucket = getBucket();
  const client = getS3Client();
  /** @type {Map<string, Array<{ key: string, name: string, size: number, last_modified: string|null }>>} */
  const byBatch = new Map();
  let continuationToken;
  do {
    const list = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: PREFIX,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    );
    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    for (const o of list.Contents || []) {
      const key = o.Key;
      if (!key || !key.startsWith(PREFIX)) continue;
      const batchId = batchFolderIdFromObjectKey(key);
      if (!batchId) continue;
      const name = key.slice(PREFIX.length + batchId.length + 1);
      if (!name) continue;
      const row = {
        key,
        name,
        size: Number(o.Size) || 0,
        last_modified: o.LastModified && typeof o.LastModified.toISOString === 'function'
          ? o.LastModified.toISOString()
          : null,
      };
      if (!byBatch.has(batchId)) byBatch.set(batchId, []);
      byBatch.get(batchId).push(row);
    }
  } while (continuationToken);

  const batchIds = Array.from(byBatch.keys());
  const metas = await Promise.all(
    batchIds.map(async (batchId) => {
      const objects = byBatch.get(batchId) || [];
      const metaKey = objects.find((x) => x.name === '_meta.json')?.key;
      let meta = null;
      if (metaKey) {
        try {
          const buf = await getObjectBuffer(metaKey);
          meta = JSON.parse(buf.toString('utf8'));
        } catch (e) {
          meta = { error: 'meta_parse_failed' };
        }
      }
      return { batchId, objects, meta };
    }),
  );

  const batches = metas.map(({ batchId, objects, meta }) => {
    const files = objects.filter((x) => x.name !== '_meta.json').sort((a, b) => a.name.localeCompare(b.name));
    return { batch_id: batchId, meta, files };
  });
  batches.sort((a, b) => {
    const ta = batchUploadedAtIso(a);
    const tb = batchUploadedAtIso(b);
    return tb.localeCompare(ta);
  });
  const surveyBatches = batches.filter((b) => isSurveyFileCollectionBatch(b));
  const groups = groupSurveyFileCollectionBatches(surveyBatches);
  return { batches: surveyBatches, groups };
}

const SURVEY_UPLOAD_FORMATS = new Set(['text', 'any', 'video', 'photo']);
const RESERVED_SURVEY_BATCH_PREFIXES = new Set(['PULSE_AI', 'audio-protocol', 'pulse-templates']);

function batchUploadedAtIso(batch) {
  const u = batch?.meta && typeof batch.meta.uploaded_at === 'string' ? batch.meta.uploaded_at : '';
  if (u) return u;
  const lm = batch?.files?.map((f) => f.last_modified).filter(Boolean).sort()[0];
  return lm || '';
}

function isReservedSurveyBatchPrefix(batchId) {
  const first = String(batchId || '').split('/')[0];
  return RESERVED_SURVEY_BATCH_PREFIXES.has(first);
}

/** Только ответы участников опросов «Сбор файлов», не Pulse AI / протоколы / шаблоны. */
function isSurveyFileCollectionBatch(batch) {
  const batchId = String(batch?.batch_id || '');
  if (!batchId || isReservedSurveyBatchPrefix(batchId)) return false;
  const meta = batch?.meta;
  if (!meta || typeof meta !== 'object' || meta.error) return false;
  const pa = meta.participant_answers;
  if (pa && typeof pa === 'object' && String(pa.pulse_ai || '') === '1') return false;
  const format = String(meta.format || '').trim();
  if (!SURVEY_UPLOAD_FORMATS.has(format)) return false;
  if (!String(meta.title || '').trim()) return false;
  return true;
}

function surveyGroupTitle(batch) {
  const title = String(batch?.meta?.title || '').trim();
  if (title) return title;
  const first = String(batch?.batch_id || '').split('/')[0];
  return first || String(batch?.batch_id || 'Без названия');
}

/**
 * @param {Array<{ batch_id: string, meta: object|null, files: object[] }>} surveyBatches
 */
function groupSurveyFileCollectionBatches(surveyBatches) {
  const byTitle = new Map();
  for (const b of surveyBatches) {
    const title = surveyGroupTitle(b);
    if (!byTitle.has(title)) byTitle.set(title, []);
    byTitle.get(title).push(b);
  }
  const groups = [];
  for (const [survey_title, items] of byTitle.entries()) {
    items.sort((a, b) => batchUploadedAtIso(a).localeCompare(batchUploadedAtIso(b)));
    groups.push({
      survey_title,
      survey_key: slugSurveyTitleCaps(survey_title),
      batches: items,
    });
  }
  groups.sort((a, b) => {
    const ta = batchUploadedAtIso(a.batches[0]);
    const tb = batchUploadedAtIso(b.batches[0]);
    return ta.localeCompare(tb);
  });
  return groups;
}

module.exports = {
  PREFIX,
  MAX_FILE_COLLECTION_FILES,
  maxFileCollectionBytes,
  maxFileCollectionBytesLabel,
  getBucket,
  shouldUseFileCollectionStorage,
  shouldUseStaffPhotoStorage,
  getStaffPhotoPublicBaseUrl,
  uploadStaffPhotoPair,
  uploadFileCollectionBatch,
  allocateFileCollectionUploadFolder,
  presignFileCollectionPuts,
  completeFileCollectionMultipartUploads,
  FILE_COLLECTION_SINGLE_PUT_MAX_BYTES,
  FILE_COLLECTION_MULTIPART_PART_BYTES,
  verifyBatchFileKeysExist,
  writeFileCollectionMetaOnly,
  listVideoObjectKeys,
  getObjectBuffer,
  downloadObjectToFile,
  getObjectUtf8,
  putObjectBuffer,
  putObjectUtf8,
  isVideoKey,
  listFileCollectionBatches,
  getPresignedGetObjectUrl,
  deleteObjectKeys,
  assertSafeCollectionKey,
  isValidFileCollectionBatchId,
};
