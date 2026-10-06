'use strict';

const fs = require('fs');
const path = require('path');
const { staffPhotoKey, twoTokenAliasKeys, hashKey } = require('./staff-photo-match');

const INDEX_PATH = path.join(__dirname, '../data/staff-photo-index.json');

let cached = null;

function loadStaffPhotoIndex() {
  if (cached) return cached;
  try {
    cached = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  } catch {
    cached = { photos: {}, counts: {} };
  }
  if (!cached.photos) cached.photos = {};
  return cached;
}

function resetStaffPhotoIndexCache() {
  cached = null;
}

function lookupCatalogFile(fullName) {
  const index = loadStaffPhotoIndex();
  const keys = [staffPhotoKey(fullName)];
  for (const alias of twoTokenAliasKeys(fullName)) keys.push(hashKey(alias));
  for (const key of keys) {
    if (!key) continue;
    const hit = index.photos[key];
    if (hit && hit.file) return hit.file;
  }
  return null;
}

function catalogPhotoUrls(fullName) {
  const file = lookupCatalogFile(fullName);
  if (!file) return null;
  let base = '';
  try {
    const { getStaffPhotoPublicBaseUrl } = require('./file-collection-s3');
    base = String(getStaffPhotoPublicBaseUrl() || '').replace(/\/+$/, '');
  } catch {
    base = '';
  }
  if (base) {
    return {
      photo_url: `${base}/staff-photos/${file}.jpg`,
      photo_thumb_url: `${base}/staff-photos/${file}-t.jpg`,
    };
  }
  // Local Vite / legacy static-bucket paths (wiped by sync --delete unless preserved).
  return {
    photo_url: `/staff-photos/${file}.jpg`,
    photo_thumb_url: `/staff-photos/${file}-t.jpg`,
  };
}

/** Пользовательская загрузка важнее импорта с сайта. */
function applyCatalogPhoto(target, fullName) {
  if (!target) return target;
  if (target.photo_url || target.photo_thumb_url) return target;
  const catalog = catalogPhotoUrls(fullName || target.full_name || target.display_name);
  if (!catalog) return target;
  target.photo_url = catalog.photo_url;
  target.photo_thumb_url = catalog.photo_thumb_url;
  return target;
}

module.exports = {
  INDEX_PATH,
  loadStaffPhotoIndex,
  resetStaffPhotoIndexCache,
  catalogPhotoUrls,
  applyCatalogPhoto,
};
