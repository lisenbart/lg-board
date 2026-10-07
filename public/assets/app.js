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
const TEAM_JOBS = [
  { id: "designer", label: "Designer" },
  { id: "teamlead", label: "Team lead" },
  { id: "manager", label: "Manager" },
  { id: "finance", label: "Finance" },
];

const NAME_WIDTH_KEY = "lg-name-width";
const NAME_WIDTH_DEFAULT = 520;

const STATUS_BY_ROLE = {
  designer: ["wip", "done"],
  teamlead: ["new", "wip", "revision", "done"],
  manager: ["new", "wip", "revision", "done", "approve"],
  finance: ["new", "wip", "revision", "done", "approve"],
};

const MONTH_KEY = "lg-month";
const SESSION_KEY = "lg-session";

const ACCOUNTS = [
  {
    email: "dmytro@lisenbart.games",
    name: "Dmytro",
    blurb: "You see everything, including Finance.",
    lockRole: "finance",
  },
  {
    email: "anastasiia@lisenbart.games",
    name: "Anastasiia",
    blurb: "Manager desk. Everything except Finance.",
    lockRole: "manager",
  },
  {
    email: "lisenbart.games@gmail.com",
    name: "Designers · Drive",
    blurb: "Shared studio mailbox. Pick team lead or a designer.",
    lockRole: null,
  },
];

const state = {
  db: null,
  roleId: "manager",
  view: "board",
  selected: new Set(),
  openId: null,
  designerFilter: null,
  month: "2026-10",
  teamDrafts: {},
  session: null,
};
const $ = (id) => document.getElementById(id);

