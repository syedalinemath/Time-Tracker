/* ==============================================
   EXCEL EXPORT SYSTEM (backend-powered)
   Builds a weekly workbook from API data
   Requires: SheetJS (xlsx.full.min.js) loaded in index.html
   ============================================== */

class ExcelExportManager {
  constructor() {
    this.initializeWeeklyExport();
  }

  /* --------------- Weekly automation --------------- */
  initializeWeeklyExport() {
    this.checkAndGenerateWeeklyReport(); // run on load
    setInterval(() => this.checkAndGenerateWeeklyReport(), 60 * 60 * 1000); // hourly
    console.log("Weekly Excel export system initialized");
  }

  checkAndGenerateWeeklyReport() {
    const now = new Date();
    const currentWeek = this.getWeekString(now);
    const lastGeneratedWeek = localStorage.getItem("lastExcelWeek");

    if (lastGeneratedWeek !== currentWeek) {
      this.generateWeeklyExcelReport().then(() => {
        localStorage.setItem("lastExcelWeek", currentWeek);
      });
    }
  }

  getWeekString(date) {
    const year = date.getFullYear();
    const week = getISOWeekNumber(date);
    return `${year}-W${String(week).padStart(2, "0")}`;
  }

  getCurrentWeekRange() {
    return getCurrentWeekRange();
  }

  /* --------------- Main export --------------- */
  async generateWeeklyExcelReport() {
    if (typeof XLSX === "undefined" || !XLSX.utils || !XLSX.writeFile) {
      this.notify("Excel library not loaded.", "error");
      return;
    }

    const token = localStorage.getItem("authToken");
    if (!token) {
      this.notify("You must be logged in to export.", "warning");
      return;
    }

    try {
      const weekRange = this.getCurrentWeekRange();
      const currentUser = await this.fetchCurrentUser();
      const entries = await this.fetchEntries(weekRange.start, weekRange.end);

      const wb = XLSX.utils.book_new();

      // Summary sheet
      const summaryWs = this.buildSummarySheet(
        [currentUser],
        { [currentUser.email]: entries },
        weekRange
      );
      XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

      // User sheet
      const userWs = this.buildUserSheet(currentUser, entries);
      XLSX.utils.book_append_sheet(
        wb,
        userWs,
        safeSheetName(currentUser.name || "User")
      );

      const filename = `TimeTracker_Week_${weekRange.start}_to_${weekRange.end}.xlsx`;
      XLSX.writeFile(wb, filename);

      this.notify(`Weekly report exported: ${filename}`, "success");
      console.log("Excel report generated:", filename);
    } catch (err) {
      console.error("Excel export error:", err);
      this.notify(err?.message || "Error generating Excel report.", "error");
    }
  }

  /* --------------- Sheet builders --------------- */
  buildSummarySheet(users, userEntriesMap, weekRange) {
    const rows = [
      ["Weekly Summary", `${weekRange.start} to ${weekRange.end}`],
      [""],
      ["User Name", "Date", "Check In", "Check Out", "Total Hours", "Notes"],
    ];

    users.forEach((u) => {
      const entries = userEntriesMap[u.email] || [];
      entries.forEach((e) => {
        rows.push([
          u.name || u.email,
          e.date || "",
          e.check_in ? formatTime(e.check_in) : "",
          e.check_out ? formatTime(e.check_out) : e.check_in ? "Working…" : "",
          Number(e.hours || 0),
          e.notes || "",
        ]);
      });
    });

    rows.push([""]);
    rows.push(["WEEKLY TOTALS:"]);
    rows.push(["User Name", "Total Hours"]);

    users.forEach((u) => {
      const total = (userEntriesMap[u.email] || []).reduce(
        (sum, e) => sum + Number(e.hours || 0),
        0
      );
      rows.push([u.name || u.email, Number(total).toFixed(2)]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [
      { wch: 22 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 40 },
    ];
    return ws;
  }

  buildUserSheet(user, entries) {
    const rows = [
      [user.name || user.email || "User"],
      [""],
      ["Date", "Check In", "Check Out", "Total Hours", "Notes"],
    ];

    entries.forEach((e) => {
      rows.push([
        e.date || "",
        e.check_in ? formatTime(e.check_in) : "",
        e.check_out ? formatTime(e.check_out) : e.check_in ? "Working…" : "",
        Number(e.hours || 0),
        e.notes || "",
      ]);
    });

    const totalHours = entries.reduce(
      (sum, e) => sum + Number(e.hours || 0),
      0
    );
    rows.push([""]);
    rows.push(["Total Hours", Number(totalHours).toFixed(2)]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 40 },
    ];
    return ws;
  }

  /* --------------- Data fetch --------------- */
  async fetchCurrentUser() {
    const res = await authFetch("/api/auth/me");
    if (!res.ok) throw new Error("Failed to load user");
    return res.json();
  }

  async fetchEntries(startDate, endDate) {
    const params = new URLSearchParams();
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    const res = await authFetch(`/api/time-entries?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to load entries");
    return res.json();
  }

  /* --------------- UX helper --------------- */
  notify(text, type = "success") {
    const area = document.getElementById("notification-area");
    const content = document.getElementById("notification-content");
    if (area && content) {
      content.textContent = text;
      area.className = `notification ${type}`;
      area.style.display = "block";
      setTimeout(() => (area.style.display = "none"), 3000);
      return;
    }
    console.log(text);
  }
}

/* ==============================================
   Shared helpers
   ============================================== */
async function authFetch(urlPath, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = localStorage.getItem("authToken");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  return fetch(apiUrl(urlPath), { ...options, headers });
}

function getCurrentWeekRange() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // Monday start
  const start = new Date(now);
  start.setDate(now.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: toYMD(start), end: toYMD(end) };
}

function getISOWeekNumber(date) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function toYMD(d) {
  const dd = d instanceof Date ? d : new Date(d);
  return `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(dd.getDate()).padStart(2, "0")}`;
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function safeSheetName(name) {
  const invalid = /[:\\/?*\[\]]/g;
  let out = String(name || "Sheet").replace(invalid, "");
  if (!out.trim()) out = "Sheet";
  if (out.length > 31) out = out.slice(0, 31);
  return out;
}
