const STATUS = {
  new: { label: "Ready to Start", cls: "status-new", order: 1 },
  wip: { label: "WIP", cls: "status-wip", order: 2 },
  revision: { label: "Need Fixing", cls: "status-revision", order: 3 },
  done: { label: "Done", cls: "status-done", order: 4 },
  approve: { label: "Senior Approval", cls: "status-approve", order: 5 },
};

const ROLE_LABEL = {
  finance: "Finance",
  manager: "Line Producer",
  teamlead: "Team Lead",
  designer: "Motion design",
};
const JOB_BADGE = {
  finance: { code: "FN", title: "Finance" },
  manager: { code: "LP", title: "Line Producer" },
  teamlead: { code: "TL", title: "Team Lead" },
  designer: { code: "MD", title: "Motion design" },
};
const TEAM_JOBS = [
  { id: "designer", label: "Motion design" },
  { id: "teamlead", label: "Team Lead" },
  { id: "manager", label: "Line Producer" },
  { id: "finance", label: "Finance" },
];

const NAME_WIDTH_KEY = "lg-name-width";
const NAME_WIDTH_DEFAULT = 520;

const STATUS_BY_ROLE = {
  designer: ["wip", "done"],
  teamlead: ["new", "wip", "revision", "done"],
  manager: ["new", "wip", "revision", "done"],
  finance: ["new", "wip", "revision", "done"],
};
const LINES = ["DD", "DX", "DS"];

const MONTH_KEY = "lg-month";
const SESSION_KEY = "lg-session";

