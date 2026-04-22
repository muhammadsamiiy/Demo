(function () {
  async function apiFetch(url, options) {
    return fetch(url, options);
  }

  window.apiFetch = apiFetch;
})();
