const STATUS = {
  new: { label: "New", cls: "status-new", order: 1 },
  wip: { label: "In progress", cls: "status-wip", order: 2 },
  revision: { label: "Revision", cls: "status-revision", order: 3 },
  done: { label: "Done", cls: "status-done", order: 4 },
  approve: { label: "Sent", cls: "status-approve", order: 5 },
};

const ROLE_LABEL = {
  finance: "Finance",
  manager: "Manager",
  teamlead: "Team lead",
  designer: "Designer",
};

const state = { db: null, roleId: "finance", view: "board", selected: new Set(), openId: null };
const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function person(id) {
  return (state.db.people || []).find((p) => p.id === id);
}
function me() {
  return person(state.roleId) || state.db.people[0];
}
function isFinance() {
  return me().role === "finance";
}
function isDesigner() {
  return me().role === "designer";
}
function canOps() {
  return me().role === "manager" || me().role === "finance";
}
function canAssign() {
  return me().role === "teamlead";
}
function designers() {
  return state.db.people.filter((p) => p.role === "designer");
}

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3200);
}

async function api(path, payload) {
  const res = await fetch(path, {
    method: payload ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  return res.json();
}

function visibleTasks() {
  const q = (document.querySelector(".search")?.value || "").toLowerCase();
  const mine = state.view === "mine";
  return state.db.tasks.filter((t) => {
    if (q && !`${t.name} ${t.brief}`.toLowerCase().includes(q)) return false;
    if (mine && t.assigneeId !== state.roleId) return false;
    return true;
  });
}

function renderWho() {
  $("who").innerHTML = state.db.people
    .map(
      (p) =>
        `<option value="${p.id}" ${p.id === state.roleId ? "selected" : ""}>${escapeHtml(p.name)} · ${
          ROLE_LABEL[p.role] || p.role
        }</option>`
    )
    .join("");
}

function renderChrome() {
  $("financeNav").hidden = !isFinance();
  $("roleHint").textContent = isDesigner()
    ? "Who is on what, hours, brief, and where to paste the result. No money here."
    : canAssign()
      ? "You assign designers. Monday and invoices are not your screen."
      : canOps() && !isFinance()
        ? "Pull from Monday and send finished work to the client. Team lead assigns people."
        : "Pipeline plus finance. Invoice draft is only on this role.";
  $("sideFoot").innerHTML = isFinance()
    ? "Drive sandbox: _PORTAL_TEST<br>Live October Projects stay untouched."
    : isDesigner()
      ? "Paste the result link in the project card. You do not need Monday."
      : canAssign()
        ? "Open a project and pick a designer."
        : "Monday import / export are manager actions. Team lead assigns.";

  const tabs = [];
  tabs.push({ id: "board", label: isDesigner() || canAssign() ? "All projects" : "Pipeline" });
  if (isDesigner()) tabs.push({ id: "mine", label: "Mine" });
  if (canOps()) tabs.push({ id: "ready", label: "Ready to send" });
  if (isFinance()) tabs.push({ id: "close", label: "Finance" });
  if (!tabs.some((t) => t.id === state.view)) state.view = "board";
  $("views").innerHTML = tabs
    .map(
      (t) =>
        `<button class="view-tab ${state.view === t.id ? "active" : ""}" data-view="${t.id}">${t.label}</button>`
    )
    .join("");
  $("views").querySelectorAll(".view-tab").forEach((el) => {
    el.addEventListener("click", () => {
      state.view = el.dataset.view;
      render();
    });
  });
}

function renderToolbar() {
  const n = state.selected.size;
  if (isDesigner() || canAssign()) {
    $("toolbar").innerHTML = `<input class="search" placeholder="Search project" />`;
  } else {
    $("toolbar").innerHTML = `
      <button class="btn primary" id="btnImport">Pull from Monday</button>
      <button class="btn orange" id="btnEmail">Shift email</button>
      <button class="btn" id="btnFolders" ${n ? "" : "disabled"}>Folders (${n})</button>
      <button class="btn green" id="btnExport" ${n ? "" : "disabled"}>Send to client (${n})</button>
      <input class="search" placeholder="Search project" />
      <button class="btn ghost" id="btnReset">Reset demo</button>
    `;
  }
  $("toolbar").querySelector(".search")?.addEventListener("input", render);
  $("btnImport")?.addEventListener("click", importMonday);
  $("btnEmail")?.addEventListener("click", () => $("emailModal").classList.add("show"));
  $("btnFolders")?.addEventListener("click", provision);
  $("btnExport")?.addEventListener("click", exportMonday);
  $("btnReset")?.addEventListener("click", resetDemo);
}

function renderKpis() {
  if (state.view === "close") {
    $("kpis").innerHTML = "";
    return;
  }
  const tasks = visibleTasks();
  if (isDesigner()) {
    const mine = state.db.tasks.filter((t) => t.assigneeId === me().id);
    const hours = mine.reduce((s, t) => s + (Number(t.hours) || 0), 0);
    $("kpis").innerHTML = `
      <div class="kpi"><b>${tasks.length}</b><span>projects on board</span></div>
      <div class="kpi"><b>${mine.length}</b><span>assigned to me</span></div>
      <div class="kpi"><b>${hours.toFixed(1)} h</b><span>my hours this month</span></div>
    `;
    return;
  }
  const hours = state.db.tasks.reduce((s, t) => s + (Number(t.hours) || 0), 0);
  const ready = state.db.tasks.filter((t) => t.studioStatus === "done").length;
  const money = isFinance()
    ? `<div class="kpi"><b>$${(hours * 35).toFixed(0)}</b><span>invoice draft × $35</span></div>`
    : "";
  $("kpis").innerHTML = `
    <div class="kpi"><b>${state.db.tasks.length}</b><span>projects</span></div>
    <div class="kpi"><b>${hours.toFixed(1)} h</b><span>hours in pipeline</span></div>
    <div class="kpi"><b>${ready}</b><span>Done, waiting to send</span></div>
    ${money}
  `;
}

function initials(name) {
  return (name || "?").slice(0, 1);
}
function personCell(id) {
  const p = person(id);
  if (!p) return `<span class="empty">unassigned</span>`;
  return `<span class="person"><span class="avatar" style="background:${p.color}">${initials(p.name)}</span>${escapeHtml(p.name)}</span>`;
}
function timeCell(t) {
  if (!t.shifts && !t.hours) return `<span class="empty">—</span>`;
  return `${t.shifts || "—"} / ${t.hours || "—"}h`;
}

function statusRank(t) {
  return STATUS[t.studioStatus]?.order || 99;
}

function sortedTasks(list) {
  return list.slice().sort((a, b) => {
    const d = statusRank(a) - statusRank(b);
    if (d) return d;
    return String(a.name).localeCompare(String(b.name));
  });
}

function renderBoard() {
  if (state.view === "close") {
    renderClose();
    return;
  }
  const exec = isDesigner() || canAssign();
  let tasks = visibleTasks();
  if (state.view === "ready") tasks = tasks.filter((t) => t.studioStatus === "done");
  tasks = sortedTasks(tasks);
  const mode = exec ? "exec" : "ops";
  const head = exec
    ? `<div class="cols exec"><div>Project</div><div>Assignee</div><div>Time</div><div>Brief</div><div>Result</div><div>Status</div></div>`
    : `<div class="cols ops"><div></div><div>Project</div><div>Line</div><div>Time</div><div>Assignee</div><div>Status</div><div>Brief</div><div>Result</div></div>`;

  $("board").innerHTML = `
    <section class="group">
      ${head}
      ${
        tasks.length
          ? tasks
              .map((t, i) => {
                const prev = tasks[i - 1];
                const gap = prev && prev.studioStatus !== t.studioStatus;
                return rowHtml(t, mode, gap);
              })
              .join("")
          : `<div class="cell empty" style="padding:12px 16px">Nothing here</div>`
      }
    </section>`;

  $("board").querySelectorAll(".row").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("input,select,a,button")) return;
      openTask(el.dataset.id);
    });
  });
  $("board").querySelectorAll(".chk").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      if (el.checked) state.selected.add(id);
      else state.selected.delete(id);
      renderToolbar();
    });
  });
}

