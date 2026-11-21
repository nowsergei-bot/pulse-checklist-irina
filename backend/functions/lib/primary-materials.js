'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {json, parseQuery} = require('./http');
const materials = require('../data/primary-materials.json');
const byId = new Map(materials.map(item => [item.id, item]));
const assetRoot = path.resolve(__dirname, '../assets/primary-materials');

function materialList() {
  return materials.map(({filename, sha256, ...item}) => item);
}

function requestedRange(event, length) {
  const query = parseQuery(event) || {};
  if (query.from !== undefined || query.to !== undefined) {
    if (!/^\d+$/.test(String(query.from)) || !/^\d+$/.test(String(query.to))) return false;
    const start = Number(query.from), end = Number(query.to) - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= length || end >= length || end - start >= 2 * 1024 * 1024) return false;
    return {start, end};
  }
  const header = String(Object.entries(event.headers || {}).find(([name]) => name.toLowerCase() === 'range')?.[1] || '');
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || !match[1] && !match[2]) return false;
  const start = match[1] ? Number(match[1]) : Math.max(0, length - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), length - 1) : length - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= length) return false;
  return {start, end};
}

// Called only after the primary-school session, preview and capability checks.
async function materialFile(event, method, id) {
  const item = byId.get(id);
  if (!item) return json(404, {message: 'Материал не найден.'});
  const range = requestedRange(event, item.bytes);
  const headers = {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `${parseQuery(event)?.download === '1' ? 'attachment' : 'inline'}; filename="${item.filename}"; filename*=UTF-8''${encodeURIComponent(item.downloadName).replace(/'/g, '%27')}`,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (range === false) return {statusCode: 416, headers: {...headers, 'Content-Range': `bytes */${item.bytes}`}, body: ''};
  const start = range?.start || 0, end = range?.end ?? item.bytes - 1, length = end - start + 1;
  headers['Content-Length'] = String(length);
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${item.bytes}`;
  if (method === 'HEAD') return {statusCode: range ? 206 : 200, headers, body: ''};
  const handle = await fs.open(path.join(assetRoot, item.filename), 'r');
  try {
    const stat = await handle.stat();
    if (stat.size !== item.bytes) throw new Error('primary_material_size_mismatch');
    const bytes = Buffer.alloc(length);
    let offset = 0;
    while (offset < length) {
      const read = await handle.read(bytes, offset, length - offset, start + offset);
      if (!read.bytesRead) throw new Error('primary_material_truncated');
      offset += read.bytesRead;
    }
    return {statusCode: range ? 206 : 200, headers, isBase64Encoded: true, body: bytes.toString('base64')};
  } finally { await handle.close(); }
}

module.exports = {materialList, materialFile, requestedRange};
