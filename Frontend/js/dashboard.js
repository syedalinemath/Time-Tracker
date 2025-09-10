/* ==============================================
   DASHBOARD (frontend ↔ backend)
   Time tracking with JWT + SQLite API
   ============================================== */

document.addEventListener("DOMContentLoaded", () => {
  if (!isUserLoggedIn()) {
    window.location.href = "/login.html";
    return;
  }
  new TimeTrackingDashboard();
});

/* ==============================================
   Main Dashboard Class
   ============================================== */
class TimeTrackingDashboard {
  constructor() {
    this.currentUser = getCurrentUser();
    this.isCheckedIn = false;
    this.currentOpenEntry = null;
    this.baseTodayHours = 0;

    this.cacheEls();
    this.bindEvents();

    this.paintWelcome();
    this.startClock();

    this.refreshAll().then(() =>
      console.log("Dashboard ready for:", this.currentUser?.name || "User")
    );
  }

  /* -------- DOM -------- */
  cacheEls() {
    this.welcomeMessage = document.getElementById("welcome-message");
    this.logoutBtn = document.getElementById("logout-btn");
    this.currentTimeEl = document.getElementById("current-time");

    this.statusIndicator = document.getElementById("status-indicator");
    this.lastAction = document.getElementById("last-action");

    this.checkInBtn = document.getElementById("check-in-btn");
    this.checkOutBtn = document.getElementById("check-out-btn");

    this.todayHours = document.getElementById("today-hours");
    this.todaySessions = document.getElementById("today-sessions");
    this.weekHours = document.getElementById("week-hours");
    this.weekDays = document.getElementById("week-days");
    this.monthHours = document.getElementById("month-hours");
    this.monthDays = document.getElementById("month-days");

    this.exportWeekBtn = document.getElementById("export-week-btn");

    this.entriesContainer = document.getElementById("entries-container");
    this.noEntries = document.getElementById("no-entries");

    this.entryModal = document.getElementById("entry-modal");
    this.modalClose = document.getElementById("modal-close");
    this.entryForm = document.getElementById("entry-form");
    this.addEntryBtn = document.getElementById("add-entry-btn");

    this.dailyReportBtn = document.getElementById("daily-report-btn");
    this.weeklyReportBtn = document.getElementById("weekly-report-btn");
    this.monthlyReportBtn = document.getElementById("monthly-report-btn");

    this.notificationArea = document.getElementById("notification-area");
    this.notificationContent = document.getElementById("notification-content");
  }

  bindEvents() {
    if (this.logoutBtn)
      this.logoutBtn.addEventListener("click", () => {
        clearUserData();
        window.location.href = "/";
      });

    if (this.checkInBtn)
      this.checkInBtn.addEventListener("click", () => this.handleCheckIn());
    if (this.checkOutBtn)
      this.checkOutBtn.addEventListener("click", () => this.handleCheckOut());

    if (this.exportWeekBtn)
      this.exportWeekBtn.addEventListener("click", () =>
        this.exportWeeklyData()
      );

    if (this.addEntryBtn)
      this.addEntryBtn.addEventListener("click", () =>
        this.showAddEntryModal()
      );
    if (this.modalClose)
      this.modalClose.addEventListener("click", () => this.hideModal());
    if (this.entryForm)
      this.entryForm.addEventListener("submit", (e) =>
        this.handleManualEntry(e)
      );

    if (this.dailyReportBtn)
      this.dailyReportBtn.addEventListener("click", () =>
        this.showDailyReport()
      );
    if (this.weeklyReportBtn)
      this.weeklyReportBtn.addEventListener("click", () =>
        this.showWeeklyReport()
      );
    if (this.monthlyReportBtn)
      this.monthlyReportBtn.addEventListener("click", () =>
        this.showMonthlyReport()
      );
  }

  /* -------- Init -------- */
  paintWelcome() {
    if (this.welcomeMessage && this.currentUser?.name) {
      this.welcomeMessage.textContent = `Welcome, ${this.currentUser.name}`;
    }
  }

  startClock() {
    const tick = () => {
      if (this.currentTimeEl) {
        this.currentTimeEl.textContent = new Date().toLocaleString();
      }
      if (this.isCheckedIn && this.currentOpenEntry?.check_in) {
        this.updateWorkStatus(true, new Date(this.currentOpenEntry.check_in));
        this.updateLiveOpenEntryHours();
        this.updateLiveTodayHours();
      }
    };
    tick();
    setInterval(tick, 1000);
    setInterval(() => this.refreshSummaries(), 60000); // once per minute
  }