const ACCOUNTS = [
  {
    email: "dmytro@lisenbart.games",
    name: "Dmytro",
    blurb: "Finance",
    lockRole: "finance",
  },
  {
    email: "anastasiia@lisenbart.games",
    name: "Anastasiia",
    blurb: "Line Producer",
    lockRole: "manager",
  },
  {
    email: "lisenbart.games@gmail.com",
    name: "Designers · Drive",
    blurb: "Team Lead / Motion design",
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
  finTab: "client",
  nbu: null,
  invoiceFolder: null,
  excelMonth: null,
  finApi: null,
  finApiMonth: null,
  finApiLoading: null,
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
              <strong>${escapeHtml(p.name)} ${jobBadgeHtml(p)}</strong>
              <span>${escapeHtml(jobMeta(p).title)}</span>
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
function hoursOf(t) {
  return Number(t.hours) || hoursFromShifts(t.shifts || 0) || 0;
}
function usd(n) {
  return `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function uah(n) {
  return `${(Number(n) || 0).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴`;
}
function nbuRate() {
  const manual = Number(state.db?.meta?.nbuRate);
  if (Number.isFinite(manual) && manual > 0) return manual;
  const live = Number(state.nbu?.rate);
  if (Number.isFinite(live) && live > 0) return live;
  return 41.2;
}
function taxPct() {
  const n = Number(state.db?.meta?.taxPct);
  return Number.isFinite(n) && n >= 0 ? n : 0.06;
}
function taxPercent(tax) {
  const n = Number(tax);
  if (!Number.isFinite(n) || n < 0) return 6;
  return Math.round(n * 10000) / 100;
}
function formatCard(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}
function hoursLabel(n) {
  return `${(Number(n) || 0).toFixed(1)} h`;
}
function clientRate() {
  const n = Number(state.db?.meta?.clientRateUsd);
  return Number.isFinite(n) && n >= 0 ? n : 35;
}
function rolePayRate(p) {
  if (p?.role === "manager") {
    const n = Number(state.db?.meta?.managerRateUsd);
    return Number.isFinite(n) && n >= 0 ? n : 5;
  }
  const n = Number(state.db?.meta?.designerRateUsd);
  return Number.isFinite(n) && n >= 0 ? n : 15;
}
function personPayRate(p) {
  if (p && p.rateUsd !== undefined && p.rateUsd !== null && p.rateUsd !== "") {
    const n = Number(p.rateUsd);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return rolePayRate(p);
}
function parseRate(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return false;
  return n;
}
function financeSnapshot() {
  const tasks = monthTasks();
  const fx = nbuRate();
  const tax = taxPct();
  const rate = clientRate();
  const totalHours = tasks.reduce((s, t) => s + hoursOf(t), 0);
  const totalShifts = tasks.reduce((s, t) => s + (Number(t.shifts) || 0), 0);
  const byLineMap = {};
  for (const key of LINES) byLineMap[key] = { line: key, projects: 0, shifts: 0, hours: 0, bill: 0 };
  for (const t of tasks) {
    const line = LINES.includes(t.line) ? t.line : t.line || "—";
    if (!byLineMap[line]) byLineMap[line] = { line, projects: 0, shifts: 0, hours: 0, bill: 0 };
    const h = hoursOf(t);
    byLineMap[line].projects += 1;
    byLineMap[line].shifts += Number(t.shifts) || 0;
    byLineMap[line].hours += h;
    byLineMap[line].bill += h * rate;
  }
  const byLine = Object.values(byLineMap).filter(
    (row) => row.line !== "DS" || row.projects
  );
  const payMap = {};
  for (const p of crew()) {
    payMap[p.id] = { person: p, projects: 0, shifts: 0, hours: 0, tasks: [] };
  }
  let unassignedHours = 0;
  let unassignedShifts = 0;
  let unassignedProjects = 0;
  for (const t of tasks) {
    const p = t.assigneeId ? person(t.assigneeId) : null;
    if (p?.role === "manager") continue;
    if (!p || !payMap[p.id]) {
      unassignedHours += hoursOf(t);
      unassignedShifts += Number(t.shifts) || 0;
      unassignedProjects += 1;
      continue;
    }
    payMap[p.id].projects += 1;
    payMap[p.id].shifts += Number(t.shifts) || 0;
    payMap[p.id].hours += hoursOf(t);
    payMap[p.id].tasks.push(t);
  }
  const payroll = Object.values(payMap)
    .map((row) => {
      const payRate = personPayRate(row.person);
      const allHours = row.person.role === "manager";
      const hours = allHours ? totalHours : row.hours;
      const payUsd = hours * payRate;
      return {
        ...row,
        hours,
        shifts: allHours ? totalShifts : row.shifts,
        projects: allHours ? tasks.length : row.projects,
        allHours,
        rate: payRate,
        payUsd,
        payUah: payUsd * fx,
      };
    })
    .sort(
      (a, b) =>
        (a.person.payOrder || 99) - (b.person.payOrder || 99) ||
        String(a.person.name).localeCompare(String(b.person.name))
    );
  const clientIn = totalHours * rate;
  const afterTax = clientIn - clientIn * tax;
  const empl = payroll.reduce((s, r) => s + r.payUsd, 0);
  const studio = afterTax - empl;
  return {
    month: monthLabel(state.month),
    ym: state.month,
    board: state.db?.meta?.board || "SUPERPLAY MGX",
    client: state.db?.meta?.client || "SuperPlay Ltd",
    tasks,
    totalHours,
    totalShifts,
    byLine,
    payroll,
    unassignedHours,
    unassignedShifts,
    unassignedProjects,
    clientIn,
    afterTax,
    empl,
    studio,
    clientInUah: clientIn * fx,
    afterTaxUah: afterTax * fx,
    emplUah: empl * fx,
    studioUah: studio * fx,
    fx,
    tax,
    clientRate: rate,
    nbu: state.nbu || { rate: fx, source: state.db?.meta?.nbuRate ? "manual" : "fallback" },
  };
}
function canAssign() {
  return me().role === "teamlead" || me().role === "manager" || me().role === "finance";
}
function isExecView() {
  return isDesigner() || isTeamLead();
}
function isSendable(t) {
  return Boolean(t && t.studioStatus === "done" && String(t.resultUrl || "").trim());
}
function canPasteResult(t) {
  if (canOps()) return true;
  if (!t) return false;
  return t.assigneeId === me().id && (isDesigner() || isTeamLead());
}
function designers() {
  const people = state.db.people || [];
  return people
    .filter((p) => p.role === "teamlead" || p.role === "designer")
    .sort(
      (a, b) =>
        (Number(a.payOrder) || 99) - (Number(b.payOrder) || 99) ||
        String(a.name).localeCompare(String(b.name))
    );
}
function crew() {
  return (state.db.people || []).filter((p) => p.role === "manager" || p.role === "teamlead" || p.role === "designer");
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
    if (!type.includes("json")) throw new Error("no api");
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
function sandboxDriveUrl() {
  const meta = state.db?.meta || {};
  if (state.month === "2026-10" && meta.driveSandboxOctober) return meta.driveSandboxOctober;
  return meta.driveSandbox || "";
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
            jobMeta(p).code
          } ${jobMeta(p).title}</option>`
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
          jobMeta(p).code
        } ${jobMeta(p).title}</option>`
    )
    .join("");
}

function renderMonth() {
  const here = state.month === calendarMonth();
  $("monthLabel").textContent = monthLabel(state.month);
  $("monthMeta").textContent = here ? "This month" : "";
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
  $("roleHint").textContent = "";
  $("sideFoot").innerHTML = "";

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
  if (state.view === "team") {
    $("toolbar").innerHTML = "";
    return;
  }
  if (state.view === "close") {
    $("toolbar").innerHTML = "";
    return;
  }
  if (state.view === "excel") {
    const drive = state.db?.meta?.driveSandboxExcel || "";
    $("toolbar").innerHTML = `
      ${isDesigner() || isClientPreview() ? "" : `<button class="btn" id="btnExcelPull">Refresh from file</button>`}
      ${drive ? `<a class="btn" href="${escapeHtml(drive)}" target="_blank" rel="noreferrer">Open on Drive</a>` : ""}
      <input class="search" placeholder="Search project" />
    `;
    $("toolbar").querySelector(".search")?.addEventListener("input", render);
    $("btnExcelPull")?.addEventListener("click", pullExcel);
    return;
  }
  if (canOps()) {
    for (const id of [...state.selected]) {
      const t = state.db.tasks.find((x) => x.id === id);
      if (!isSendable(t)) state.selected.delete(id);
    }
  }
  const n = [...state.selected].filter((id) => isSendable(state.db.tasks.find((x) => x.id === id))).length;
  const drive = sandboxDriveUrl();
  if (isExecView()) {
    $("toolbar").innerHTML = `
      ${drive ? `<a class="btn" href="${escapeHtml(drive)}" target="_blank" rel="noreferrer">Open Drive</a>` : ""}
      <input class="search" placeholder="Search project" />
    `;
  } else {
    $("toolbar").innerHTML = `
      <button class="btn primary" id="btnImport">Pull from Monday</button>
      <button class="btn orange" id="btnEmail">Shift email</button>
      ${drive ? `<a class="btn" href="${escapeHtml(drive)}" target="_blank" rel="noreferrer">Open Drive</a>` : ""}
      <button class="btn green" id="btnExport" ${n ? "" : "disabled"}>Send to client (${n})</button>
      <input class="search" placeholder="Search project" />
      <button class="btn ghost" id="btnReset">Reset demo</button>
    `;
  }
  $("toolbar").querySelector(".search")?.addEventListener("input", render);
  $("btnImport")?.addEventListener("click", importMonday);
  $("btnEmail")?.addEventListener("click", () => $("emailModal").classList.add("show"));
  $("btnExport")?.addEventListener("click", exportMonday);
  $("btnReset")?.addEventListener("click", resetDemo);
}

function renderKpis() {
  if (state.view === "close" || state.view === "team") {
    $("kpis").innerHTML = "";
    return;
  }
  const tasks = visibleTasks();
  if (isDesigner() && state.view !== "excel") {
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
  $("kpis").innerHTML = `
    <div class="kpi"><b>${month.length}</b><span>projects</span></div>
    <div class="kpi"><b>${hours.toFixed(1)} h</b><span>hours</span></div>
    <div class="kpi"><b>${ready}</b><span>Done</span></div>
  `;
}

function initials(name) {
  return (name || "?").slice(0, 1);
}
function jobMeta(p) {
  return JOB_BADGE[p?.role] || { code: "?", title: ROLE_LABEL[p?.role] || p?.role || "" };
}
function jobBadgeHtml(p) {
  const b = jobMeta(p);
  return `<span class="job-badge job-${escapeHtml(b.code.toLowerCase())}" title="${escapeHtml(b.title)}">${escapeHtml(b.code)}</span>`;
}
function personCell(id) {
  const p = person(id);
  if (!p) return `<span class="empty">unassigned</span>`;
  return `<span class="person"><span class="avatar" style="background:${p.color}">${initials(displayName(p))}</span>${escapeHtml(displayName(p))}${jobBadgeHtml(p)}</span>`;
}
function driveFolderIn(text) {
  const m = String(text || "").match(/https:\/\/drive\.google\.com\/drive\/folders\/[a-zA-Z0-9_-]+/i);
  return m ? m[0] : "";
}
function workFolder(t) {
  return driveFolderIn(t?.brief) || String(t?.folderUrl || "").trim();
}
function packLinksHtml(t) {
  const work = workFolder(t);
  const brief = t.docUrl
    ? `<a class="btn pack-brief" href="${escapeHtml(t.docUrl)}" target="_blank" rel="noreferrer">Open brief</a>`
    : "";
  const folder = work
    ? `<a class="btn pack-folder" href="${escapeHtml(work)}" target="_blank" rel="noreferrer">Open folder</a>`
    : "";
  if (!brief && !folder) return "";
  return `<div class="pack-links">${brief}${folder}</div>`;
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
      <strong>Load</strong>
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

  const rowHtml = (t) => {
    const cells = people
      .map((p) => {
        const mine = t.assigneeId === p.id;
        const h = mine ? fmtHours(t.hours) : "";
        const style = mine ? `style="background:${p.color}"` : "";
        return `<td class="${mine ? "xl-fill" : ""}" ${style}>${h}</td>`;
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
      <div class="xl-scroll">
        <table class="xl-table">
          <thead>
            <tr>
              <th></th>
              <th class="xl-proj-h">${state.month.slice(0, 4)} PROJECT NAME</th>
              <th></th><th></th><th></th>
              ${nameHeads}
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
    row.addEventListener("click", () => {
      const t = state.db.tasks.find((x) => x.id === row.dataset.id);
      if (!t) return;
      if (isDesigner() && t.assigneeId !== me().id) {
        toast("Open your own projects from My projects");
        return;
      }
      openTask(t.id);
    });
  });
}

async function pullExcel() {
  const out = await api("/api/excel/pull", { month: state.month });
  if (out.error || !out.state) {
    toast(out.error || "Could not read SP_MGX_check");
    return;
  }
  applyState(out.state);
  toast(`Excel: ${out.updated || 0} rows updated, ${out.added || 0} new`);
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
                ? `Nothing assigned in ${monthLabel(state.month)}`
                : `No projects in ${monthLabel(state.month)}`
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
  const sendable = isSendable(t);
  const checked = sendable && state.selected.has(t.id) ? "checked" : "";
  const gapCls = gap ? " status-gap" : "";
  const brief = t.docUrl
    ? `<a class="linkish" href="${escapeHtml(t.docUrl)}" target="_blank" rel="noreferrer">Brief</a>`
    : t.brief
      ? `<span class="linkish">text</span>`
      : `<span class="empty">none</span>`;
  const result = t.resultUrl
    ? `<a class="linkish" href="${escapeHtml(t.resultUrl)}" target="_blank" rel="noreferrer">Link</a>`
    : `<span class="empty">paste</span>`;
  const pick =
    mode === "ops"
      ? sendable
        ? `<input class="chk" data-id="${t.id}" type="checkbox" ${checked} />`
        : ""
      : "";
  const frozen =
    mode === "ops"
      ? `<div class="frozen">
          <div class="cell"><span class="pill line-${t.line}">${t.line}</span></div>
          <div class="cell">${pick}</div>
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

function ensureExcelHours() {
  if (state.excelMonth === state.month) return;
  state.excelMonth = state.month;
  api("/api/excel/pull", { month: state.month }).then((out) => {
    if (out.error) {
      toast(out.error);
      return;
    }
    if (out.state) applyState(out.state);
  });
}

function financeFromApi(snap) {
  const fx = Number(snap.nbu?.rate) || nbuRate();
  const payroll = (snap.payroll || []).map((row) => {
    const p = person(row.id) || {
      id: row.id,
      name: row.name,
      role: row.role,
      legalName: row.legalName,
      jobTitle: row.jobTitle,
      bankCard: row.bankCard,
      iban: row.iban,
      payOrder: row.payOrder,
      rateUsd: row.rate,
    };
    return {
      person: p,
      projects: row.projects,
      shifts: row.shifts,
      hours: row.hours,
      allHours: row.allHours,
      rate: row.rate,
      payUsd: row.payUsd,
      payUah: row.payUah,
    };
  });
  const un = snap.unassigned || {};
  return {
    month: monthLabel(snap.month || state.month),
    ym: snap.month || state.month,
    tasks: { length: snap.projects || 0 },
    totalHours: snap.hours,
    totalShifts: snap.shifts,
    byLine: snap.byLine || [],
    payroll,
    unassignedHours: un.hours || 0,
    unassignedShifts: un.shifts || 0,
    unassignedProjects: un.projects || 0,
    clientIn: snap.clientIn,
    afterTax: snap.afterTax,
    empl: snap.empl,
    studio: snap.studio,
    clientInUah: snap.clientInUah,
    afterTaxUah: snap.afterTaxUah,
    emplUah: snap.emplUah,
    studioUah: snap.studioUah,
    fx,
    tax: snap.taxPct,
    clientRate: snap.clientRate,
    hoursSource: snap.hoursSource,
    nbu: snap.nbu,
  };
}

function ensureFinanceSnapshot() {
  if (state.finApiMonth === state.month && state.finApi) return;
  if (state.finApiLoading === state.month) return;
  state.finApiLoading = state.month;
  fetch(`/api/finance/snapshot?month=${encodeURIComponent(state.month)}`)
    .then((r) => r.json())
    .then((snap) => {
      state.finApiLoading = null;
      if (snap.error) {
        state.finApiMonth = null;
        toast(snap.error);
        return;
      }
      state.finApi = snap;
      state.finApiMonth = state.month;
      if (state.view === "close") render();
    })
    .catch(() => {
      state.finApiLoading = null;
      state.finApiMonth = null;
    });
}

function renderClose() {
  if (!isFinance()) {
    state.view = "board";
    render();
    return;
  }
  ensureNbu();
  ensureExcelHours();
  ensureFinanceSnapshot();
  const fin =
    state.finApi && state.finApiMonth === state.month ? financeFromApi(state.finApi) : financeSnapshot();
  const tabs = [
    { id: "client", label: "Client" },
    { id: "studio", label: "Studio" },
    { id: "employees", label: "Employeers" },
  ];
  const pane =
    state.finTab === "employees" ? renderEmployees(fin) : state.finTab === "studio" ? renderStudio(fin) : renderClient(fin);
  const tabBar = `<div class="fin-tabs">${tabs
    .map(
      (t) =>
        `<button type="button" class="fin-tab ${state.finTab === t.id ? "active" : ""}" data-tab="${t.id}">${t.label}</button>`
    )
    .join("")}</div>`;
  $("board").innerHTML = `<section class="fin">${tabBar}${pane}</section>`;
  $("board").querySelectorAll(".fin-tab").forEach((el) => {
    el.addEventListener("click", () => {
      state.finTab = el.dataset.tab;
      render();
    });
  });
  $("btnCreateInvoices")?.addEventListener("click", createMonthInvoices);
  if (state.finTab === "employees") bindEmployeePay();
  if (state.finTab === "studio") bindStudioPay();
  $("btnOpenFolder")?.addEventListener("click", openInvoiceFolder);
  $("board").querySelectorAll(".fin-copy").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const ok = await copyText(btn.dataset.copy || "");
      toast(ok ? "Copied" : "Could not copy");
    });
  });
}