function rowHtml(t, mode, gap) {
  const st = STATUS[t.studioStatus] || STATUS.new;
  const checked = state.selected.has(t.id) ? "checked" : "";
  const gapCls = gap ? " status-gap" : "";
  const brief = t.docUrl
    ? `<a class="linkish" href="${escapeHtml(t.docUrl)}" target="_blank" rel="noreferrer">Brief</a>`
    : t.brief
      ? `<span class="linkish">text</span>`
      : `<span class="empty">none</span>`;
  const result = t.resultUrl
    ? `<a class="linkish" href="${escapeHtml(t.resultUrl)}" target="_blank" rel="noreferrer">Link</a>`
    : `<span class="empty">paste</span>`;
  if (mode === "exec") {
    return `
      <div class="row exec${gapCls}" data-id="${t.id}">
        <div class="cell name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</div>
        <div class="cell">${personCell(t.assigneeId)}</div>
        <div class="cell">${timeCell(t)}</div>
        <div class="cell">${brief}</div>
        <div class="cell">${result}</div>
        <div class="cell"><span class="pill ${st.cls}">${st.label}</span></div>
      </div>`;
  }
  return `
    <div class="row ops${gapCls} ${checked ? "selected" : ""}" data-id="${t.id}">
      <div class="cell"><input class="chk" data-id="${t.id}" type="checkbox" ${checked} /></div>
      <div class="cell name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</div>
      <div class="cell"><span class="pill line-${t.line}">${t.line}</span></div>
      <div class="cell">${timeCell(t)}</div>
      <div class="cell">${personCell(t.assigneeId)}</div>
      <div class="cell"><span class="pill ${st.cls}">${st.label}</span></div>
      <div class="cell">${brief}</div>
      <div class="cell">${result}</div>
    </div>`;
}

