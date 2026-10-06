'use strict';
const { matchesAllowlistedIdentity } = require('./identity-allowlist');
const PRIMAKOVA_RESOURCE_PERSON = {
  key: 'primakova',
  emails: ['marianna.primakova@primakov.school', 'primakova@primakov.school'],
  display_name: 'Примакова Марианна Николаевна',
  full_names: ['примакова марианна николаевна', 'марианна николаевна примакова', 'примакова марианна', 'марианна примакова'],
};
function isPrimakovaResourceUser(user, staffName) {
  return matchesAllowlistedIdentity(user, staffName, PRIMAKOVA_RESOURCE_PERSON);
}
module.exports = { PRIMAKOVA_RESOURCE_PERSON, isPrimakovaResourceUser };