function renderClient(fin) {
  const empty = !fin.tasks.length;
  const lineRows = fin.byLine
    .map((row) => {
      const share = fin.totalHours ? Math.round((row.hours / fin.totalHours) * 100) : 0;
      return `<tr>
        <td><span class="pill line-${escapeHtml(row.line)}">${escapeHtml(row.line)}</span></td>
        <td class="num">${row.projects}</td>
        <td class="num">${row.shifts.toFixed(1)}</td>
        <td class="num">${hoursLabel(row.hours)}</td>
        <td class="num">${usd(fin.clientRate)}</td>
        <td class="num"><b>${usd(row.bill)}</b></td>
        <td class="num muted">${share}%</td>
      </tr>`;
    })
    .join("");
  if (empty) {
    return `<div class="fin-empty">No hours in ${escapeHtml(fin.month)}.</div>`;
  }
  const canCreate = fin.byLine.some((row) => row.hours);
  return `
    <div class="fin-kpis">
      <div class="kpi"><b>${fin.tasks.length}</b><span>projects</span></div>
      <div class="kpi"><b>${hoursLabel(fin.totalHours)}</b><span>× ${usd(fin.clientRate)}/h</span></div>
      <div class="kpi"><b>${usd(fin.clientIn)}</b><span>CLIENT IN</span></div>
      <div class="kpi"><b>${usd(fin.studio)}</b><span>STUDIO</span></div>
    </div>
    <section class="group fin-card">
      <div class="fin-scroll">
        <table class="fin-table">
          <thead><tr><th>Line</th><th class="num">Projects</th><th class="num">Shifts</th><th class="num">Hours</th><th class="num">Rate</th><th class="num">CLIENT IN</th><th class="num">Share</th></tr></thead>
          <tbody>${lineRows}</tbody>
          <tfoot><tr><td>MGX</td><td class="num">${fin.tasks.length}</td><td class="num">${fin.totalShifts.toFixed(1)}</td><td class="num">${hoursLabel(fin.totalHours)}</td><td></td><td class="num">${usd(fin.clientIn)}</td><td></td></tr></tfoot>
        </table>
      </div>
      <div class="fin-create-bar">
        <div class="fin-create-actions">
          <button type="button" class="btn" id="btnOpenFolder">Open folder</button>
          <button type="button" class="btn primary" id="btnCreateInvoices" ${canCreate ? "" : "disabled"}>Create DD / DX</button>
        </div>
      </div>
    </section>`;
}

