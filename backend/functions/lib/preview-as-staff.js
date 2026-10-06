'use strict';

const { isPlatformOwner } = require('./platform-owner');

function isMfaVerified(user) {
  return Boolean(user && user.mfa_verified);
}

/** «Смотреть как сотрудник»: только владелец платформы после MFA. Иначе fail-closed. */
function canPreviewAsStaff(user, env = process.env) {
  if (!isPlatformOwner(user, env)) return false;
  return isMfaVerified(user);
}

function previewAsStaffDeniedReason(user, env = process.env) {
  if (!isPlatformOwner(user, env)) return 'owner_required';
  if (!isMfaVerified(user)) return 'mfa_required';
  return null;
}

module.exports = {
  canPreviewAsStaff,
  isMfaVerified,
  previewAsStaffDeniedReason,
};
