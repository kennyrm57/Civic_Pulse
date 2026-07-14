# CivicPulse Rwanda — working prototype

A citizen feedback and accountability platform. Citizens submit complaints about
government services, get a tracking ID, and follow progress. Admins (ministry staff)
review, filter, and update the status of every complaint from a registry dashboard.

This prototype covers: **web complaint submission + admin dashboard**, with
complaints automatically routed to the responsible ministry based on category.

## What's inside

```
civicpulse-rwanda/
├── backend/
│   ├── app.py             Flask app — all API routes + serves the frontend
│   ├── database.py        SQLite setup, category→ministry routing, districts list
│   ├── requirements.txt   Python dependencies
│   └── civicpulse.db      created automatically on first run (SQLite file)
├── frontend/
│   ├── index.html         Citizen portal: submit a complaint / track a complaint
│   ├── admin.html         Admin login + complaint registry dashboard
│   ├── css/style.css      Shared styling
│   └── js/
│       ├── main.js        Citizen portal logic
│       └── admin.js       Admin dashboard logic
└── README.md
```

## How to run it

**Requirements:** Python 3.9+

```bash
cd civicpulse-rwanda/backend
pip install -r requirements.txt
python app.py
```

Then open **http://localhost:5000** in your browser.

- Citizen portal: http://localhost:5000/
- Admin console: http://localhost:5000/admin.html

The database (`civicpulse.db`) is created automatically the first time you run the
app — no setup needed. Delete that file at any time to reset all data.

## Admin login (prototype credentials)

```
username: admin
password: CivicPulse2026!
```

These are hardcoded in `backend/app.py` for the prototype (see the
`CIVICPULSE_ADMIN_USER` / `CIVICPULSE_ADMIN_PASSWORD` environment variables if you
want to change them without editing code). Replace with a real user store before
any real deployment.

## How it works

1. A citizen opens the portal, picks their **district** and a **category**
   (Water & Sanitation, Roads & Infrastructure, Health, Education, Security,
   Electricity, Land & Housing, Local Governance, Other), and describes the issue.
2. On submit, the system assigns a tracking ID (e.g. `CP-2026-00001`) and
   automatically routes the complaint to the ministry responsible for that
   category — see the mapping in `backend/database.py`.
3. The citizen can return anytime and check status with their tracking ID —
   no account required.
4. Ministry admins sign in to the dashboard to see every complaint, filter by
   status/category/district, search, and move complaints through
   Pending → In Progress → Resolved (or Rejected).

## What's deliberately left out of this prototype

This build covers the web flow only, per the current scope. Not included yet,
but designed for in the original CivicPulse architecture:
- USSD/SMS channel for feature-phone access
- AI-assisted complaint triage (routing here is rule-based by category, not AI)
- Kinyarwanda/English bilingual UI
- Irembo, NIDA, and mobile money (MTN/Airtel) integrations
- Multi-user/role-based admin accounts (currently one shared admin login)

Happy to build any of these out next — just say which one.

## Notes on moving this beyond a prototype

- Swap the Flask dev server for a production WSGI server (gunicorn/uwsgi) behind
  a reverse proxy.
- Move admin credentials out of code and into a real user table with per-user
  hashed passwords.
- Consider PostgreSQL over SQLite once you have concurrent write traffic.
- Add HTTPS, rate limiting on the public submission endpoint, and CAPTCHA to
  reduce spam complaints.