function renderStudio(fin) {
  const pct = taxPercent(fin.tax);
  const rows = [
    { key: "clientIn", label: "CLIENT IN", usd: fin.clientIn },
    { key: "afterTax", label: "STUDIO (TAX)", usd: fin.afterTax },
    { key: "empl", label: "EMPL", usd: fin.empl },
    { key: "studio", label: "STUDIO", usd: fin.studio },
  ];
  const body = rows
    .map((row) => {
      const taxCtl =
        row.key === "afterTax"
          ? `<label class="fin-tax-line"><b>STUDIO (TAX)</b><input id="finTaxPct" class="fin-tax-in" type="number" min="0" max="100" step="0.1" value="${pct}" /><span>%</span></label>`
          : `<b>${escapeHtml(row.label)}</b>`;
      return `<tr class="${row.key === "studio" ? "fin-studio-row" : ""}" data-row="${row.key}">
        <td>${taxCtl}</td>
        <td class="num" data-uah-amt data-usd-amt="${row.usd}">${uah(row.usd * fin.fx)}</td>
        <td class="num" data-usd>${usd(row.usd)}</td>
      </tr>`;
    })
    .join("");
  const empty = !fin.tasks.length ? `<div class="fin-empty">No hours in ${escapeHtml(fin.month)}.</div>` : "";
  return `
    <section class="group fin-card">
      <div class="fin-rates">
        <label>NBU USD/UAH <input id="finNbu" type="number" min="0" step="0.01" value="${fin.fx}" /></label>
      </div>
      ${empty}
      <div class="fin-scroll">
        <table class="fin-table" id="finStudioTable" data-client-in="${fin.clientIn}" data-empl="${fin.empl}">
          <thead><tr><th></th><th class="num">UAH</th><th class="num">USD</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </section>`;
}

