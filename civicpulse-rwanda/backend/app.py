"""
CivicPulse Rwanda — backend prototype.

Run with:  python app.py
Then open: http://localhost:5000

Endpoints:
  POST   /api/complaints                 submit a new complaint (public)
  GET    /api/complaints/<ticket_id>      check status of one complaint (public)
  GET    /api/complaints                  list/filter complaints (admin only)
  PATCH  /api/complaints/<ticket_id>      update status / notes (admin only)
  GET    /api/stats                       dashboard counters (admin only)
  GET    /api/meta                        categories / districts / statuses (public)
  POST   /api/admin/login                 admin login
  POST   /api/admin/logout                admin logout
  GET    /api/admin/session               check if logged in
"""
import os
import functools
from flask import Flask, request, jsonify, session, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash

from database import (
    get_connection, init_db, next_ticket_id, now_iso,
    CATEGORY_MINISTRY_MAP, CATEGORIES, RWANDA_DISTRICTS, STATUSES,
)

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
app.secret_key = os.environ.get("CIVICPULSE_SECRET_KEY", "dev-secret-change-me-in-production")

# --- Prototype admin credentials -------------------------------------------------
# NOTE: hardcoded for the prototype only. Replace with a real user store + hashing
# per-user before this ever sees production traffic.
ADMIN_USERNAME = os.environ.get("CIVICPULSE_ADMIN_USER", "admin")
ADMIN_PASSWORD_HASH = generate_password_hash(os.environ.get("CIVICPULSE_ADMIN_PASSWORD", "CivicPulse2026!"))


def admin_required(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("is_admin"):
            return jsonify({"error": "Not authenticated"}), 401
        return fn(*args, **kwargs)
    return wrapper


# --- Static frontend --------------------------------------------------------------

@app.route("/")
def serve_index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/admin.html")
def serve_admin():
    return send_from_directory(FRONTEND_DIR, "admin.html")


@app.route("/<path:filename>")
def serve_static(filename):
    return send_from_directory(FRONTEND_DIR, filename)


# --- Meta ---------------------------------------------------------------------

@app.route("/api/meta", methods=["GET"])
def meta():
    return jsonify({
        "categories": CATEGORIES,
        "districts": RWANDA_DISTRICTS,
        "statuses": STATUSES,
    })


# --- Public complaint endpoints -------------------------------------------------

@app.route("/api/complaints", methods=["POST"])
def submit_complaint():
    data = request.get_json(silent=True) or {}

    district = (data.get("district") or "").strip()
    category = (data.get("category") or "").strip()
    description = (data.get("description") or "").strip()
    full_name = (data.get("full_name") or "").strip()
    phone = (data.get("phone") or "").strip()

    errors = {}
    if not district or district not in RWANDA_DISTRICTS:
        errors["district"] = "Please select a valid district."
    if not category or category not in CATEGORY_MINISTRY_MAP:
        errors["category"] = "Please select a valid category."
    if not description or len(description) < 10:
        errors["description"] = "Please describe the issue in at least 10 characters."
    if phone and not phone.replace("+", "").replace(" ", "").isdigit():
        errors["phone"] = "Phone number looks invalid."

    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 400

    ministry = CATEGORY_MINISTRY_MAP[category]
    ts = now_iso()

    conn = get_connection()
    try:
        ticket_id = next_ticket_id(conn)
        conn.execute(
            """
            INSERT INTO complaints
                (ticket_id, full_name, phone, district, category, ministry,
                 description, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)
            """,
            (ticket_id, full_name or None, phone or None, district, category,
             ministry, description, ts, ts),
        )
        conn.commit()
    finally:
        conn.close()

    return jsonify({
        "ticket_id": ticket_id,
        "ministry": ministry,
        "status": "Pending",
        "created_at": ts,
    }), 201


@app.route("/api/complaints/<ticket_id>", methods=["GET"])
def check_complaint(ticket_id):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT ticket_id, district, category, ministry, status, "
            "description, created_at, updated_at FROM complaints WHERE ticket_id = ?",
            (ticket_id.strip().upper(),),
        ).fetchone()
    finally:
        conn.close()

    if not row:
        return jsonify({"error": "No complaint found with that tracking ID."}), 404

    return jsonify(dict(row))