function renderClose() {
  if (!isFinance()) {
    state.view = "board";
    render();
    return;
  }
  const byLine = { DD: 0, DX: 0, DS: 0 };
  for (const t of state.db.tasks) byLine[t.line] = (byLine[t.line] || 0) + (Number(t.hours) || 0);
  const people = {};
  for (const t of state.db.tasks) {
    if (!t.assigneeId) continue;
    const p = person(t.assigneeId);
    if (!p || p.role !== "designer") continue;
    people[t.assigneeId] = (people[t.assigneeId] || 0) + (Number(t.hours) || 0);
  }
  $("board").innerHTML = `
    <section class="group" style="padding:18px">
      <h2 style="margin:0 0 8px">Finance · October</h2>
      <p style="color:#676879">Designers and the manager do not see this. Client invoice and people hours after the 15th.</p>
      <div class="kpis" style="padding:0 0 16px">
        <div class="kpi"><b>${byLine.DD.toFixed(1)} h</b><span>DD × $35 = $${(byLine.DD * 35).toFixed(0)}</span></div>
        <div class="kpi"><b>${byLine.DX.toFixed(1)} h</b><span>DX × $35 = $${(byLine.DX * 35).toFixed(0)}</span></div>
        <div class="kpi"><b>${byLine.DS.toFixed(1)} h</b><span>DS</span></div>
      </div>
      <h3>Designer payout @ $15/h</h3>
      ${Object.entries(people)
        .map(([id, h]) => `<div style="padding:8px 0;border-bottom:1px solid #f0f1f5">${personCell(id)} — <b>${h.toFixed(1)} h</b> · $${(h * 15).toFixed(0)}</div>`)
        .join("")}
    </section>`;
}

function executorStatuses() {
  return ["new", "wip", "done", "revision"];
}