function studioTaxFraction() {
  const parsed = parseRate($("finTaxPct")?.value);
  if (parsed === null || parsed === false) return taxPct();
  return Math.min(parsed, 100) / 100;
}

function bindStudioPay() {
  $("finNbu")?.addEventListener("input", refreshStudioMoney);
  $("finNbu")?.addEventListener("change", () => saveNbuRate({ silent: true }));
  $("finTaxPct")?.addEventListener("input", refreshStudioMoney);
  $("finTaxPct")?.addEventListener("change", () => saveTaxPct({ silent: true }));
}

function refreshStudioMoney() {
  const root = $("board");
  const table = $("finStudioTable");
  if (!root || !table) return;
  const fx = employeePayFx();
  const tax = studioTaxFraction();
  const clientIn = Number(table.dataset.clientIn) || 0;
  const empl = Number(table.dataset.empl) || 0;
  const afterTax = clientIn - clientIn * tax;
  const studio = afterTax - empl;
  const amounts = { clientIn, afterTax, empl, studio };
  root.querySelectorAll("tr[data-row]").forEach((tr) => {
    const usdAmt = amounts[tr.dataset.row];
    const uahEl = tr.querySelector("[data-uah-amt]");
    const usdEl = tr.querySelector("[data-usd]");
    if (uahEl) {
      uahEl.dataset.usdAmt = String(usdAmt);
      uahEl.textContent = uah(usdAmt * fx);
    }
    if (usdEl) usdEl.textContent = usd(usdAmt);
  });
  for (const [key, val] of Object.entries(amounts)) {
    const el = root.querySelector(`[data-kpi="${key}"]`);
    if (el) el.textContent = usd(val);
  }
  const taxEl = root.querySelector("[data-kpi-tax]");
  if (taxEl) taxEl.textContent = String(taxPercent(tax));
}

async function saveTaxPct(opts = {}) {
  const parsed = parseRate($("finTaxPct")?.value);
  if (parsed === null || parsed === false || parsed > 100) {
    toast("Tax must be 0–100%");
    return;
  }
  const fraction = parsed / 100;
  const out = await api("/api/meta/update", {
    role: me().role,
    month: state.month,
    taxPct: fraction,
  });
  if (out.error || !out.state) {
    toast(out.error || "Could not save tax");
    return;
  }
  applyState(out.state);
  if (!opts.silent) toast(`Tax ${taxPercent(fraction)}%`);
}

function payCopy(row) {
  const card = String(row.person.bankCard || "").replace(/\D/g, "");
  if (card) return { label: formatCard(card), value: card, kind: "card" };
  const iban = String(row.person.iban || "").replace(/\s/g, "");
  if (iban) return { label: iban, value: iban, kind: "iban" };
  return null;
}