# --- Admin auth -----------------------------------------------------------------

@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if username == ADMIN_USERNAME and check_password_hash(ADMIN_PASSWORD_HASH, password):
        session["is_admin"] = True
        session.permanent = True
        return jsonify({"success": True})

    return jsonify({"error": "Invalid username or password."}), 401


@app.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    session.clear()
    return jsonify({"success": True})


@app.route("/api/admin/session", methods=["GET"])
def admin_session():
    return jsonify({"is_admin": bool(session.get("is_admin"))})


# --- Admin complaint management --------------------------------------------------

@app.route("/api/complaints", methods=["GET"])
@admin_required
def list_complaints():
    status = request.args.get("status")
    category = request.args.get("category")
    district = request.args.get("district")
    q = request.args.get("q")

    query = "SELECT * FROM complaints WHERE 1=1"
    params = []

    if status and status in STATUSES:
        query += " AND status = ?"
        params.append(status)
    if category and category in CATEGORY_MINISTRY_MAP:
        query += " AND category = ?"
        params.append(category)
    if district and district in RWANDA_DISTRICTS:
        query += " AND district = ?"
        params.append(district)
    if q:
        query += " AND (description LIKE ? OR ticket_id LIKE ? OR full_name LIKE ?)"
        like = f"%{q}%"
        params.extend([like, like, like])

    query += " ORDER BY created_at DESC"

    conn = get_connection()
    try:
        rows = conn.execute(query, params).fetchall()
    finally:
        conn.close()

    return jsonify([dict(r) for r in rows])


@app.route("/api/complaints/<ticket_id>", methods=["PATCH"])
@admin_required
def update_complaint(ticket_id):
    data = request.get_json(silent=True) or {}
    new_status = data.get("status")
    admin_notes = data.get("admin_notes")

    if new_status is not None and new_status not in STATUSES:
        return jsonify({"error": f"Status must be one of {STATUSES}"}), 400

    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM complaints WHERE ticket_id = ?", (ticket_id,)
        ).fetchone()
        if not row:
            return jsonify({"error": "Complaint not found."}), 404

        fields = []
        params = []
        if new_status is not None:
            fields.append("status = ?")
            params.append(new_status)
        if admin_notes is not None:
            fields.append("admin_notes = ?")
            params.append(admin_notes)

        if not fields:
            return jsonify({"error": "Nothing to update."}), 400

        fields.append("updated_at = ?")
        params.append(now_iso())
        params.append(ticket_id)

        conn.execute(f"UPDATE complaints SET {', '.join(fields)} WHERE ticket_id = ?", params)
        conn.commit()

        updated = conn.execute(
            "SELECT * FROM complaints WHERE ticket_id = ?", (ticket_id,)
        ).fetchone()
    finally:
        conn.close()

    return jsonify(dict(updated))


@app.route("/api/stats", methods=["GET"])
@admin_required
def stats():
    conn = get_connection()
    try:
        total = conn.execute("SELECT COUNT(*) AS c FROM complaints").fetchone()["c"]
        by_status = conn.execute(
            "SELECT status, COUNT(*) AS c FROM complaints GROUP BY status"
        ).fetchall()
        by_category = conn.execute(
            "SELECT category, COUNT(*) AS c FROM complaints GROUP BY category ORDER BY c DESC"
        ).fetchall()
        by_district = conn.execute(
            "SELECT district, COUNT(*) AS c FROM complaints GROUP BY district ORDER BY c DESC LIMIT 10"
        ).fetchall()
    finally:
        conn.close()

    return jsonify({
        "total": total,
        "by_status": {r["status"]: r["c"] for r in by_status},
        "by_category": {r["category"]: r["c"] for r in by_category},
        "by_district": {r["district"]: r["c"] for r in by_district},
    })


if __name__ == "__main__":
    init_db()
    print("CivicPulse Rwanda backend running at http://localhost:5000")
    print(f"Admin login -> username: '{ADMIN_USERNAME}'  (see backend/app.py or env vars for password)")
    app.run(host="0.0.0.0", port=5000, debug=True)
