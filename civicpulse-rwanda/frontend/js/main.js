const API = "/api";

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
    return d.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    });
  } catch (e) {
    return iso;
  }
}

async function loadMeta() {
  const res = await fetch(`${API}/meta`);
  const meta = await res.json();

  const districtSel = document.getElementById("district");
  meta.districts.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d; opt.textContent = d;
    districtSel.appendChild(opt);
  });

  const categorySel = document.getElementById("category");
  meta.categories.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = c;
    categorySel.appendChild(opt);
  });
}

function clearFieldErrors(form) {
  form.querySelectorAll(".field").forEach(f => f.classList.remove("has-error"));
}

function setupTabs() {
  const submitBtn = document.getElementById("tab-submit-btn");
  const trackBtn = document.getElementById("tab-track-btn");
  const submitPanel = document.getElementById("panel-submit");
  const trackPanel = document.getElementById("panel-track");

  function activate(which) {
    const isSubmit = which === "submit";
    submitPanel.style.display = isSubmit ? "" : "none";
    trackPanel.style.display = isSubmit ? "none" : "";
    submitBtn.style.borderBottomColor = isSubmit ? "var(--ink)" : "transparent";
    submitBtn.style.color = isSubmit ? "var(--ink)" : "var(--charcoal-soft)";
    trackBtn.style.borderBottomColor = isSubmit ? "transparent" : "var(--ink)";
    trackBtn.style.color = isSubmit ? "var(--charcoal-soft)" : "var(--ink)";
  }

  submitBtn.addEventListener("click", () => activate("submit"));
  trackBtn.addEventListener("click", () => activate("track"));
}

function renderTicket(container, data) {
  container.style.display = "";
  container.innerHTML = `
    <div class="ticket">
      <div class="ticket__top">
        <div class="ticket__eyebrow">Tracking ID &mdash; keep this to check progress</div>
        <div class="ticket__id">${data.ticket_id}</div>
      </div>
      <div class="ticket__perf"></div>
      <div class="ticket__bottom">
        <div class="ticket__row"><span>Status</span><span><span class="badge ${statusBadgeClass(data.status)}">${data.status}</span></span></div>
        <div class="ticket__row"><span>Routed to</span><span>${data.ministry}</span></div>
        <div class="ticket__row"><span>Submitted</span><span>${formatDate(data.created_at)}</span></div>
      </div>
    </div>
  `;
}

function setupComplaintForm() {
  const form = document.getElementById("complaint-form");
  const msg = document.getElementById("submit-msg");
  const resultBox = document.getElementById("ticket-result");
  const submitBtn = document.getElementById("submit-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    msg.textContent = "";
    msg.classList.remove("error-msg");

    const payload = {
      full_name: document.getElementById("full_name").value,
      phone: document.getElementById("phone").value,
      district: document.getElementById("district").value,
      category: document.getElementById("category").value,
      description: document.getElementById("description").value,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    try {
      const res = await fetch(`${API}/complaints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.fields) {
          Object.entries(data.fields).forEach(([field, text]) => {
            const wrap = document.getElementById(`field-${field}`);
            if (wrap) {
              wrap.classList.add("has-error");
              const errEl = wrap.querySelector(".error");
              if (errEl) errEl.textContent = text;
            } else if (field === "phone") {
              const phoneField = document.getElementById("phone").closest(".field");
              phoneField.classList.add("has-error");
              phoneField.querySelector(".error").textContent = text;
            }
          });
        }
        msg.textContent = data.error || "Something went wrong. Please check the form.";
        msg.classList.add("error-msg");
        return;
      }

      form.reset();
      form.style.display = "none";
      renderTicket(resultBox, data);
      resultBox.scrollIntoView({ behavior: "smooth", block: "start" });

    } catch (err) {
      msg.textContent = "Could not reach the server. Please try again.";
      msg.classList.add("error-msg");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit complaint";
    }
  });
}

function renderTrackResult(container, data) {
  container.style.display = "";
  container.innerHTML = `
    <div class="ticket">
      <div class="ticket__top">
        <div class="ticket__eyebrow">Tracking ID</div>
        <div class="ticket__id">${data.ticket_id}</div>
      </div>
      <div class="ticket__perf"></div>
      <div class="ticket__bottom">
        <div class="ticket__row"><span>Status</span><span><span class="badge ${statusBadgeClass(data.status)}">${data.status}</span></span></div>
        <div class="ticket__row"><span>Category</span><span>${data.category}</span></div>
        <div class="ticket__row"><span>District</span><span>${data.district}</span></div>
        <div class="ticket__row"><span>Routed to</span><span>${data.ministry}</span></div>
        <div class="ticket__row"><span>Submitted</span><span>${formatDate(data.created_at)}</span></div>
        <div class="ticket__row"><span>Last updated</span><span>${formatDate(data.updated_at)}</span></div>
      </div>
    </div>
  `;
}

function setupTracking() {
  const btn = document.getElementById("track-btn");
  const input = document.getElementById("track-id");
  const msg = document.getElementById("track-msg");
  const resultBox = document.getElementById("track-result");

  async function doTrack() {
    const id = input.value.trim();
    msg.textContent = "";
    msg.classList.remove("error-msg");
    resultBox.style.display = "none";

    if (!id) {
      msg.textContent = "Enter your tracking ID first.";
      msg.classList.add("error-msg");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Checking...";
    try {
      const res = await fetch(`${API}/complaints/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) {
        msg.textContent = data.error || "Complaint not found.";
        msg.classList.add("error-msg");
        return;
      }
      renderTrackResult(resultBox, data);
    } catch (err) {
      msg.textContent = "Could not reach the server. Please try again.";
      msg.classList.add("error-msg");
    } finally {
      btn.disabled = false;
      btn.textContent = "Check status";
    }
  }

  btn.addEventListener("click", doTrack);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") doTrack(); });
}

document.addEventListener("DOMContentLoaded", () => {
  loadMeta();
  setupTabs();
  setupComplaintForm();
  setupTracking();
});
