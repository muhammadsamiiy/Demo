(function () {
  function safeText(value) {
    return String(value == null ? "" : value);
  }

  window.AppUtils = {
    safeText,
  };
})();
