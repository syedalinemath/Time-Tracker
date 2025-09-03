(function () {
  const { protocol, host, origin } = window.location;

  const isFile = protocol === "file:";
  const isLiveServer =
    /:(5500|5501)$/.test(host) || /127\.0\.0\.1:5500/.test(origin);

  // If file:// or Live Server, point to backend on 3000; otherwise use same origin.
  const backendBase = isFile || isLiveServer ? "http://localhost:3000" : origin;

  window.API_BASE = backendBase;
  window.apiUrl = function apiUrl(path) {
    return `${backendBase}${path}`;
  };
})();