function renderEmployees(fin) {
  const payRows = fin.payroll
    .map((row) => {
      const fallback = rolePayRate(row.person);
      const copy = payCopy(row);
      const payCell = copy
        ? `<div class="fin-pay">
            <code class="fin-pan">${escapeHtml(copy.label)}</code>
            <button type="button" class="btn ghost fin-copy" data-copy="${escapeHtml(copy.value)}">Copy ${copy.kind}</button>
          </div>`
        : `<span class="empty">—</span>`;
      const legal = String(row.person.legalName || "").trim();
      const title = jobMeta(row.person).title;
      const who = `<div class="fin-who">
            ${personCell(row.person.id)}
            <div class="fin-legal">${escapeHtml(title)}${legal ? ` · ${escapeHtml(legal)}` : ""}</div>
          </div>`;
      return `<tr class="fin-pay-row" data-hours="${row.hours}" data-fallback="${fallback}" data-all-hours="${row.allHours ? "1" : "0"}">
        <td>${who}</td>
        <td class="num">${hoursLabel(row.hours)}</td>
        <td class="num"><input class="fin-person-rate" data-id="${row.person.id}" type="number" min="0" step="0.5" value="${row.rate}" /></td>
        <td class="num" data-usd>${usd(row.payUsd)}</td>
        <td class="num" data-uah><b>${uah(row.payUah)}</b></td>
        <td>${payCell}</td>
      </tr>`;
    })
    .join("");
  const unRow = fin.unassignedProjects
    ? `<tr class="fin-warn-row">
        <td>Unassigned</td>
        <td class="num">${hoursLabel(fin.unassignedHours)}</td>
        <td colspan="4"></td>
      </tr>`
    : "";
  return `
    <section class="group fin-card">
      <div class="fin-rates">
        <label>NBU USD/UAH <input id="finNbu" type="number" min="0" step="0.01" value="${fin.fx}" /></label>
      </div>
      <div class="fin-scroll">
        <table class="fin-table">
          <thead><tr><th>Person</th><th class="num">Hours</th><th class="num">$/h</th><th class="num">Hours × $/h</th><th class="num">UAH</th><th>Card</th></tr></thead>
          <tbody>${payRows}${unRow}</tbody>
          <tfoot><tr><td>EMPL</td><td class="num" data-empl-hours></td><td></td><td class="num" data-empl-usd>${usd(fin.empl)}</td><td class="num" data-empl-uah>${uah(fin.emplUah)}</td><td></td></tr></tfoot>
        </table>
      </div>
    </section>`;
}

function employeePayFx() {
  const n = parseRate($("finNbu")?.value);
  if (n === null || n === false || n <= 0) return nbuRate();
  return n;
}

function refreshEmployeePay() {
  const root = $("board");
  if (!root) return;
  const fx = employeePayFx();
  let empl = 0;
  root.querySelectorAll("tr.fin-pay-row").forEach((tr) => {
    const hours = Number(tr.dataset.hours) || 0;
    const fallback = Number(tr.dataset.fallback);
    const parsed = parseRate(tr.querySelector(".fin-person-rate")?.value);
    const rate = parsed === null || parsed === false ? (Number.isFinite(fallback) ? fallback : 15) : parsed;
    const usdAmt = hours * rate;
    empl += usdAmt;
    const usdEl = tr.querySelector("[data-usd]");
    const uahEl = tr.querySelector("[data-uah]");
    if (usdEl) usdEl.textContent = usd(usdAmt);
    if (uahEl) uahEl.innerHTML = `<b>${uah(usdAmt * fx)}</b>`;
  });
  const footUsd = root.querySelector("[data-empl-usd]");
  const footUah = root.querySelector("[data-empl-uah]");
  if (footUsd) footUsd.textContent = usd(empl);
  if (footUah) footUah.textContent = uah(empl * fx);
}

function bindEmployeePay() {
  const root = $("board");
  if (!root) return;
  root.querySelectorAll(".fin-person-rate").forEach((el) => {
    el.addEventListener("input", refreshEmployeePay);
    el.addEventListener("change", () => saveEmployeeRates({ silent: true }));
  });
  $("finNbu")?.addEventListener("input", refreshEmployeePay);
  $("finNbu")?.addEventListener("change", () => saveNbuRate({ silent: true }));
}

function ensureNbu() {
  if (state.nbu || state.db?.meta?.nbuRate) return;
  state.nbu = { rate: 41.2, date: "", source: "fallback" };
  fetch("/api/nbu")
    .then((r) => r.json())
    .then((nbu) => {
      if (!nbu || !nbu.rate) return;
      state.nbu = nbu;
      if (state.view === "close") render();
    })
    .catch(() => {});
}

function monthFolderName(ym) {
  const [y, m] = String(ym || "").split("-").map(Number);
  if (!y || !m) return "";
  const name = new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long" });
  return `${String(m).padStart(2, "0")}_${name}`;
}

function downloadInvoiceZip() {
  const a = document.createElement("a");
  a.href = `/api/finance/invoice/zip?month=${encodeURIComponent(state.month)}`;
  a.download = `${monthFolderName(state.month)}.zip`;
  a.click();
}

async function openInvoiceFolder() {
  const res = await fetch("/api/finance/invoice/reveal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month: state.month, role: me().role }),
  });
  let out = {};
  try {
    out = await res.json();
  } catch {
    toast("Could not open the folder");
    return;
  }
  if (out.opened && out.folderPath && !String(out.folderPath).startsWith("/workspace")) {
    toast(`Opened ${out.folderPath}`);
    return;
  }
  downloadInvoiceZip();
  toast(`Downloaded ${monthFolderName(state.month)}.zip`);
}

async function createMonthInvoices() {
  const btn = $("btnCreateInvoices");
  if (btn) btn.disabled = true;
  let out = {};
  try {
    const res = await fetch("/api/finance/invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ line: "BOTH", month: state.month, role: me().role, nbuRate: nbuRate() }),
    });
    try {
      out = await res.json();
    } catch {
      toast("Could not build the invoices");
      return;
    }
    if (!res.ok || out.error) {
      toast(out.error || "Could not build the invoices");
      return;
    }
    const opened = await fetch("/api/finance/invoice/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: state.month, role: me().role }),
    })
      .then((r) => r.json())
      .catch(() => ({}));
    const path = out.folderPath || opened.folderPath || "/workspace/data/invoices/10_October";
    if (opened.opened && path && !String(path).startsWith("/workspace")) {
      toast(`Wrote and opened ${path}`);
      return;
    }
    downloadInvoiceZip();
    toast(`Wrote ${path}`);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function saveNbuRate(opts = {}) {
  const rate = parseRate($("finNbu")?.value);
  if (rate === null || rate === false || rate <= 0) {
    toast("NBU rate must be more than 0");
    return;
  }
  const out = await api("/api/meta/update", {
    role: me().role,
    month: state.month,
    nbuRate: rate,
  });
  if (out.error || !out.state) {
    toast(out.error || "Could not save NBU rate");
    return;
  }
  state.nbu = { rate, date: "", source: "manual" };
  applyState(out.state);
  if (!opts.silent) toast(`NBU ${rate} ₴ / $`);
}

