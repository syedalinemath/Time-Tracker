/* ==============================================
   AUTHENTICATION (frontend ↔ backend)
   Hooks up login/register/reset UI to Express API
   ============================================== */

document.addEventListener("DOMContentLoaded", function () {
  // Sections
  const loginSection = document.getElementById("login-section");
  const registerSection = document.getElementById("register-section");
  const resetSection = document.getElementById("reset-section");

  // Forms
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const resetForm = document.getElementById("reset-form");

  // Links
  const showRegisterLink = document.getElementById("show-register");
  const showLoginLink = document.getElementById("show-login");
  const forgotPasswordLink = document.getElementById("forgot-password");
  const backToLoginLink = document.getElementById("back-to-login");

  // Messages
  const messageArea = document.getElementById("message-area");
  const messageText = document.getElementById("message-text");

  // If not on the auth page, exit early
  if (!loginSection && !registerSection && !resetSection) {
    return;
  }

  /* =============== UI Helpers =============== */
  function showRegisterForm() {
    loginSection.style.display = "none";
    resetSection.style.display = "none";
    registerSection.style.display = "block";
    hideMessage();
  }

  function showLoginForm() {
    registerSection.style.display = "none";
    resetSection.style.display = "none";
    loginSection.style.display = "block";
    hideMessage();
  }

  function showResetForm() {
    loginSection.style.display = "none";
    registerSection.style.display = "none";
    resetSection.style.display = "block";
    hideMessage();
  }

  function showSuccessMessage(msg) {
    messageText.textContent = msg;
    messageArea.className = "message-success";
    messageArea.style.display = "block";
  }

  function showErrorMessage(msg) {
    messageText.textContent = msg;
    messageArea.className = "message-error";
    messageArea.style.display = "block";
  }

  function showInfoMessage(msg) {
    messageText.textContent = msg;
    messageArea.className = "message-info";
    messageArea.style.display = "block";
  }

  function hideMessage() {
    messageArea.style.display = "none";
    messageArea.className = "";
  }

  /* =============== Validation =============== */
  function isValidEmail(email) {
    const pat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return pat.test(email);
  }

  function validatePassword(pw) {
    return (pw || "").length >= 6;
  }

  /* =============== Auth storage & fetch =============== */
  function setToken(token) {
    localStorage.setItem("authToken", token);
  }
  function getToken() {
    return localStorage.getItem("authToken");
  }
  function clearToken() {
    localStorage.removeItem("authToken");
  }
  function setCurrentUser(user) {
    localStorage.setItem("currentUser", JSON.stringify(user));
  }

  // Frontend/js/http.js
  // One shared, safe fetch helper for all API requests.

  (function () {
    /**
     * authFetch(path, { method, headers, body }?)
     * - Handles JWT header automatically
     * - Safely builds options (no spreading undefined)
     * - Auto-JSON stringifies plain objects for body
     * - Returns Response so callers can check res.ok or res.json()
     */
    window.authFetch = async function authFetch(
      path,
      { method = "GET", headers = {}, body } = {}
    ) {
      // Pull token saved after login
      const token = localStorage.getItem("authToken");

      // Merge headers safely; allow overrides
      const finalHeaders = {
        "Content-Type": "application/json",
        ...(headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      // Build fetch options without spreading possibly undefined objects
      const opts = {
        method,
        headers: finalHeaders,
        ...(body !== undefined
          ? { body: typeof body === "string" ? body : JSON.stringify(body) }
          : {}),
      };

      // Use the base API url helper you already have
      return fetch(apiUrl(path), opts);
    };
  })();

  async function verifySessionAndMaybeRedirect() {
    const token = getToken();
    if (!token) return;
    try {
      const res = await authFetch("/api/auth/me");
      if (res.ok) {
        const me = await res.json();
        setCurrentUser(me);
        window.location.href = "/dashboard";
      } else {
        clearToken();
        localStorage.removeItem("currentUser");
      }
    } catch {
      clearToken();
      localStorage.removeItem("currentUser");
    }
  }

  /* =============== Form handlers =============== */
  async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    if (!isValidEmail(email))
      return showErrorMessage("Enter a valid email address");
    if (!password) return showErrorMessage("Enter your password");

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Logging in...";

    try {
      const res = await authFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        showErrorMessage(data.error || "Login failed");
      } else {
        setToken(data.token);
        setCurrentUser(data.user);
        showSuccessMessage("Login successful! Redirecting...");
        setTimeout(() => (window.location.href = "/dashboard"), 800);
      }
    } catch {
      showErrorMessage("Network error. Please try again.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Login";
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById("register-name").value.trim();
    const email = document
      .getElementById("register-email")
      .value.trim()
      .toLowerCase();
    const password = document.getElementById("register-password").value;
    const confirmPassword = document.getElementById(
      "register-confirm-password"
    ).value;

    if (!name) return showErrorMessage("Enter your name");
    if (!isValidEmail(email)) return showErrorMessage("Enter a valid email");
    if (!validatePassword(password))
      return showErrorMessage("Password must be at least 6 characters");
    if (password !== confirmPassword)
      return showErrorMessage("Passwords do not match");

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Creating account...";

    try {
      const res = await authFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        showErrorMessage(data.error || "Registration failed");
      } else {
        showSuccessMessage("Account created! Please log in.");
        e.target.reset();
        setTimeout(showLoginForm, 800);
      }
    } catch {
      showErrorMessage("Network error. Please try again.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Create Account";
    }
  }

  function handlePasswordReset(e) {
    e.preventDefault();
    const email = document.getElementById("reset-email").value.trim();
    if (!isValidEmail(email)) return showErrorMessage("Enter a valid email");
    showInfoMessage("If this were connected, we would email a reset link.");
  }

  /* =============== Listeners =============== */
  if (showRegisterLink)
    showRegisterLink.addEventListener("click", (e) => {
      e.preventDefault();
      showRegisterForm();
    });

  if (showLoginLink)
    showLoginLink.addEventListener("click", (e) => {
      e.preventDefault();
      showLoginForm();
    });

  if (forgotPasswordLink)
    forgotPasswordLink.addEventListener("click", (e) => {
      e.preventDefault();
      showResetForm();
    });

  if (backToLoginLink)
    backToLoginLink.addEventListener("click", (e) => {
      e.preventDefault();
      showLoginForm();
    });

  if (loginForm) loginForm.addEventListener("submit", handleLogin);
  if (registerForm) registerForm.addEventListener("submit", handleRegister);
  if (resetForm) resetForm.addEventListener("submit", handlePasswordReset);

  // Hide message on load
  if (messageArea) hideMessage();

  // Already logged in? verify and redirect
  if (loginSection) {
    verifySessionAndMaybeRedirect();
  }

  console.log("Authentication system loaded");
});

/* ==============================================
   Shared helpers for dashboard.js
   ============================================== */
function clearUserData() {
  localStorage.removeItem("currentUser");
  localStorage.removeItem("timeEntries");
  localStorage.removeItem("authToken");
}

function getCurrentUser() {
  const s = localStorage.getItem("currentUser");
  return s ? JSON.parse(s) : null;
}

function isUserLoggedIn() {
  return !!localStorage.getItem("authToken");
}
