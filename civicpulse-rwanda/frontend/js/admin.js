const API = "/api";
let META = { categories: [], districts: [], statuses: [] };

function statusBadgeClass(status) {
  switch (status) {
    case "Pending": return "badge--pending";
    case "In Progress": return "badge--progress";
    case "Resolved": return "badge--resolved";
    case "Rejected": return "badge--rejected";
    default: return "badge--pending";
  }
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch (e) { return iso; }
}

function showLogin() {
  document.getElementById("login-view").style.display = "";
  document.getElementById("dashboard-view").style.display = "none";
  document.getElementById("logout-link").style.display = "none";
}

function showDashboard() {
  document.getElementById("login-view").style.display = "none";
  document.getElementById("dashboard-view").style.display = "";
  document.getElementById("logout-link").style.display = "";
  initDashboard();
}

async function checkSession() {
  const res = await fetch(`${API}/admin/session`);
  const data = await res.json();
  if (data.is_admin) showDashboard(); else showLogin();
}

function setupLogin() {
  const form = document.getElementById("login-form");
  const msg = document.getElementById("login-msg");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "";
    msg.classList.remove("error-msg");
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    const res = await fetch(`${API}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      msg.textContent = data.error || "Sign in failed.";
      msg.classList.add("error-msg");
      return;
    }
    showDashboard();
  });

  document.getElementById("logout-link").addEventListener("click", async (e) => {
    e.preventDefault();
    await fetch(`${API}/admin/logout`, { method: "POST" });
    showLogin();
  });
}

let dashboardInitialized = false;

async function initDashboard() {
  if (dashboardInitialized) {
    await refreshStats();
    await refreshTable();
    return;
  }
  dashboardInitialized = true;

  const metaRes = await fetch(`${API}/meta`);
  META = await metaRes.json();

  const statusSel = document.getElementById("filter-status");
  META.statuses.forEach(s => {
    const opt = document.createElement("option"); opt.value = s; opt.textContent = s;
    statusSel.appendChild(opt);
  });
  const categorySel = document.getElementById("filter-category");
  META.categories.forEach(c => {
    const opt = document.createElement("option"); opt.value = c; opt.textContent = c;
    categorySel.appendChild(opt);
  });
  const districtSel = document.getElementById("filter-district");
  META.districts.forEach(d => {
    const opt = document.createElement("option"); opt.value = d; opt.textContent = d;
    districtSel.appendChild(opt);
  });

  ["filter-status", "filter-category", "filter-district"].forEach(id => {
    document.getElementById(id).addEventListener("change", refreshTable);
  });
  let searchTimer;
  document.getElementById("filter-q").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refreshTable, 300);
  });
  document.getElementById("filter-clear").addEventListener("click", () => {
    document.getElementById("filter-status").value = "";
    document.getElementById("filter-category").value = "";
    document.getElementById("filter-district").value = "";
    document.getElementById("filter-q").value = "";
    refreshTable();
  });

  await refreshStats();
  await refreshTable();
}

async function refreshStats() {
  const res = await fetch(`${API}/stats`);
  const data = await res.json();
  const grid = document.getElementById("stat-grid");

  const pending = data.by_status["Pending"] || 0;
  const inProgress = data.by_status["In Progress"] || 0;
  const resolved = data.by_status["Resolved"] || 0;

  grid.innerHTML = `
    <div class="stat-card"><div class="num">${data.total}</div><div class="label">Total complaints</div></div>
    <div class="stat-card"><div class="num">${pending}</div><div class="label">Pending</div></div>
    <div class="stat-card"><div class="num">${inProgress}</div><div class="label">In progress</div></div>
    <div class="stat-card"><div class="num">${resolved}</div><div class="label">Resolved</div></div>
  `;
}

function buildQuery() {
  const params = new URLSearchParams();
  const status = document.getElementById("filter-status").value;
  const category = document.getElementById("filter-category").value;
  const district = document.getElementById("filter-district").value;
  const q = document.getElementById("filter-q").value;
  if (status) params.set("status", status);
  if (category) params.set("category", category);
  if (district) params.set("district", district);
  if (q) params.set("q", q);
  return params.toString();
}

async function refreshTable() {
  const query = buildQuery();
  const res = await fetch(`${API}/complaints${query ? "?" + query : ""}`);
  const rows = await res.json();
  const wrap = document.getElementById("table-wrap");

  if (!Array.isArray(rows) || rows.length === 0) {
    wrap.innerHTML = `<div class="empty-state">No complaints match these filters.</div>`;
    return;
  }

  const statusOptions = META.statuses.map(s => `<option value="${s}">${s}</option>`).join("");

  const bodyRows = rows.map(r => `
    <tr data-id="${r.ticket_id}">
      <td class="ticket-id">${r.ticket_id}</td>
      <td>${r.full_name || "<span style=\"color:var(--charcoal-soft)\">Anonymous</span>"}</td>
      <td>${r.district}</td>
      <td>${r.category}<br><span style="color:var(--charcoal-soft); font-size:12px;">${r.ministry}</span></td>
      <td style="max-width:260px;">${escapeHtml(r.description)}</td>
      <td>${formatDate(r.created_at)}</td>
      <td>
        <select class="status-select">${statusOptions}</select>
      </td>
    </tr>
  `).join("");

  wrap.innerHTML = `
    <table class="registry">
      <thead>
        <tr>
          <th>Ticket</th><th>Citizen</th><th>District</th><th>Category / ministry</th>
          <th>Description</th><th>Submitted</th><th>Status</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;

  rows.forEach(r => {
    const sel = wrap.querySelector(`tr[data-id="${r.ticket_id}"] .status-select`);
    sel.value = r.status;
    sel.addEventListener("change", async () => {
      const newStatus = sel.value;
      sel.disabled = true;
      try {
        const res = await fetch(`${API}/complaints/${encodeURIComponent(r.ticket_id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (res.ok) {
          await refreshStats();
        }
      } finally {
        sel.disabled = false;
      }
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", () => {
  setupLogin();
  checkSession();
});
