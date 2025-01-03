// SPDX-License-Identifier: Apache-2.0

const replacements = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;',
};

export const escapeHTML = (str) => {
  return str.replace(/[&<>"']/g, (char) => replacements[char]);
};
