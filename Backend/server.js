/* ==============================================
   TIME TRACKER BACKEND SERVER
   Basic Express.js server with SQLite database
   ============================================== */

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("JWT_SECRET is not set. Create a .env file with JWT_SECRET.");
  process.exit(1);
}

// ==============================================
// MIDDLEWARE
// ==============================================
app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP, please try again later.",
});
app.use("/api/", limiter);

app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? "https://your-domain.com"
        : [
            "http://localhost:3000",
            "http://localhost:5500",
            "http://127.0.0.1:5500",
          ],
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(express.static(path.join(__dirname, "../Frontend")));

// ==============================================
// DATABASE
// ==============================================
const dbDir = path.join(__dirname, "database");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(__dirname, "database", "timetracker.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error("Error opening database:", err.message);
  else {
    console.log("Connected to SQLite database:", dbPath);
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS time_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      check_in DATETIME NOT NULL,
      check_out DATETIME,
      hours REAL,
      date DATE NOT NULL,
      notes TEXT,
      is_manual_entry BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  console.log("Database tables initialized");
}

// ==============================================
// AUTH MIDDLEWARE
// ==============================================
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ error: "Access token required" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
}
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use("/api/auth", authLimiter);

// ==============================================
// AUTH ROUTES
// ==============================================

// Register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ error: "All fields are required" });

    if (password.length < 6)
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });

    db.get(
      "SELECT id FROM users WHERE email = ?",
      [email],
      async (err, row) => {
        if (err) return res.status(500).json({ error: "Database error" });

        if (row) return res.status(400).json({ error: "User already exists" });

        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(
          "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
          [name, email, hashedPassword],
          function (err) {
            if (err)
              return res.status(500).json({ error: "Error creating user" });

            res.status(201).json({
              message: "User created successfully",
              userId: this.lastID,
            });
          }
        );
      }
    );
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Login
app.post("/api/auth/login", (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required" });

    db.get(
      "SELECT * FROM users WHERE email = ?",
      [email],
      async (err, user) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (!user)
          return res.status(401).json({ error: "Invalid credentials" });

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword)
          return res.status(401).json({ error: "Invalid credentials" });

        const token = jwt.sign(
          { userId: user.id, email: user.email },
          JWT_SECRET,
          { expiresIn: "7d" }
        );

        res.json({
          message: "Login successful",
          token,
          user: { id: user.id, name: user.name, email: user.email },
        });
      }
    );
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get current user
app.get("/api/auth/me", authenticateToken, (req, res) => {
  const userId = req.user.userId;
  db.get(
    "SELECT id, name, email FROM users WHERE id = ?",
    [userId],
    (err, user) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json(user);
    }
  );
});