  async refreshAll() {
    await Promise.all([
      this.refreshOpenSession(),
      this.refreshSummaries(),
      this.refreshEntries(),
    ]);
    this.updateButtons();
  }

  async refreshOpenSession() {
    const entries = await this.fetchEntries({ limit: 25 });
    this.currentOpenEntry = entries.find((e) => !e.check_out) || null;
    this.isCheckedIn = !!this.currentOpenEntry;

    this.updateWorkStatus(this.isCheckedIn, this.currentOpenEntry?.check_in);
  }

  async refreshSummaries() {
    try {
      const res = await authFetch("/api/reports/summary");
      if (!res.ok) throw new Error();
      const s = await res.json();

      this.baseTodayHours = Number(s.today.hours) || 0;
      this.todayHours.textContent = `${this.baseTodayHours.toFixed(2)} hrs`;
      this.todaySessions.textContent = `${s.today.sessions} sessions`;
      this.weekHours.textContent = `${Number(s.thisWeek.hours).toFixed(2)} hrs`;
      this.weekDays.textContent = `${s.thisWeek.days} days worked`;
      this.monthHours.textContent = `${Number(s.thisMonth.hours).toFixed(
        2
      )} hrs`;
      this.monthDays.textContent = `${s.thisMonth.days} days worked`;
    } catch {
      this.showNotification("Could not load summaries.", "error");
    }
  }

  async refreshEntries() {
    try {
      const entries = await this.fetchEntries({ limit: 10 });
      this.renderEntries(entries);
    } catch {
      this.showNotification("Could not load entries.", "error");
    }
  }

  updateButtons() {
    this.checkInBtn.disabled = this.isCheckedIn;
    this.checkOutBtn.disabled = !this.isCheckedIn;
  }

  updateWorkStatus(checkedIn, since) {
    if (checkedIn) {
      this.statusIndicator.textContent = "🟢 Checked In";
      this.lastAction.textContent = `Working since ${this.formatTime(
        new Date(since)
      )}`;
    } else {
      this.statusIndicator.textContent = "🔴 Not Checked In";
      this.lastAction.textContent = "Ready to start your day!";
    }
  }

  /* -------- Actions -------- */
  async handleCheckIn() {
    if (this.isCheckedIn) return this.showNotification("Already checked in.");

    const now = new Date();
    const payload = {
      checkIn: now.toISOString(),
      date: toYMD(now),
    };

    const res = await authFetch("/api/time-entries", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) return this.showNotification("Check-in failed.", "error");

    this.showNotification(`Checked in at ${this.formatTime(now)}`, "success");
    await this.refreshAll();
  }

  async handleCheckOut() {
    if (!this.isCheckedIn || !this.currentOpenEntry)
      return this.showNotification("Not checked in.", "warning");

    const now = new Date();
    const res = await authFetch(
      `/api/time-entries/${this.currentOpenEntry.id}`,
      {
        method: "PUT",
        body: JSON.stringify({ checkOut: now.toISOString() }),
      }
    );
    if (!res.ok) return this.showNotification("Check-out failed.", "error");

    this.showNotification(`Checked out at ${this.formatTime(now)}`, "success");
    await this.refreshAll();
  }

  async handleManualEntry(e) {
    e.preventDefault();
    const date = this.entryForm.querySelector("#manual-date")?.value;
    const inVal = this.entryForm.querySelector("#manual-checkin")?.value;
    const outVal = this.entryForm.querySelector("#manual-checkout")?.value;

    if (!date || !inVal || !outVal)
      return this.showNotification("Fill all fields.", "warning");

    const payload = {
      checkIn: localDateTimeToISO(date, inVal),
      checkOut: localDateTimeToISO(date, outVal),
      date,
      isManualEntry: true,
    };

    const res = await authFetch("/api/time-entries", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) return this.showNotification("Manual entry failed.", "error");

    this.showNotification("Manual entry added.", "success");
    this.entryForm.reset();
    this.hideModal();
    await this.refreshEntries();
    await this.refreshSummaries();
  }