function openTask(id) {
  const t = state.db.tasks.find((x) => x.id === id);
  if (!t) return;
  state.openId = id;
  const mine = t.assigneeId === me().id;
  const canEdit = canOps() || canAssign() || mine;
  const statusOpts = (isDesigner() ? executorStatuses() : Object.keys(STATUS))
    .map((k) => `<option value="${k}" ${t.studioStatus === k ? "selected" : ""}>${STATUS[k].label}</option>`)
    .join("");
  $("drawer").innerHTML = `
    <button class="btn ghost" id="closeDrawer">Close</button>
    <h2>${escapeHtml(t.name)}</h2>
    <div class="meta">${t.line} · ${t.shifts || 0} shift / ${t.hours || 0} h · ${person(t.assigneeId)?.name || "unassigned"}</div>
    ${
      canAssign()
        ? `<div class="field"><label>Assign designer</label>
      <select id="stPerson">
        <option value="">— unassigned</option>
        ${designers()
          .map((p) => `<option value="${p.id}" ${t.assigneeId === p.id ? "selected" : ""}>${p.name}</option>`)
          .join("")}
      </select></div>`
        : `<div class="field"><label>Assignee</label><div>${personCell(t.assigneeId)}</div></div>`
    }
    <div class="field"><label>Brief</label><div class="brief">${escapeHtml(t.brief || "No brief yet")}</div>
      ${t.docUrl ? `<p><a href="${escapeHtml(t.docUrl)}" target="_blank" rel="noreferrer">Open Google Doc</a></p>` : ""}
      ${t.folderUrl ? `<p><a href="${escapeHtml(t.folderUrl)}" target="_blank" rel="noreferrer">Drive folder</a></p>` : ""}
    </div>
    <div class="field"><label>${isDesigner() ? "Paste result link here" : "Result link"}</label>
      <input id="stResult" value="${escapeHtml(t.resultUrl || "")}" placeholder="https://drive.google.com/..." ${isDesigner() && mine || canOps() ? "" : "disabled"} />
    </div>
    <div class="field"><label>Status</label>
      <select id="stStatus" ${canEdit ? "" : "disabled"}>${statusOpts}</select>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn primary" id="saveTask">Save</button>
      ${canOps() && t.resultUrl ? `<button class="btn green" id="exportOne">Send this to client</button>` : ""}
    </div>
  `;
  $("drawerBg").classList.add("show");
  $("closeDrawer").onclick = () => $("drawerBg").classList.remove("show");
  $("saveTask").onclick = () => {
    const resultUrl = $("stResult").value.trim();
    const studioStatus = $("stStatus").value;
    const assigneeId = $("stPerson") ? $("stPerson").value : t.assigneeId;
    const note = resultUrl && resultUrl !== t.resultUrl ? `${me().name} pasted the result` : `${me().name} updated status`;
    updateTask(t.id, { resultUrl, studioStatus, assigneeId, note });
  };
  $("exportOne")?.addEventListener("click", async () => {
    const out = await api("/api/export-monday", { ids: [t.id] });
    applyState(out.state);
    toast("Sent to Monday: check it please + Senior Approval");
    openTask(t.id);
  });
}

async function updateTask(id, patch) {
  const out = await api("/api/tasks/update", { id, ...patch });
  applyState(out.state);
  toast("Saved");
  if (state.openId) openTask(id);
}
async function importMonday() {
  const out = await api("/api/import-monday", {});
  applyState(out.state);
  toast(out.added ? `Pulled ${out.added} new from Monday` : "Nothing new");
}
async function provision() {
  const out = await api("/api/provision", { ids: [...state.selected] });
  applyState(out.state);
  toast("Folders marked in _PORTAL_TEST");
}
async function exportMonday() {
  const ids = [...state.selected];
  const ready = state.db.tasks.filter((t) => ids.includes(t.id) && t.resultUrl);
  if (!ready.length) {
    toast("Need a result link first. You can send 2 of 10 without waiting.");
    return;
  }
  const out = await api("/api/export-monday", { ids: ready.map((t) => t.id) });
  applyState(out.state);
  toast(`Sent to client: ${out.exported.length}`);
}
async function resetDemo() {
  const out = await api("/api/reset", {});
  applyState(out);
  toast("Demo reset");
}
function applyState(db) {
  state.db = db;
  state.selected = new Set([...state.selected].filter((id) => db.tasks.some((t) => t.id === id)));
  render();
}

function render() {
  if (!state.db) return;
  renderWho();
  renderChrome();
  renderToolbar();
  renderKpis();
  renderBoard();
}

$("who").addEventListener("change", (e) => {
  state.roleId = e.target.value;
  state.selected.clear();
  state.view = "board";
  render();
});
$("navClose").addEventListener("click", () => {
  if (!isFinance()) return;
  state.view = "close";
  render();
});
$("emailCancel").onclick = () => $("emailModal").classList.remove("show");
$("emailApply").onclick = async () => {
  const out = await api("/api/parse-email", { text: $("emailText").value });
  applyState(out.state);
  $("emailModal").classList.remove("show");
  toast(`Email: ${out.added} new, ${out.updated} shifts updated`);
};
$("drawerBg").addEventListener("click", (e) => {
  if (e.target === $("drawerBg")) $("drawerBg").classList.remove("show");
});

api("/api/state").then((db) => {
  state.db = db;
  render();
});