async function saveEmployeeRates(opts = {}) {
  const people = [];
  for (const el of $("board").querySelectorAll(".fin-person-rate")) {
    const p = person(el.dataset.id);
    if (!p) continue;
    const parsed = parseRate(el.value);
    if (parsed === false) {
      toast(`Pay rate for ${p.name} must be 0 or more`);
      return;
    }
    const rate = parsed === null ? rolePayRate(p) : parsed;
    people.push({ id: p.id, rateUsd: rate });
  }
  if (!people.length) return;
  const out = await api("/api/people/update", { role: me().role, people });
  if (out.error || !out.state) {
    toast(out.error || "Could not save pay rates");
    return;
  }
  applyState(out.state);
  if (!opts.silent) toast("Pay rates saved");
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
        <span class="job-mark">${jobBadgeHtml(p)}<span class="job-title">${escapeHtml(jobMeta(p).title)}</span></span>
        <input class="team-name" value="${escapeHtml(displayName(p))}" placeholder="Real name" />
        <button class="btn primary team-save" type="button">Save</button>
        <button class="btn ghost team-del" type="button">Delete</button>
      </div>`
    )
    .join("");
  $("board").innerHTML = `
    <section class="group" style="padding:18px">
      <h2 style="margin:0 0 12px">Team names</h2>
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
    toast("Person added");
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
    $("delIntro").textContent = `${held.length} project${held.length === 1 ? "" : "s"} — choose who takes them.`;
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
        .map((x) => `<option value="${x.id}">${escapeHtml(displayName(x))} · ${jobMeta(x).code} ${escapeHtml(jobMeta(x).title)}</option>`)
        .join("");
    $("delConfirm").disabled = true;
  } else {
    $("delIntro").textContent = "";
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
      const roleBlock = k !== t.studioStatus && !canSetStatus(k);
      const needResult = k === "done" && k !== t.studioStatus && !String(t.resultUrl || "").trim();
      const disabled = roleBlock || needResult ? "disabled" : "";
      return `<option value="${k}" ${selected} ${disabled}>${STATUS[k].label}</option>`;
    })
    .join("");
  $("drawer").innerHTML = `
    <div class="drawer-head">
      <h2>${escapeHtml(t.name)}</h2>
      <button type="button" class="drawer-x" id="closeDrawer" aria-label="Close">×</button>
    </div>
    <div class="meta">${t.line} · ${t.shifts || 0} shift / ${t.hours || 0} h · ${person(t.assigneeId)?.name || "unassigned"}</div>
    <div class="drawer-body">
    ${
      canAssign()
        ? `<div class="field"><label>Assign designer</label>
      <select id="stPerson">
        <option value="">— unassigned</option>
        ${designers()
          .map((p) => `<option value="${p.id}" ${t.assigneeId === p.id ? "selected" : ""}>${escapeHtml(p.name)} · ${jobMeta(p).code}</option>`)
          .join("")}
      </select></div>`
        : `<div class="field"><label>Assignee</label><div>${personCell(t.assigneeId)}</div></div>`
    }
    <div class="field"><label>Brief</label>
      ${
        canOps() || canAssign()
          ? `<textarea class="brief-edit" id="stBrief" placeholder="Paste the Monday / Google Doc brief">${escapeHtml(t.brief || "")}</textarea>
      ${packLinksHtml(t)}
      <label style="margin-top:10px">Brief Doc URL</label>
      <input id="stDoc" value="${escapeHtml(t.docUrl || "")}" placeholder="https://docs.google.com/document/..." />
      <label style="margin-top:10px">Work folder URL</label>
      <input id="stFolder" value="${escapeHtml(t.folderUrl || "")}" placeholder="Client folder, or ours if they did not send one" />`
          : `<div class="brief">${escapeHtml(t.brief || "No brief yet")}</div>
      ${packLinksHtml(t)}`
      }
    </div>
    ${
      canEditTime()
        ? `<div class="field"><label>Shifts</label>
      <input id="stShifts" type="number" min="0" step="0.1" value="${t.shifts ?? ""}" />
      <p class="status-hint" id="stHoursHint">= ${hoursFromShifts(t.shifts || 0)} h</p></div>`
        : `<div class="field"><label>Time</label><div>${t.shifts || 0} shifts · ${t.hours || 0} h</div></div>`
    }
    <div class="field"><label>${canPasteResult(t) && !canOps() ? "Paste result link here" : "Result link"}</label>
      <input id="stResult" value="${escapeHtml(t.resultUrl || "")}" placeholder="https://drive.google.com/..." ${canPasteResult(t) ? "" : "disabled"} />
    </div>
    <div class="field"><label>Status</label>
      <select id="stStatus" ${canEdit && !lockedStatus ? "" : "disabled"}>${statusOpts}</select>
      <p class="status-hint" id="stDoneHint"></p>
    </div>
    </div>
    <div class="drawer-actions">
      ${canOps() && isSendable(t) ? `<button class="btn green" id="exportOne">Send this to client</button>` : ""}
      ${canOps() && t.studioStatus === "approve" && t.resultUrl ? `<button class="btn" id="copyOne">Copy Monday reply</button>` : ""}
      ${canOps() && !(t.folderUrl && t.docUrl) ? `<button type="button" class="btn" id="ensureDrive">Create folder + brief</button>` : ""}
      <button class="btn primary" id="saveTask">Save</button>
    </div>
  `;
  $("drawerBg").classList.add("show");
  $("closeDrawer").onclick = closeDrawer;
  const syncDoneOption = () => {
    const opt = $("stStatus")?.querySelector('option[value="done"]');
    const hint = $("stDoneHint");
    const hasResult = Boolean($("stResult")?.value.trim());
    if (opt) {
      opt.disabled = (!hasResult && t.studioStatus !== "done") || (!canSetStatus("done") && t.studioStatus !== "done");
      if (opt.disabled && $("stStatus").value === "done") $("stStatus").value = t.studioStatus;
    }
    if (hint) hint.textContent = hasResult ? "" : "Paste the result link first.";
  };
  $("stResult")?.addEventListener("input", syncDoneOption);
  $("stResult")?.addEventListener("change", syncDoneOption);
  syncDoneOption();
  $("stShifts")?.addEventListener("input", () => {
    const shifts = parseShifts($("stShifts").value);
    const hint = $("stHoursHint");
    if (!hint) return;
    if (shifts === null) {
      hint.textContent = "Enter a number, 0 or more.";
      return;
    }
    hint.textContent = `= ${hoursFromShifts(shifts)} h`;
  });
  $("saveTask").onclick = () => {
    const resultUrl = $("stResult").value.trim();
    const studioStatus = $("stStatus").value;
    if (studioStatus !== t.studioStatus && !canSetStatus(studioStatus)) {
      toast("This role cannot set " + (STATUS[studioStatus]?.label || studioStatus));
      return;
    }
    if (studioStatus === "approve") {
      toast("Senior Approval is set only when you Send to client");
      return;
    }
    if (studioStatus === "done" && !resultUrl) {
      toast("Paste the result link before Done");
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
    updateTask(t.id, { ...patch, note }, { close: true });
  };
  $("exportOne")?.addEventListener("click", async () => {
    await sendToClient([t.id]);
    openTask(t.id);
  });
  $("ensureDrive")?.addEventListener("click", async () => {
    const out = await api("/api/drive/ensure", { id: t.id, month: state.month, role: me().role });
    if (out.error || !out.ok) {
      toast(out.error || "Could not create the Drive folder");
      if (out.state) applyState(out.state);
      return;
    }
    applyState(out.state);
    toast("Folder + brief on Drive");
    openTask(t.id);
  });
  $("copyOne")?.addEventListener("click", async () => {
    const pack = mondayReply(t);
    const ok = await copyText(pack);
    showPaste("Paste into Monday", "Already Senior Approval. Copy again into External Weekly.", pack);
    toast(ok ? "Copied Monday reply" : "Ready to copy");
  });
}