  /* -------- Rendering -------- */
  renderEntries(entries) {
    this.entriesContainer.innerHTML = "";
    if (!entries.length) {
      this.noEntries.style.display = "block";
      return;
    }
    this.noEntries.style.display = "none";

    entries.forEach((entry) => {
      const checkIn = entry.check_in
        ? this.formatTime(new Date(entry.check_in))
        : "-";
      const checkOut = entry.check_out
        ? this.formatTime(new Date(entry.check_out))
        : "-";

      // Live hours if still checked in
      let hoursDisplay;
      if (!entry.check_out && entry.check_in) {
        const now = Date.now();
        const inMs = new Date(entry.check_in).getTime();
        const liveHours = (now - inMs) / (1000 * 60 * 60);
        hoursDisplay = `${liveHours.toFixed(2)} (live)`;
      } else {
        hoursDisplay = Number(entry.hours || 0).toFixed(2);
      }

      const div = document.createElement("div");
      div.className = "entry-row";
      div.innerHTML = `
        <div><strong>${entry.date}</strong> | In: ${checkIn} | Out: ${checkOut}</div>
        <div>Hours: <span class="entry-hours" data-entry-id="${entry.id}">${hoursDisplay}</span></div>
        <button data-id="${entry.id}" class="delete-entry">🗑️</button>
      `;
      div
        .querySelector(".delete-entry")
        .addEventListener("click", () => this.deleteEntry(entry.id));
      this.entriesContainer.appendChild(div);
    });
  }

  updateLiveOpenEntryHours() {
    if (!this.currentOpenEntry?.check_in) return;
    const el = document.querySelector(
      `.entry-hours[data-entry-id="${this.currentOpenEntry.id}"]`
    );
    if (!el) return;
    const now = Date.now();
    const inMs = new Date(this.currentOpenEntry.check_in).getTime();
    const liveHours = (now - inMs) / (1000 * 60 * 60);
    el.textContent = `${liveHours.toFixed(2)} (live)`;
  }

  updateLiveTodayHours() {
    if (!this.isCheckedIn || !this.currentOpenEntry?.check_in) return;
    const inMs = new Date(this.currentOpenEntry.check_in).getTime();
    const liveHours = (Date.now() - inMs) / (1000 * 60 * 60);
    const total = (this.baseTodayHours || 0) + liveHours;
    if (this.todayHours)
      this.todayHours.textContent = `${total.toFixed(2)} hrs`;
  }

  async deleteEntry(id) {
    if (!confirm("Delete this entry?")) return;
    const res = await authFetch(`/api/time-entries/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) return this.showNotification("Delete failed.", "error");

    this.showNotification("Entry deleted.", "success");
    await this.refreshEntries();
    await this.refreshSummaries();
  }

  /* -------- Reports -------- */
  async showDailyReport() {
    const today = toYMD(new Date());
    this.renderReportRange(today, today, "Daily");
  }

  async showWeeklyReport() {
    const { start, end } = getCurrentWeekRange();
    this.renderReportRange(start, end, "Weekly");
  }

  async showMonthlyReport() {
    const { start, end } = getCurrentMonthRange();
    this.renderReportRange(start, end, "Monthly");
  }

  async renderReportRange(startDate, endDate, label) {
    const entries = await this.fetchEntries({ startDate, endDate });
    const total = entries.reduce((sum, e) => sum + (e.hours || 0), 0);
    this.showNotification(`${label}: ${total.toFixed(2)} hrs`, "info");
    this.renderEntries(entries);
  }

  /* -------- Export -------- */
  exportWeeklyData() {
    if (typeof ExcelExportManager === "function") {
      new ExcelExportManager().generateWeeklyExcelReport();
    } else {
      this.showNotification("Excel exporter not loaded.", "warning");
    }
  }

  /* -------- API -------- */
  async fetchEntries({ startDate, endDate, limit } = {}) {
    const params = new URLSearchParams();
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    if (limit) params.append("limit", limit);

    const url = params.toString()
      ? `/api/time-entries?${params.toString()}`
      : "/api/time-entries";

    const res = await authFetch(url);
    if (!res.ok) throw new Error();
    return res.json();
  }

  /* -------- UI -------- */
  showAddEntryModal() {
    this.entryModal.style.display = "block";
  }
  hideModal() {
    this.entryModal.style.display = "none";
  }

  showNotification(text, type = "success") {
    this.notificationContent.textContent = text;
    this.notificationArea.className = `notification ${type}`;
    this.notificationArea.style.display = "block";
    setTimeout(() => (this.notificationArea.style.display = "none"), 3000);
  }

  formatTime(d) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
}

/* ==============================================
   Helpers
   ============================================== */
async function authFetch(urlPath, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = localStorage.getItem("authToken");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  return fetch(apiUrl(urlPath), { ...options, headers });
}

function toYMD(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(dt.getDate()).padStart(2, "0")}`;
}

function getCurrentWeekRange() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const start = new Date(now);
  start.setDate(now.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: toYMD(start), end: toYMD(end) };
}

function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: toYMD(start), end: toYMD(end) };
}

function localDateTimeToISO(dateYMD, timeHM) {
  const [h, m] = timeHM.split(":").map(Number);
  const [y, mo, d] = dateYMD.split("-").map(Number);
  return new Date(y, mo - 1, d, h, m).toISOString();
}
