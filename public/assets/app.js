const STATUS = {
  new: { label: "Ready to Start", cls: "status-new", order: 1 },
  wip: { label: "WIP", cls: "status-wip", order: 2 },
  revision: { label: "Need Fixing", cls: "status-revision", order: 3 },
  done: { label: "Done", cls: "status-done", order: 4 },
  approve: { label: "Senior Approval", cls: "status-approve", order: 5 },
};

const ROLE_LABEL = {
  finance: "Finance",
  manager: "Manager",
  teamlead: "Team lead",
  designer: "Designer",
};

const NAME_WIDTH_KEY = "lg-name-width";
const NAME_WIDTH_DEFAULT = 520;

const STATUS_BY_ROLE = {
  designer: ["wip", "done"],
  teamlead: ["new", "wip", "revision", "done"],
  manager: ["new", "wip", "revision", "done", "approve"],
  finance: ["new", "wip", "revision", "done", "approve"],
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
  return state.db.tasks.filter((t) => {
    if (q && !`${t.name} ${t.brief}`.toLowerCase().includes(q)) return false;
    if (isDesigner() && t.assigneeId !== me().id) return false;
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
    ? "Your queue only. Set WIP or Done and paste the result. You cannot send to Monday."
    : canAssign()
      ? "Assign designers. You can use Ready to Start, WIP, Need Fixing, Done — not Senior Approval."
      : canOps() && !isFinance()
        ? "Pull from Monday and send Done work as Senior Approval. Team lead assigns people."
        : "Pipeline plus finance. Invoice draft is only on this role.";
  $("sideFoot").innerHTML = isFinance()
    ? "Drive sandbox: _PORTAL_TEST<br>Live October Projects stay untouched."
    : isDesigner()
      ? "You only see your queue. Other designers’ projects stay hidden."
      : canAssign()
        ? "Open a project and pick a designer."
        : "Monday import / export are manager actions. Team lead assigns.";

  const tabs = [];
  tabs.push({ id: "board", label: isDesigner() ? "My projects" : canAssign() ? "All projects" : "Pipeline" });
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
    const hours = tasks.reduce((s, t) => s + (Number(t.hours) || 0), 0);
    const active = tasks.filter((t) => t.studioStatus === "wip" || t.studioStatus === "revision").length;
    $("kpis").innerHTML = `
      <div class="kpi"><b>${tasks.length}</b><span>assigned to me</span></div>
      <div class="kpi"><b>${active}</b><span>WIP / Need Fixing</span></div>
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
  const frozenHead =
    mode === "ops"
      ? `<div class="frozen"><div class="cell">Line</div><div class="cell"></div><div class="cell">Project</div><div class="cell">Time</div></div>`
      : `<div class="frozen"><div class="cell">Line</div><div class="cell">Project</div><div class="cell">Time</div></div>`;
  const head = `<div class="cols ${mode}">
      ${frozenHead}
      <div class="meta">
        <div class="cell">Assignee</div><div class="cell">Status</div>
        <div class="cell">Brief</div><div class="cell">Result</div>
      </div>
    </div>`;

  $("board").innerHTML = `
    <section class="group sheet" style="--name-width:${savedNameWidth()}px">
      <div class="col-splitter" title="Drag to move columns" role="separator" aria-orientation="vertical"></div>
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
          : `<div class="cell empty" style="padding:12px 16px">${
              isDesigner() ? "Nothing assigned to you yet" : "Nothing here"
            }</div>`
      }
    </section>`;

  $("board").querySelectorAll(".row").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("input,select,a,button,.col-splitter")) return;
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
  bindSplitter($("board").querySelector(".group"));
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
  const frozen =
    mode === "ops"
      ? `<div class="frozen">
          <div class="cell"><span class="pill line-${t.line}">${t.line}</span></div>
          <div class="cell"><input class="chk" data-id="${t.id}" type="checkbox" ${checked} /></div>
          <div class="cell name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</div>
          <div class="cell">${timeCell(t)}</div>
        </div>`
      : `<div class="frozen">
          <div class="cell"><span class="pill line-${t.line}">${t.line}</span></div>
          <div class="cell name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</div>
          <div class="cell">${timeCell(t)}</div>
        </div>`;
  return `
    <div class="row ${mode}${gapCls} ${checked ? "selected" : ""}" data-id="${t.id}">
      ${frozen}
      <div class="meta">
        <div class="cell">${personCell(t.assigneeId)}</div>
        <div class="cell"><span class="pill ${st.cls}">${st.label}</span></div>
        <div class="cell">${brief}</div>
        <div class="cell">${result}</div>
      </div>
    </div>`;
}

function statusChoices(task) {
  const keys = [...(STATUS_BY_ROLE[me().role] || STATUS_BY_ROLE.manager)];
  if (task?.studioStatus && !keys.includes(task.studioStatus)) keys.unshift(task.studioStatus);
  return keys;
}

function canSetStatus(next) {
  return (STATUS_BY_ROLE[me().role] || []).includes(next);
}

function savedNameWidth() {
  const n = Number(localStorage.getItem(NAME_WIDTH_KEY));
  return Number.isFinite(n) && n >= 400 ? n : NAME_WIDTH_DEFAULT;
}

function applyNameWidth(group, px) {
  if (!group) return;
  const max = Math.max(280, group.clientWidth - 300);
  const w = Math.round(Math.min(Math.max(200, px), max));
  group.style.setProperty("--name-width", `${w}px`);
  localStorage.setItem(NAME_WIDTH_KEY, String(w));
}

function bindSplitter(group) {
  const handle = group?.querySelector(":scope > .col-splitter");
  if (!handle) return;
  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = parseFloat(getComputedStyle(group).getPropertyValue("--name-width")) || NAME_WIDTH_DEFAULT;
    group.classList.add("is-resizing");
    document.body.classList.add("col-resizing");
    const onMove = (ev) => applyNameWidth(group, startW + (ev.clientX - startX));
    const onUp = () => {
      group.classList.remove("is-resizing");
      document.body.classList.remove("col-resizing");
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  });
  handle.addEventListener("dblclick", () => applyNameWidth(group, NAME_WIDTH_DEFAULT));
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

function openTask(id) {
  const t = state.db.tasks.find((x) => x.id === id);
  if (!t) return;
  state.openId = id;
  const mine = t.assigneeId === me().id;
  const canEdit = canOps() || canAssign() || mine;
  const lockedStatus = t.studioStatus === "approve" && !canOps();
  const statusOpts = statusChoices(t)
    .map((k) => {
      const selected = t.studioStatus === k ? "selected" : "";
      const disabled = k !== t.studioStatus && !canSetStatus(k) ? "disabled" : "";
      return `<option value="${k}" ${selected} ${disabled}>${STATUS[k].label}</option>`;
    })
    .join("");
  const statusHint = isDesigner()
    ? "Designer: WIP or Done. Manager sends Senior Approval to Monday."
    : canAssign()
      ? "Team lead: Ready to Start, WIP, Need Fixing, Done. No Monday send."
      : "Manager: send Done work to Senior Approval on Monday.";
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
      <select id="stStatus" ${canEdit && !lockedStatus ? "" : "disabled"}>${statusOpts}</select>
      <p class="status-hint">${statusHint}</p>
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
    if (studioStatus !== t.studioStatus && !canSetStatus(studioStatus)) {
      toast("This role cannot set " + (STATUS[studioStatus]?.label || studioStatus));
      return;
    }
    const assigneeId = $("stPerson") ? $("stPerson").value : t.assigneeId;
    const note = resultUrl && resultUrl !== t.resultUrl ? `${me().name} pasted the result` : `${me().name} updated status`;
    updateTask(t.id, { resultUrl, studioStatus, assigneeId, note, role: me().role });
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
  if (out.error || !out.state) {
    toast(out.error || "Could not save");
    return;
  }
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