function closeDrawer() {
  $("drawerBg").classList.remove("show");
  state.openId = null;
}

async function updateTask(id, patch, opts = {}) {
  const out = await api("/api/tasks/update", { id, ...patch });
  if (out.error || !out.state) {
    toast(out.error || "Could not save");
    return;
  }
  applyState(out.state);
  toast("Saved");
  if (opts.close) {
    closeDrawer();
    return;
  }
  if (state.openId && $("drawerBg").classList.contains("show")) openTask(id);
}
async function importMonday() {
  const out = await api("/api/import-monday", { month: state.month, role: me().role });
  if (out.error || !out.state) {
    toast(out.error || "Could not pull from Monday");
    return;
  }
  applyState(out.state);
  toast(
    out.added
      ? `Pulled ${out.added} new from Monday${driveToast(out.drive)}`
      : "Nothing new"
  );
}
function driveToast(drive) {
  if (!drive) return "";
  if (drive.created) return ` · ${drive.created} Drive folder${drive.created === 1 ? "" : "s"} + brief`;
  if (drive.ready) return " · Drive folder + brief ready";
  if (drive.errors?.length) return " · Drive folder skipped";
  return "";
}
async function sendToClient(ids) {
  if (!canOps()) {
    toast("Only Line Producer can send to the client");
    return;
  }
  const picked = state.db.tasks.filter((t) => ids.includes(t.id));
  const ready = picked.filter(isSendable);
  if (!ready.length) {
    toast("Send only works on Done projects that have a result link");
    return;
  }
  const out = await api("/api/export-monday", { ids: ready.map((t) => t.id), role: me().role });
  if (out.error || !out.state) {
    toast(out.error || "Could not send");
    return;
  }
  applyState(out.state);
  const pack = (out.exported || []).map((row) => row.reply).join("\n\n");
  const ok = await copyText(pack);
  showPaste(
    "Paste into Monday",
    "Monday API is not connected yet. Paste this into External Weekly — status on our board is already Senior Approval.",
    pack
  );
  const skipped = picked.length - ready.length;
  const copied = out.exported?.length || ready.length;
  toast(
    (ok ? `Copied ${copied} Monday replies` : `Ready to copy ${copied} replies`) +
      (skipped ? ` · ${skipped} skipped (not Done)` : "")
  );
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
  state.finApi = null;
  state.finApiMonth = null;
  state.finApiLoading = null;
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
  const out = await api("/api/parse-email", { text: $("emailText").value, month: state.month, role: me().role });
  if (out.error || !out.state) {
    toast(out.error || "Could not parse email");
    return;
  }
  applyState(out.state);
  $("emailModal").classList.remove("show");
  toast(`Email: ${out.added} new, ${out.updated} shifts updated${driveToast(out.drive)}`);
};
$("drawerBg").addEventListener("click", (e) => {
  if (e.target === $("drawerBg")) closeDrawer();
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
