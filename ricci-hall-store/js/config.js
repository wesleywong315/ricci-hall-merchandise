// config.js — API base resolution
// __PORT_8000__ is replaced with the real proxy path ("port/8000") by
// deploy_website at deploy time. Locally (before deploy) it stays literal,
// so we fall back to localhost for local testing.
(function () {
  var placeholder = '__PORT_8000__';
  var API_BASE = placeholder.indexOf('__') === 0 ? 'http://localhost:8000' : placeholder;
  window.RICCI_API_BASE = API_BASE;
})();