// ==============================================
// TIME ENTRY ROUTES
// ==============================================
app.post("/api/time-entries", authenticateToken, (req, res) => {
  try {
    const { checkIn, checkOut, date, notes, isManualEntry } = req.body;
    const d = new Date(checkIn);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(d.getDate()).padStart(2, "0")}`;
    const userId = req.user.userId;

    if (!checkIn)
      return res
        .status(400)
        .json({ error: "Check-in time and date are required" });

    db.run(
      "INSERT INTO time_entries (user_id, check_in, date, notes) VALUES (?, ?, ?, ?)",
      [userId, checkIn, ymd, notes || ""],
      function (err) {
        if (err)
          return res.status(500).json({ error: "Error creating time entry" });
        res
          .status(201)
          .json({ message: "Time entry created", entryId: this.lastID });
      }
    );
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/api/time-entries/:id", authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { checkOut, notes } = req.body;
    const userId = req.user.userId;

    if (!checkOut)
      return res.status(400).json({ error: "Check-out time required" });

    // 1) Get check_in for this entry
    db.get(
      "SELECT check_in FROM time_entries WHERE id = ? AND user_id = ?",
      [id, userId],
      (err, row) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (!row) return res.status(404).json({ error: "Not found" });

        // 2) Compute hours
        const inTime = new Date(row.check_in);
        const outTime = new Date(checkOut);
        let hours = (outTime - inTime) / (1000 * 60 * 60);
        if (!isFinite(hours) || hours < 0) hours = 0;

        // 3) Update record with checkout + computed hours
        db.run(
          `UPDATE time_entries 
           SET check_out = ?, hours = ?, notes = ?, updated_at = CURRENT_TIMESTAMP 
           WHERE id = ? AND user_id = ?`,
          [checkOut, hours, notes || null, id, userId],
          function (uErr) {
            if (uErr)
              return res
                .status(500)
                .json({ error: "Error updating time entry" });
            if (this.changes === 0)
              return res.status(404).json({ error: "Not found" });
            res.json({ message: "Time entry updated successfully", hours });
          }
        );
      }
    );
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/time-entries", authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const { startDate, endDate, limit } = req.query;

    let query = "SELECT * FROM time_entries WHERE user_id = ?";
    let params = [userId];

    if (startDate) {
      query += " AND date >= ?";
      params.push(startDate);
    }
    if (endDate) {
      query += " AND date <= ?";
      params.push(endDate);
    }

    query += " ORDER BY date DESC, check_in DESC";
    if (limit) {
      query += " LIMIT ?";
      params.push(parseInt(limit));
    }

    db.all(query, params, (err, rows) => {
      if (err) return res.status(500).json({ error: "Error fetching entries" });
      res.json(rows);
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/time-entries/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  db.run(
    "DELETE FROM time_entries WHERE id = ? AND user_id = ?",
    [id, userId],
    function (err) {
      if (err) return res.status(500).json({ error: "Error deleting entry" });
      if (this.changes === 0)
        return res.status(404).json({ error: "Not found" });
      res.json({ message: "Deleted successfully" });
    }
  );
});

// ==============================================
// REPORTS
// ==============================================
app.get("/api/reports/summary", authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date().toISOString().split("T")[0];

    const toYMD = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
    const todayStr = toYMD(new Date());

    db.get(
      `SELECT COUNT(*) AS sessions_today,
          COALESCE(SUM(hours),0) AS hours_today
   FROM time_entries
   WHERE user_id = ? AND date = ?`,
      [userId, todayStr],

      (err, todayStats) => {
        if (err) return res.status(500).json({ error: "Database error" });

        const now = new Date();
        const day = (now.getDay() + 6) % 7; // Mon=0..Sun=6
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - day);
        weekStart.setHours(0, 0, 0, 0);
        const weekStartStr = toYMD(weekStart);

        console.log("Week start:", weekStartStr, "Today:", todayStr); // Add this

        db.get(
          `SELECT COUNT(DISTINCT DATE(check_in)) AS days_this_week,
          COALESCE(SUM(hours),0) AS hours_this_week
   FROM time_entries
   WHERE user_id = ? AND date >= ?`,
          [userId, weekStartStr],

          (err, weekStats) => {
            if (err) return res.status(500).json({ error: "Database error" });

            const monthStart = new Date();
            monthStart.setDate(1);
            const monthStartStr = monthStart.toISOString().split("T")[0];

            db.get(
              `SELECT COUNT(DISTINCT date) as days_this_month, COALESCE(SUM(hours), 0) as hours_this_month
               FROM time_entries WHERE user_id = ? AND date >= ?
`,
              [userId, monthStartStr],
              (err, monthStats) => {
                if (err)
                  return res.status(500).json({ error: "Database error" });

                res.json({
                  today: {
                    sessions: todayStats.sessions_today,
                    hours: todayStats.hours_today,
                  },
                  thisWeek: {
                    days: weekStats.days_this_week,
                    hours: weekStats.hours_this_week,
                  },
                  thisMonth: {
                    days: monthStats.days_this_month,
                    hours: monthStats.hours_this_month,
                  },
                });
              }
            );
          }
        );
      }
    );
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==============================================
// STATIC FILES
// ==============================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../Frontend/login.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "../Frontend/index.html"));
});

// ==============================================
// ERROR HANDLING
// ==============================================
app.use("/api/*", (req, res) => {
  res.status(404).json({ error: "API route not found" });
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "../Frontend/login.html"));
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ==============================================
// SERVER START
// ==============================================
process.on("SIGINT", () => {
  console.log("\nShutting down gracefully...");
  db.close(() => process.exit(0));
});

app.get("/healthz", (_req, res) => res.status(200).json({ ok: true }));

app.use(express.static(path.join(__dirname, "../Frontend")));

app.get("/", (_req, res) =>
  res.sendFile(path.join(__dirname, "../Frontend/login.html"))
);

app.get("/dashboard", (_req, res) =>
  res.sendFile(path.join(__dirname, "../Frontend/index.html"))
);

app.get("/api", (_req, res) => res.redirect("/login.html"));

app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📱 Frontend: http://localhost:${PORT}`);
  console.log(`🔗 API: http://localhost:${PORT}/api`);
});