function isLocalHost() {
  return location.hostname === "localhost" || location.hostname === "127.0.0.1";
}
function isStudioHost() {
  return isLocalHost();
}
function isClientPreview() {
  return !isStudioHost();
}
function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeSession(session) {
  state.session = session;
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}
function accountByEmail(email) {
  return ACCOUNTS.find((a) => a.email === email);
}
function seatPeople(account) {
  const people = state.db?.people || [];
  if (!account) return [];
  if (account.lockRole) return people.filter((p) => p.role === account.lockRole);
  return people.filter((p) => p.role === "teamlead" || p.role === "designer");
}
function applySession(session) {
  const account = accountByEmail(session?.email);
  const seats = seatPeople(account);
  if (!account || !seats.length) {
    writeSession(null);
    return false;
  }
  const seat = seats.find((p) => p.id === session.seatId) || seats[0];
  state.session = { email: account.email, seatId: seat.id };
  state.roleId = seat.id;
  writeSession(state.session);
  return true;
}
function enterStudio() {
  document.documentElement.classList.add("in-app");
  $("loginGate").hidden = true;
}
function showLogin(accountEmail) {
  document.documentElement.classList.remove("in-app");
  const gate = $("loginGate");
  gate.hidden = false;
  const box = $("loginAccounts");
  const picked = accountByEmail(accountEmail);
  if (picked && !picked.lockRole) {
    box.innerHTML =
      `<button type="button" class="btn ghost login-back" id="loginBack">Back</button>` +
      seatPeople(picked)
        .map(
          (p) =>
            `<button type="button" class="login-seat" data-seat="${p.id}">
              <strong>${escapeHtml(p.name)}</strong>
              <span>${escapeHtml(ROLE_LABEL[p.role] || p.role)}</span>
            </button>`
        )
        .join("");
    $("loginBack")?.addEventListener("click", () => showLogin());
    box.querySelectorAll(".login-seat").forEach((el) => {
      el.addEventListener("click", () => {
        if (!applySession({ email: picked.email, seatId: el.dataset.seat })) return;
        enterStudio();
        render();
      });
    });
    return;
  }
  box.innerHTML = ACCOUNTS.map(
    (a) =>
      `<button type="button" class="login-acc" data-email="${escapeHtml(a.email)}">
        <strong>${escapeHtml(a.name)}</strong>
        <span>${escapeHtml(a.email)}</span>
        <small>${escapeHtml(a.blurb)}</small>
      </button>`
  ).join("");
  box.querySelectorAll(".login-acc").forEach((el) => {
    el.addEventListener("click", () => {
      const account = accountByEmail(el.dataset.email);
      if (!account) return;
      if (!account.lockRole) {
        showLogin(account.email);
        return;
      }
      const seat = seatPeople(account)[0];
      if (!applySession({ email: account.email, seatId: seat?.id })) return;
      enterStudio();
      render();
    });
  });
}
function visiblePeople() {
  const people = state.db?.people || [];
  if (isClientPreview()) return people.filter((p) => p.role !== "finance");
  return people;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function copyText(text) {
  const value = String(text || "");
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function showPaste(title, intro, text) {
  $("pasteTitle").textContent = title;
  $("pasteIntro").textContent = intro;
  $("pasteText").value = text;
  $("pasteModal").classList.add("show");
}

function mondayReply(task) {
  return `${task.name}\ncheck it please\n${task.resultUrl || ""}`.trim();
}

function telegramLine(task) {
  const who = person(task.assigneeId)?.name || "unassigned";
  return `${who}\n${task.name}`;
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function monthCsv() {
  const header = ["Project", "Line", "Shifts", "Hours", "Status", "Assignee", "Brief", "Result"];
  const rows = [header.map(csvCell).join(",")];
  for (const t of monthTasks()) {
    rows.push(
      [
        t.name,
        t.line,
        t.shifts ?? "",
        t.hours ?? "",
        STATUS[t.studioStatus]?.label || t.studioStatus,
        person(t.assigneeId)?.name || "",
        t.brief || "",
        t.resultUrl || "",
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return rows.join("\n");
}

function downloadMonthCsv() {
  const blob = new Blob([monthCsv()], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `SP_MGX_${state.month}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("CSV downloaded — open in Excel like SP_MGX_check");
}

function person(id) {
  return (state.db.people || []).find((p) => p.id === id);
}
function me() {
  return person(state.roleId) || visiblePeople()[0] || state.db.people[0];
}
function isFinance() {
  if (isClientPreview()) return false;
  return me().role === "finance";
}
function isDesigner() {
  return me().role === "designer";
}
function isTeamLead() {
  return me().role === "teamlead";
}
function canOps() {
  return me().role === "manager" || me().role === "finance";
}
function canEditTime() {
  return canOps();
}
function shiftHours() {
  return Number(state.db?.meta?.shiftHours) || 9;
}
function hoursFromShifts(shifts) {
  return Math.round(Number(shifts) * shiftHours() * 10) / 10;
}
function parseShifts(raw) {
  const n = Number(String(raw ?? "").trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1000) / 1000;
}
function canAssign() {
  return me().role === "teamlead" || me().role === "manager" || me().role === "finance";
}
function isExecView() {
  return isDesigner() || isTeamLead();
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
  if (window.__lgUseLocal && typeof window.LGLocalApi === "function") {
    return window.LGLocalApi(path, payload);
  }
  try {
    const res = await fetch(path, {
      method: payload ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !type.includes("json")) throw new Error("no api");
    return res.json();
  } catch (err) {
    if (typeof window.LGLocalApi !== "function") throw err;
    window.__lgUseLocal = true;
    return window.LGLocalApi(path, payload);
  }
}

function calendarMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}
function driveMonthFolder(ym) {
  const [y, m] = ym.split("-").map(Number);
  const name = new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long" });
  return `${String(m).padStart(2, "0")}_${name}`;
}
function taskMonth(t) {
  return t.month || (t.deadline && String(t.deadline).slice(0, 7)) || state.db?.meta?.month || state.month;
}
function monthTasks() {
  return state.db.tasks.filter((t) => taskMonth(t) === state.month);
}
function visibleTasks() {
  const q = (document.querySelector(".search")?.value || "").toLowerCase();
  return monthTasks().filter((t) => {
    if (q && !`${t.name} ${t.brief}`.toLowerCase().includes(q)) return false;
    if (isDesigner() && t.assigneeId !== me().id) return false;
    if (!isDesigner() && state.designerFilter) {
      if (state.designerFilter === "unassigned") {
        if (t.assigneeId) return false;
      } else if (t.assigneeId !== state.designerFilter) return false;
    }
    return true;
  });
}

function renderWho() {
  const mail = $("whoMail");
  const sel = $("who");
  const out = $("signOut");
  if (isClientPreview()) {
    mail.hidden = true;
    mail.textContent = "";
    out.hidden = true;
    sel.hidden = false;
    sel.innerHTML = visiblePeople()
      .map(
        (p) =>
          `<option value="${p.id}" ${p.id === state.roleId ? "selected" : ""}>${escapeHtml(p.name)} · ${
            ROLE_LABEL[p.role] || p.role
          }</option>`
      )
      .join("");
    return;
  }
  const account = accountByEmail(state.session?.email);
  mail.hidden = false;
  mail.textContent = account?.email || "";
  out.hidden = false;
  const seats = seatPeople(account);
  if (seats.length <= 1) {
    sel.hidden = true;
    sel.innerHTML = "";
    return;
  }
  sel.hidden = false;
  sel.innerHTML = seats
    .map(
      (p) =>
        `<option value="${p.id}" ${p.id === state.roleId ? "selected" : ""}>${escapeHtml(p.name)} · ${
          ROLE_LABEL[p.role] || p.role
        }</option>`
    )
    .join("");
}

function renderMonth() {
  const here = state.month === calendarMonth();
  $("monthLabel").textContent = monthLabel(state.month);
  $("monthMeta").textContent = here
    ? `This month · Drive ${driveMonthFolder(state.month)}`
    : `Drive ${driveMonthFolder(state.month)}`;
  $("monthLabel").parentElement.classList.toggle("this-month", here);
  const nav = $("navClose");
  if (nav) nav.textContent = monthLabel(state.month);
}

function setMonth(ym) {
  state.month = ym;
  state.selected.clear();
  state.designerFilter = null;
  localStorage.setItem(MONTH_KEY, ym);
  render();
}

function renderChrome() {
  $("financeNav").hidden = !isFinance();
  renderMonth();
  $("roleHint").textContent = isDesigner()
    ? "Your queue. Set WIP or Done and paste the result. Excel is the overall picture — read only."
    : isTeamLead()
      ? "Your work plus every designer. Assign people. Ready to Start, WIP, Need Fixing, Done — not Senior Approval."
      : canOps() && !isFinance()
        ? "Full pipeline except Finance. Pull from Monday, assign, send Done work as Senior Approval."
        : "Everything, including Finance. Invoice draft is only on this seat.";
  $("sideFoot").innerHTML = isFinance()
    ? "Drive sandbox: _PORTAL_TEST<br>Live October Projects stay untouched."
    : isDesigner()
      ? "Your queue is private. Excel shows the whole month, without money."
      : isTeamLead()
        ? "Open a project and pick a designer. Monday send stays with the manager."
        : "Monday import / export are manager actions. Finance stays with Dmytro.";

  const tabs = [];
  tabs.push({
    id: "board",
    label: isDesigner() ? "My projects" : isTeamLead() ? "All projects" : "Pipeline",
  });
  tabs.push({ id: "excel", label: "Excel" });
  if (canOps()) tabs.push({ id: "ready", label: "Ready to send" });
  if (isFinance()) {
    tabs.push({ id: "close", label: "Finance" });
    tabs.push({ id: "team", label: "Team" });
  }
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
  if (state.view === "close" || state.view === "team") {
    $("toolbar").innerHTML = "";
    return;
  }
  if (state.view === "excel") {
    $("toolbar").innerHTML = isDesigner()
      ? `<input class="search" placeholder="Search project" />`
      : `
      <button class="btn primary" id="btnExcelPull">Pull from Excel</button>
      <button class="btn" id="btnExcelOpen">Open xlsx</button>
      <button class="btn green" id="btnExcelSave">Save Excel</button>
      <input class="search" placeholder="Search project" />
    `;
    $("toolbar").querySelector(".search")?.addEventListener("input", render);
    $("btnExcelPull")?.addEventListener("click", pullExcel);
    $("btnExcelOpen")?.addEventListener("click", () => $("excelFile")?.click());
    $("btnExcelSave")?.addEventListener("click", saveExcel);
    return;
  }
  const n = state.selected.size;
  if (isExecView()) {
    $("toolbar").innerHTML = `<input class="search" placeholder="Search project" />`;
  } else {
    $("toolbar").innerHTML = `
      <button class="btn primary" id="btnImport">Pull from Monday</button>
      <button class="btn orange" id="btnEmail">Shift email</button>
      <button class="btn" id="btnFolders" ${n ? "" : "disabled"}>Folders (${n})</button>
      <button class="btn green" id="btnExport" ${n ? "" : "disabled"}>Send to client (${n})</button>
      <button class="btn ghost" id="btnCsv">Excel CSV</button>
      <input class="search" placeholder="Search project" />
      <button class="btn ghost" id="btnReset">Reset demo</button>
    `;
  }
  $("toolbar").querySelector(".search")?.addEventListener("input", render);
  $("btnImport")?.addEventListener("click", importMonday);
  $("btnEmail")?.addEventListener("click", () => $("emailModal").classList.add("show"));
  $("btnFolders")?.addEventListener("click", provision);
  $("btnExport")?.addEventListener("click", exportMonday);
  $("btnCsv")?.addEventListener("click", downloadMonthCsv);
  $("btnReset")?.addEventListener("click", resetDemo);
}

function renderKpis() {
  if (state.view === "close" || state.view === "team") {
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
  const month = monthTasks();
  const hours = month.reduce((s, t) => s + (Number(t.hours) || 0), 0);
  const ready = month.filter((t) => t.studioStatus === "done").length;
  const clientRate = Number(state.db?.meta?.clientRateUsd);
  const money =
    isFinance() && clientRate
      ? `<div class="kpi"><b>$${(hours * clientRate).toFixed(0)}</b><span>invoice draft × $${clientRate}</span></div>`
      : "";
  $("kpis").innerHTML = `
    <div class="kpi"><b>${month.length}</b><span>projects · ${monthLabel(state.month)}</span></div>
    <div class="kpi"><b>${hours.toFixed(1)} h</b><span>hours in ${monthLabel(state.month)}</span></div>
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
  const hours = t.hours || hoursFromShifts(t.shifts || 0);
  if (canEditTime()) {
    return `<span class="time-edit">
      <input class="shift-in" data-id="${t.id}" type="number" min="0" step="0.1" value="${t.shifts ?? ""}" title="Shifts · hours = shifts × ${shiftHours()}" />
      <small>${hours ? hours + "h" : "—"}</small>
    </span>`;
  }
  if (!t.shifts && !t.hours) return `<span class="empty">—</span>`;
  return `${t.shifts || "—"} / ${hours || "—"}h`;
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

function loadTone(hours, fair) {
  if (!hours) return "empty";
  if (!fair) return "even";
  if (hours < fair * 0.7) return "light";
  if (hours > fair * 1.3) return "heavy";
  return "even";
}

function renderLoad() {
  const box = $("load");
  if (!box) return;
  if (isDesigner() || state.view === "close" || state.view === "team" || state.view === "excel") {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  const people = designers();
  const tasks = monthTasks();
  const rows = people.map((p) => {
    const mine = tasks.filter((t) => t.assigneeId === p.id);
    const hours = mine.reduce((s, t) => s + (Number(t.hours) || 0), 0);
    return { person: p, mine, count: mine.length, hours };
  });
  const unassigned = tasks.filter((t) => !t.assigneeId);
  const unHours = unassigned.reduce((s, t) => s + (Number(t.hours) || 0), 0);
  const assignedHours = rows.reduce((s, r) => s + r.hours, 0);
  const fair = people.length ? assignedHours / people.length : 0;
  const maxH = Math.max(fair, ...rows.map((r) => r.hours), 0.1);
  const cards = rows
    .map((r) => {
      const tone = loadTone(r.hours, fair);
      const on = state.designerFilter === r.person.id ? " on" : "";
      const ticks = r.mine.length
        ? r.mine.map((t) => `<i class="tick line-${t.line}" title="${escapeHtml(t.name)}"></i>`).join("")
        : `<i class="tick none"></i>`;
      const pct = Math.round((r.hours / maxH) * 100);
      const fairPct = Math.round((fair / maxH) * 100);
      return `<button type="button" class="load-card ${tone}${on}" data-filter="${r.person.id}">
        <div class="load-top">${personCell(r.person.id)}<span class="load-tag">${tone}</span></div>
        <div class="load-nums"><b>${r.count}</b> projects · <b>${r.hours.toFixed(1)} h</b></div>
        <div class="ticks">${ticks}</div>
        <div class="load-bar"><span class="load-fill" style="width:${pct}%"></span><span class="load-fair" style="left:${fairPct}%"></span></div>
      </button>`;
    })
    .join("");
  const unOn = state.designerFilter === "unassigned" ? " on" : "";
  box.innerHTML = `
    <div class="load-head">
      <strong>Designer load</strong>
      <span>Cells = projects (like Excel). Bar vs even split ${fair.toFixed(1)} h. Click to filter.</span>
    </div>
    <div class="load-row">
      ${cards}
      <button type="button" class="load-card unassigned${unOn}" data-filter="unassigned">
        <div class="load-top"><span class="person"><span class="avatar" style="background:#c5c7d0">?</span>Unassigned</span><span class="load-tag">open</span></div>
        <div class="load-nums"><b>${unassigned.length}</b> projects · <b>${unHours.toFixed(1)} h</b></div>
        <div class="ticks">${unassigned.map((t) => `<i class="tick line-${t.line}" title="${escapeHtml(t.name)}"></i>`).join("") || `<i class="tick none"></i>`}</div>
      </button>
    </div>`;
  box.querySelectorAll(".load-card").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.filter;
      state.designerFilter = state.designerFilter === id ? null : id;
      render();
    });
  });
}

function projectShort(name) {
  const parts = String(name || "")
    .split(/[_|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const skip = (p) =>
    /^(DD|DX|DS)[-]/i.test(p) ||
    /^(EN|JA|IT|DE|FR|UA|LOC|HC|MGX|Comp|Resize)$/i.test(p) ||
    /^\d+s$/i.test(p) ||
    /SettAI/i.test(p);
  const nice = parts.filter((p) => !skip(p) && /[A-Za-z]{3,}/.test(p));
  return nice[0] || parts[1] || String(name).slice(0, 28);
}

function excelDate(value) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}`;
  return value || "";
}

function fmtHours(n) {
  if (n === "" || n == null || Number.isNaN(Number(n))) return "";
  return Number(n).toFixed(1).replace(".", ",");
}

function renderExcelSheet() {
  const people = designers();
  const q = (document.querySelector(".search")?.value || "").toLowerCase();
  const tasks = monthTasks()
    .filter((t) => !q || `${t.name} ${t.brief}`.toLowerCase().includes(q))
    .slice()
    .sort((a, b) => String(a.line).localeCompare(String(b.line)) || String(a.name).localeCompare(String(b.name)));
  const hoursOf = (personId) =>
    tasks
      .filter((t) => t.assigneeId === personId)
      .reduce((s, t) => s + (Number(t.hours) || 0), 0);
  const allHours = tasks.reduce((s, t) => s + (Number(t.hours) || 0), 0);
  const allShifts = tasks.reduce((s, t) => s + (Number(t.shifts) || 0), 0);
  const nameHeads = people.map((p) => `<th class="xl-person">${escapeHtml(p.name)}</th>`).join("");
  const emplHeads = people.map((_, i) => `<th>EMPL ${i + 1}</th>`).join("");
  const canMove = !isDesigner() && (canAssign() || canOps());

  const rowHtml = (t) => {
    const cells = people
      .map((p) => {
        const mine = t.assigneeId === p.id;
        const h = mine ? fmtHours(t.hours) : "";
        const cls = mine ? "xl-fill" : canMove ? "xl-hit" : "";
        const style = mine ? `style="background:${p.color}"` : "";
        return `<td class="${cls}" data-assign="${p.id}" ${style}>${h}</td>`;
      })
      .join("");
    return `<tr class="xl-row" data-id="${t.id}">
      <td class="xl-gutter line-${t.line}"></td>
      <td class="xl-name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</td>
      <td class="xl-num">${t.shifts ?? ""}</td>
      <td class="xl-num">${fmtHours(t.hours)}</td>
      <td class="xl-num">${escapeHtml(excelDate(t.deadline))}</td>
      ${cells}
    </tr>`;
  };

  const section = (line) => {
    const rows = tasks.filter((t) => t.line === line);
    const empl = people.map((_, i) => `<th>EMPL ${i + 1}</th>`).join("");
    return `<tbody>
      <tr class="xl-sec">
        <th>${line}</th><th>MGX</th><th>SHIFTS</th><th>HOURS</th><th>DEADLINE</th>${empl}
      </tr>
      ${rows.map(rowHtml).join("")}
    </tbody>`;
  };

  const totals = people.map((p) => `<td class="xl-num"><b>${fmtHours(hoursOf(p.id))}</b></td>`).join("");

  $("board").innerHTML = `
    <section class="xl-wrap">
      <div class="xl-caption">
        <strong>${monthLabel(state.month)} · SP_MGX_check</strong>
        <span>${
          isDesigner()
            ? "Overall picture this month. Hours only — you cannot assign or save the file."
            : "Mirror of the Excel load sheet. Pull reads the file, Save writes it. Click an empty hours cell to assign."
        }</span>
      </div>
      <div class="xl-scroll">
        <table class="xl-table">
          <thead>
            <tr>
              <th></th>
              <th class="xl-proj-h">${state.month.slice(0, 4)} PROJECT NAME</th>
              <th></th><th></th><th></th>
              ${nameHeads}
            </tr>
            <tr class="xl-sec">
              <th></th><th>MGX</th><th>SHIFTS</th><th>HOURS</th><th>DEADLINE</th>${emplHeads}
            </tr>
          </thead>
          ${section("DX")}
          ${section("DD")}
          ${tasks.some((t) => t.line === "DS") ? section("DS") : ""}
          <tfoot>
            <tr>
              <td></td>
              <td>total</td>
              <td class="xl-num"><b>${fmtHours(allShifts)}</b></td>
              <td class="xl-num"><b>${fmtHours(allHours)}</b></td>
              <td></td>
              ${totals}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>`;

  $("board").querySelectorAll(".xl-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      const cell = e.target.closest("td[data-assign]");
      const t = state.db.tasks.find((x) => x.id === row.dataset.id);
      if (!t) return;
      if (cell && canMove) {
        e.preventDefault();
        const assigneeId = cell.dataset.assign === t.assigneeId ? "" : cell.dataset.assign;
        updateTask(t.id, {
          assigneeId,
          role: me().role,
          note: `${me().name} set Excel column ${person(assigneeId)?.name || "empty"}`,
        });
        return;
      }
      if (isDesigner() && t.assigneeId !== me().id) {
        toast("Overall picture only — open your own projects from My projects");
        return;
      }
      openTask(t.id);
    });
  });
}

async function pullExcel() {
  const out = await api("/api/excel/pull", { month: state.month });
  if (out.error || !out.state) {
    toast(out.error || "Excel file not available here — use Open xlsx");
    return;
  }
  applyState(out.state);
  toast(`Excel: ${out.updated || 0} rows updated, ${out.added || 0} new`);
}

async function importExcelFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  const out = await api("/api/excel/import", { month: state.month, content: btoa(bin) });
  if (out.error || !out.state) {
    toast(out.error || "Could not read that workbook");
    return;
  }
  applyState(out.state);
  toast(`Excel: ${out.updated || 0} updated, ${out.added || 0} new`);
}

async function saveExcel() {
  await api("/api/excel/save", { month: state.month });
  try {
    const res = await fetch(`/api/excel/file?month=${encodeURIComponent(state.month)}`);
    if (!res.ok) throw new Error("no file");
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "SP_MGX_check.xlsx";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Saved SP_MGX_check.xlsx — same file the studio keeps");
  } catch {
    downloadMonthCsv();
    toast("Downloaded CSV. Full xlsx mirror runs in the studio app.");
  }
}

function renderBoard() {
  if (state.view === "close") {
    renderClose();
    return;
  }
  if (state.view === "team") {
    renderTeam();
    return;
  }
  if (state.view === "excel") {
    renderExcelSheet();
    return;
  }
  const exec = isExecView();
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
        <div class="cell">Status</div><div class="cell">Brief</div>
        <div class="cell">Result</div><div class="cell">Assignee</div>
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
              isDesigner()
                ? `Nothing assigned to you in ${monthLabel(state.month)}`
                : `No projects in ${monthLabel(state.month)} yet. Pull from Monday or paste a shift email.`
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
  bindTimeEdits();
}

function bindTimeEdits() {
  $("board").querySelectorAll(".shift-in").forEach((el) => {
    const commit = () => {
      const t = state.db.tasks.find((x) => x.id === el.dataset.id);
      if (!t) return;
      const shifts = parseShifts(el.value);
      if (shifts === null) {
        el.value = t.shifts ?? "";
        toast("Shifts must be 0 or more");
        return;
      }
      if (shifts === Number(t.shifts)) return;
      const hours = hoursFromShifts(shifts);
      const hint = el.parentElement?.querySelector("small");
      if (hint) hint.textContent = hours ? hours + "h" : "—";
      updateTask(t.id, {
        shifts,
        role: me().role,
        note: `${me().name} set ${shifts} shifts → ${hours} h`,
      });
    };
    el.addEventListener("click", (e) => e.stopPropagation());
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        el.blur();
      }
    });
    el.addEventListener("change", commit);
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
        <div class="cell"><span class="pill ${st.cls}">${st.label}</span></div>
        <div class="cell">${brief}</div>
        <div class="cell">${result}</div>
        <div class="cell">${personCell(t.assigneeId)}</div>
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
  const month = monthTasks();
  const byLine = { DD: 0, DX: 0, DS: 0 };
  for (const t of month) byLine[t.line] = (byLine[t.line] || 0) + (Number(t.hours) || 0);
  const people = {};
  for (const t of month) {
    if (!t.assigneeId) continue;
    const p = person(t.assigneeId);
    if (!p || p.role !== "designer") continue;
    people[t.assigneeId] = (people[t.assigneeId] || 0) + (Number(t.hours) || 0);
  }
  const clientRate = Number(state.db?.meta?.clientRateUsd);
  const designerRate = Number(state.db?.meta?.designerRateUsd);
  const moneyLine = (line, hours) =>
    clientRate
      ? `${line} × $${clientRate} = $${(hours * clientRate).toFixed(0)}`
      : line;
  $("board").innerHTML = `
    <section class="group" style="padding:18px">
      <h2 style="margin:0 0 8px">Finance · ${monthLabel(state.month)}</h2>
      <p style="color:#676879">Designers and the manager do not see this. Hours by line for the selected month.</p>
      <p style="margin:0 0 12px"><button class="btn ghost" id="btnCsvClose">Excel CSV</button></p>
      <div class="kpis" style="padding:0 0 16px">
        <div class="kpi"><b>${byLine.DD.toFixed(1)} h</b><span>${moneyLine("DD", byLine.DD)}</span></div>
        <div class="kpi"><b>${byLine.DX.toFixed(1)} h</b><span>${moneyLine("DX", byLine.DX)}</span></div>
        <div class="kpi"><b>${byLine.DS.toFixed(1)} h</b><span>DS</span></div>
      </div>
      <h3>Designer hours</h3>
      ${Object.entries(people)
        .map(([id, h]) => {
          const pay =
            designerRate ? ` · $${(h * designerRate).toFixed(0)}` : "";
          return `<div style="padding:8px 0;border-bottom:1px solid #f0f1f5">${personCell(id)} — <b>${h.toFixed(1)} h</b>${pay}</div>`;
        })
        .join("")}
    </section>`;
  $("btnCsvClose")?.addEventListener("click", downloadMonthCsv);
}

function captureTeamDrafts() {
  $("board")?.querySelectorAll(".team-row").forEach((row) => {
    const input = row.querySelector(".team-name");
    if (input) state.teamDrafts[row.dataset.id] = input.value;
  });
}

function displayName(p) {
  const draft = state.teamDrafts[p.id];
  return draft !== undefined ? draft : p.name;
}

async function flushTeamNames() {
  captureTeamDrafts();
  const people = (state.db.people || [])
    .map((p) => ({ id: p.id, name: String(displayName(p) || "").trim() }))
    .filter((p) => p.name);
  if (!people.length) return { state: state.db };
  const out = await api("/api/people/update", { people, role: me().role });
  if (out.error || !out.state) return out;
  for (const p of people) delete state.teamDrafts[p.id];
  applyState(out.state);
  return out;
}

function renderTeam() {
  if (!isFinance()) {
    state.view = "board";
    render();
    return;
  }
  const rows = state.db.people
    .map(
      (p) => `
      <div class="team-row" data-id="${p.id}">
        <span class="person"><span class="avatar" style="background:${p.color}">${initials(displayName(p))}</span>${escapeHtml(displayName(p))}</span>
        <span class="role-tag">${escapeHtml(ROLE_LABEL[p.role] || p.role)}</span>
        <input class="team-name" value="${escapeHtml(displayName(p))}" placeholder="Real name" />
        <button class="btn primary team-save" type="button">Save</button>
        <button class="btn ghost team-del" type="button">Delete</button>
      </div>`
    )
    .join("");
  $("board").innerHTML = `
    <section class="group" style="padding:18px">
      <h2 style="margin:0 0 8px">Team names</h2>
      <p style="color:#676879">Finance only. Rename a job title to a real name. Role stays for access. Unsaved names are kept if you add or delete someone.</p>
      ${rows}
      <div class="team-add">
        <select id="addJob">${TEAM_JOBS.map((j) => `<option value="${j.id}">${j.label}</option>`).join("")}</select>
        <button class="btn" type="button" id="addPerson">Add person</button>
        <button class="btn primary" type="button" id="saveAllNames">Save all names</button>
      </div>
    </section>`;
  $("board").querySelectorAll(".team-name").forEach((input) => {
    input.addEventListener("input", () => {
      state.teamDrafts[input.closest(".team-row").dataset.id] = input.value;
    });
  });
  $("board").querySelectorAll(".team-save").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".team-row");
      const name = row.querySelector(".team-name").value.trim();
      if (!name) {
        toast("Name cannot be empty");
        return;
      }
      const out = await api("/api/people/update", { id: row.dataset.id, name, role: me().role });
      if (out.error || !out.state) {
        toast(out.error || "Could not save");
        return;
      }
      delete state.teamDrafts[row.dataset.id];
      applyState(out.state);
      toast("Name saved");
    });
  });
  $("board").querySelectorAll(".team-del").forEach((btn) => {
    btn.addEventListener("click", () => openDeletePerson(btn.closest(".team-row").dataset.id));
  });
  $("saveAllNames").onclick = async () => {
    const out = await flushTeamNames();
    if (out.error) toast(out.error);
    else toast("All names saved");
  };
  $("addPerson").onclick = async () => {
    const job = $("addJob").value;
    const flushed = await flushTeamNames();
    if (flushed.error) {
      toast(flushed.error);
      return;
    }
    const out = await api("/api/people/add", { role: me().role, job });
    if (out.error || !out.state) {
      toast(out.error || "Could not add");
      return;
    }
    applyState(out.state);
    toast("Person added — type the real name");
  };
}

function assignedTo(id) {
  return (state.db.tasks || []).filter((t) => t.assigneeId === id);
}

function openDeletePerson(id) {
  const p = person(id);
  if (!p) return;
  if (id === me().id) {
    toast("You cannot delete the person you are logged in as");
    return;
  }
  const held = assignedTo(id);
  $("delTitle").textContent = `Delete ${displayName(p)}?`;
  $("delProjects").innerHTML = held.length
    ? held.map((t) => `<li title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</li>`).join("")
    : "";
  $("delProjects").hidden = !held.length;
  const wrap = $("delMoveWrap");
  wrap.hidden = !held.length;
  if (held.length) {
    $("delIntro").textContent = `${displayName(p)} still has ${held.length} project${held.length === 1 ? "" : "s"}. Choose who takes them, or leave unassigned. You cannot delete until you choose.`;
    const others = state.db.people
      .filter((x) => x.id !== id)
      .sort((a, b) => {
        const ra = a.role === p.role ? 0 : 1;
        const rb = b.role === p.role ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return String(displayName(a)).localeCompare(String(displayName(b)));
      });
    $("delMove").innerHTML =
      `<option value="" disabled selected>Choose…</option>` +
      `<option value="__none__">Leave unassigned</option>` +
      others
        .map((x) => `<option value="${x.id}">${escapeHtml(displayName(x))} · ${ROLE_LABEL[x.role] || x.role}</option>`)
        .join("");
    $("delConfirm").disabled = true;
  } else {
    $("delIntro").textContent = "No projects are assigned to this person. Safe to delete.";
    $("delConfirm").disabled = false;
  }
  $("delModal").dataset.id = id;
  $("delModal").classList.add("show");
}

async function confirmDeletePerson() {
  const id = $("delModal").dataset.id;
  const p = person(id);
  if (!p) return;
  const held = assignedTo(id);
  let reassignTo;
  if (held.length) {
    const raw = $("delMove").value;
    if (!raw) {
      toast("Choose where the projects go");
      return;
    }
    reassignTo = raw === "__none__" ? "" : raw;
  }
  const flushed = await flushTeamNames();
  if (flushed.error) {
    toast(flushed.error);
    return;
  }
  const payload = { id, role: me().role, actorId: me().id };
  if (held.length) payload.reassignTo = reassignTo;
  const out = await api("/api/people/delete", payload);
  if (out.error || !out.state) {
    toast(out.error || "Could not delete");
    return;
  }
  delete state.teamDrafts[id];
  if (state.designerFilter === id) state.designerFilter = null;
  $("delModal").classList.remove("show");
  applyState(out.state);
  const moved = held.length ? (reassignTo ? ` · ${held.length} moved` : ` · ${held.length} unassigned`) : "";
  toast(`Deleted ${displayName(p)}${moved}`);
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
    : isTeamLead()
      ? "Team lead: Ready to Start, WIP, Need Fixing, Done. No Monday send."
      : "Manager / Finance: send Done work to Senior Approval on Monday.";
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
    <div class="field"><label>Brief</label>
      ${
        canOps() || canAssign()
          ? `<textarea class="brief-edit" id="stBrief" placeholder="Paste the Monday / Google Doc brief">${escapeHtml(t.brief || "")}</textarea>
      <label style="margin-top:10px">Google Doc</label>
      <input id="stDoc" value="${escapeHtml(t.docUrl || "")}" placeholder="https://docs.google.com/document/..." />
      <label style="margin-top:10px">Drive folder</label>
      <input id="stFolder" value="${escapeHtml(t.folderUrl || "")}" placeholder="https://drive.google.com/drive/folders/..." />`
          : `<div class="brief">${escapeHtml(t.brief || "No brief yet")}</div>
      ${t.docUrl ? `<p><a href="${escapeHtml(t.docUrl)}" target="_blank" rel="noreferrer">Open Google Doc</a></p>` : ""}
      ${t.folderUrl ? `<p><a href="${escapeHtml(t.folderUrl)}" target="_blank" rel="noreferrer">Drive folder</a></p>` : ""}`
      }
    </div>
    ${
      canEditTime()
        ? `<div class="field"><label>Shifts</label>
      <input id="stShifts" type="number" min="0" step="0.1" value="${t.shifts ?? ""}" />
      <p class="status-hint" id="stHoursHint">= ${hoursFromShifts(t.shifts || 0)} h (shifts × ${shiftHours()}). Same unit as Orit’s email.</p></div>`
        : `<div class="field"><label>Time</label><div>${t.shifts || 0} shifts · ${t.hours || 0} h</div></div>`
    }
    <div class="field"><label>${isDesigner() ? "Paste result link here" : "Result link"}</label>
      <input id="stResult" value="${escapeHtml(t.resultUrl || "")}" placeholder="https://drive.google.com/..." ${isDesigner() && mine || canOps() ? "" : "disabled"} />
    </div>
    <div class="field"><label>Status</label>
      <select id="stStatus" ${canEdit && !lockedStatus ? "" : "disabled"}>${statusOpts}</select>
      <p class="status-hint">${statusHint}</p>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn primary" id="saveTask">Save</button>
      ${canAssign() || canOps() ? `<button class="btn ghost" id="copyTelegram">Copy Telegram</button>` : ""}
      ${canOps() && t.resultUrl ? `<button class="btn green" id="exportOne">Send this to client</button>` : ""}
    </div>
  `;
  $("drawerBg").classList.add("show");
  $("closeDrawer").onclick = () => $("drawerBg").classList.remove("show");
  $("stShifts")?.addEventListener("input", () => {
    const shifts = parseShifts($("stShifts").value);
    const hint = $("stHoursHint");
    if (!hint) return;
    if (shifts === null) {
      hint.textContent = "Enter a number, 0 or more.";
      return;
    }
    hint.textContent = `= ${hoursFromShifts(shifts)} h (shifts × ${shiftHours()}). Same unit as Orit’s email.`;
  });
  $("saveTask").onclick = () => {
    const resultUrl = $("stResult").value.trim();
    const studioStatus = $("stStatus").value;
    if (studioStatus !== t.studioStatus && !canSetStatus(studioStatus)) {
      toast("This role cannot set " + (STATUS[studioStatus]?.label || studioStatus));
      return;
    }
    const assigneeId = $("stPerson") ? $("stPerson").value : t.assigneeId;
    const patch = { resultUrl, studioStatus, assigneeId, role: me().role };
    if ($("stBrief")) patch.brief = $("stBrief").value;
    if ($("stDoc")) patch.docUrl = $("stDoc").value.trim();
    if ($("stFolder")) patch.folderUrl = $("stFolder").value.trim();
    if (canEditTime() && $("stShifts")) {
      const shifts = parseShifts($("stShifts").value);
      if (shifts === null) {
        toast("Shifts must be 0 or more");
        return;
      }
      patch.shifts = shifts;
    }
    const note =
      patch.shifts !== undefined && patch.shifts !== Number(t.shifts)
        ? `${me().name} set ${patch.shifts} shifts → ${hoursFromShifts(patch.shifts)} h`
        : resultUrl && resultUrl !== t.resultUrl
          ? `${me().name} pasted the result`
          : `${me().name} updated status`;
    updateTask(t.id, { ...patch, note });
  };
  $("copyTelegram")?.addEventListener("click", async () => {
    const line = telegramLine({ ...t, assigneeId: $("stPerson") ? $("stPerson").value : t.assigneeId });
    const ok = await copyText(line);
    showPaste(
      "Telegram",
      "Paste this in the studio chat so the designer gets the name without hunting Monday.",
      line
    );
    toast(ok ? "Telegram line copied" : "Copy failed — select the text");
  });
  $("exportOne")?.addEventListener("click", async () => {
    await sendToClient([t.id]);
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
  if (state.openId && $("drawerBg").classList.contains("show")) openTask(id);
}
async function importMonday() {
  const out = await api("/api/import-monday", { month: state.month });
  applyState(out.state);
  toast(out.added ? `Pulled ${out.added} new from Monday` : "Nothing new");
}
async function provision() {
  const out = await api("/api/provision", { ids: [...state.selected] });
  applyState(out.state);
  toast("Folders marked in _PORTAL_TEST");
}
async function sendToClient(ids) {
  const ready = state.db.tasks.filter((t) => ids.includes(t.id) && t.resultUrl);
  if (!ready.length) {
    toast("Need a result link first. You can send 2 of 10 without waiting.");
    return;
  }
  const out = await api("/api/export-monday", { ids: ready.map((t) => t.id) });
  applyState(out.state);
  const pack = (out.exported || []).map((row) => row.reply).join("\n\n");
  const ok = await copyText(pack);
  showPaste(
    "Paste into Monday",
    "Monday API is not connected yet. Paste this into External Weekly — status on our board is already Senior Approval.",
    pack
  );
  toast(ok ? `Copied ${out.exported.length} Monday replies` : `Ready to copy ${out.exported.length} replies`);
}
async function exportMonday() {
  await sendToClient([...state.selected]);
}
async function resetDemo() {
  const out = await api("/api/reset", {});
  state.month = out.meta?.month || "2026-10";
  localStorage.setItem(MONTH_KEY, state.month);
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
  renderLoad();
  renderBoard();
}

$("monthPrev").addEventListener("click", () => setMonth(shiftMonth(state.month, -1)));
$("monthNext").addEventListener("click", () => setMonth(shiftMonth(state.month, 1)));
$("monthLabel").addEventListener("click", () => setMonth(calendarMonth()));

$("who").addEventListener("change", (e) => {
  state.roleId = e.target.value;
  state.selected.clear();
  state.designerFilter = null;
  state.view = "board";
  if (state.session) writeSession({ ...state.session, seatId: e.target.value });
  render();
});
$("signOut").addEventListener("click", () => {
  writeSession(null);
  state.roleId = "manager";
  state.view = "board";
  state.selected.clear();
  state.designerFilter = null;
  state.openId = null;
  $("drawerBg").classList.remove("show");
  showLogin();
});
$("navClose").addEventListener("click", () => {
  if (!isFinance()) return;
  state.view = "close";
  render();
});
$("navTeam").addEventListener("click", () => {
  if (!isFinance()) return;
  state.view = "team";
  render();
});
$("delCancel").onclick = () => $("delModal").classList.remove("show");
$("delConfirm").onclick = () => confirmDeletePerson();
$("delMove").addEventListener("change", () => {
  $("delConfirm").disabled = !$("delMove").value;
});
$("delModal").addEventListener("click", (e) => {
  if (e.target === $("delModal")) $("delModal").classList.remove("show");
});
$("excelFile")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (file) await importExcelFile(file);
});
$("pasteClose").onclick = () => $("pasteModal").classList.remove("show");
$("pasteCopy").onclick = async () => {
  const ok = await copyText($("pasteText").value);
  toast(ok ? "Copied" : "Select the text and copy");
};
$("pasteModal").addEventListener("click", (e) => {
  if (e.target === $("pasteModal")) $("pasteModal").classList.remove("show");
});
$("emailCancel").onclick = () => $("emailModal").classList.remove("show");
$("emailApply").onclick = async () => {
  const out = await api("/api/parse-email", { text: $("emailText").value, month: state.month });
  applyState(out.state);
  $("emailModal").classList.remove("show");
  toast(`Email: ${out.added} new, ${out.updated} shifts updated`);
};
$("drawerBg").addEventListener("click", (e) => {
  if (e.target === $("drawerBg")) $("drawerBg").classList.remove("show");
});

api("/api/state")
  .then((db) => {
    state.db = db;
    state.month = localStorage.getItem(MONTH_KEY) || calendarMonth() || db.meta?.month || "2026-10";
    if (isStudioHost()) {
      const session = readSession();
      if (!session || !applySession(session)) {
        showLogin();
        return;
      }
      enterStudio();
    } else {
      const people = visiblePeople();
      if (!people.some((p) => p.id === state.roleId)) {
        state.roleId = people.find((p) => p.role === "manager")?.id || people[0]?.id;
      }
    }
    render();
  })
  .catch(() => {
    if (isStudioHost()) showLogin();
  });
