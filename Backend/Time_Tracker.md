MVP: Time Tracker
Goal

Let a single user register, log in, track work sessions, view totals for today/week/month, and see recent entries. Exporting and multi-user admin are out of scope for the MVP.

Scope

Auth: register, login, get current user.
Time entries: check in, check out, add manual entry, list entries, delete entry.

Reports: summary totals for today, this week, this month.

Simple web UI: login page and dashboard with buttons and a basic list.

Data Model

User

id, name, email, password_hash, created_at, updated_at

TimeEntry

id, user_id, date (YYYY-MM-DD), check_in (ISO), check_out (ISO, nullable), hours (number), notes (text, optional), is_manual_entry (bool), created_at, updated_at

API Contract

Auth

POST /api/auth/register → { message, userId }
Body: { name, email, password }

POST /api/auth/login → { message, token, user }
Body: { email, password }

GET /api/auth/me (auth) → { id, name, email }

Time Entries

POST /api/time-entries (auth)
Body for check-in: { checkIn, date, notes? } → { message, entryId }
Body for manual: { checkIn, checkOut, date, notes?, isManualEntry: true } → { message, entryId, hours }

PUT /api/time-entries/:id (auth)
Body: { checkOut, notes? } → { message, hours }

GET /api/time-entries?startDate&endDate&limit (auth) → TimeEntry[]

DELETE /api/time-entries/:id (auth) → { message }

Reports

GET /api/reports/summary (auth) →

{
today: { hours: number },
thisWeek: { hours: number },
thisMonth: { hours: number }
}

UI Flows

Login page

Inputs: email, password

Buttons: Log In, Register

On login success: store token and user, redirect to Dashboard

On register success: show “Account created, please log in”

Dashboard

Header: Welcome {name}, buttons: Check In, Check Out, Add Entry, Log Out

KPIs: Today hours, This Week hours, This Month hours

Filters: Start date, End date, “Custom Range”, “View All”

List: recent entries with date, in, out, hours, notes, and a Delete action

Modal: Add manual entry (date, check in, check out, notes)

States

When checked in: “Check In” disabled, “Check Out” enabled

When not checked in: “Check Out” disabled, “Check In” enabled

Success Criteria

A new user can register, log in, check in, check out, and see their entry appear with computed hours.

Manual entry creates a complete record with hours.

Summary shows nonzero totals when entries exist.

Listing supports date range filters and “view all”.

Deleting an entry removes it from the list.

Runbook (local)

Start API server

Serve static frontend from the same server or via Live Server

Visit login page, create user, test check in/out, test manual entry, verify summary and list

Problems to solve (carry-over from your current project)
1. Fix fetch object spread in client requests so API calls don’t crash.
2. Align manual-entry form field IDs with the selectors the dashboard expects.
3. Wire “Custom Range” and “View All” buttons to actually filter and fetch.
4. Ensure the manual entry flow sends notes and is handled by the API.
5. Add or confirm the /api/reports/summary endpoint is present and returns today/week/month totals.
6. Clean up duplicate authFetch helpers to a single shared function.
7. Tweak minor CSS issues in header layout if spacing looks off.
8. Make the UI copy match actual features. Remove any claims about auto-export until implemented.
9. Confirm static file serving paths so / shows login and /dashboard shows the dashboard.

Nice-to-have next (future improvements)

1. Weekly and monthly CSV/XLSX export.
2. Edit existing entries (change times, notes).
3. Pagination and search in the entries list.
4. Timezone handling and locale formatting.
5. Multi-user admin view and team summaries.
6. Tags or projects per entry; project-level reporting.
7. Reminders to check out; auto check-out after N hours.
8. Password reset and email verification.
9. Role-based access and audit logs.
10. Tests for API routes and a seed script for demo data.
11. Able to use in mobile as well