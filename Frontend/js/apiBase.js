(function () {
  const backendBase = window.location.origin;
  window.API_BASE = backendBase;
  window.apiUrl = (path) => `${backendBase}${path}`;
})();
