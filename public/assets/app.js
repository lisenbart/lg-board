const STATUS = {
  new: { label: "Ready to Start", cls: "status-new", order: 1 },
  wip: { label: "WIP", cls: "status-wip", order: 2 },
  revision: { label: "Need Fixing", cls: "status-revision", order: 3 },
  done: { label: "Done", cls: "status-done", order: 4 },
  approve: { label: "Senior Approval", cls: "status-approve", order: 5 },
  closed: { label: "Closed", cls: "status-closed", order: 6 },
};

const ROLE_LABEL = {
  finance: "Finance",
  manager: "Line Producer",
  teamlead: "Team Lead",
  designer: "Motion design",
  client: "Client",
};
const JOB_BADGE = {
  finance: { code: "FN", title: "Finance" },
  manager: { code: "LP", title: "Line Producer" },
  teamlead: { code: "TL", title: "Team Lead" },
  designer: { code: "MD", title: "Motion design" },
  client: { code: "SP", title: "Client" },
};
const TEAM_JOBS = [
  { id: "designer", label: "Motion design" },
  { id: "teamlead", label: "Team Lead" },
  { id: "manager", label: "Line Producer" },
  { id: "finance", label: "Finance" },
];

const NAME_WIDTH_KEY = "lg-name-width";
const NAME_WIDTH_DEFAULT = 412;
const NAME_WIDTH_MIN = 240;

const STATUS_BY_ROLE = {
  designer: ["wip", "done"],
  teamlead: ["new", "wip", "revision", "done"],
  manager: ["new", "wip", "revision", "done", "closed"],
  finance: ["new", "wip", "revision", "done", "closed"],
  client: [],
};
const LINES = ["DD", "DX", "DS"];

const MONTH_KEY = "lg-month";
const SESSION_KEY = "lg-session";
const FIN_GATE_KEY = "lg-fin-gate";

const ACCOUNTS = [
  {
    email: "dmytro@lisenbart.games",
    name: "Dmytro Lisenbart",
    blurb: "Studio",
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
  {
    email: "superplay@lg-board",
    name: "SuperPlay",
    blurb: "Hours report",
    lockRole: "client",
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
  driveTried: {},
};
const $ = (id) => document.getElementById(id);

function isLocalHost() {
  return location.hostname === "localhost" || location.hostname === "127.0.0.1";
}
function isStudioHost() {
  return (
    isLocalHost() ||
    document.documentElement.classList.contains("studio-host") ||
    window.__lgStudioApi === true
  );
}
function isClientPreview() {
  return !isStudioHost();
}
function probeStudioApi() {
  return fetch("/health", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (j && j.ok) {
        document.documentElement.classList.add("studio-host");
        window.__lgStudioApi = true;
      }
    })
    .catch(() => {});
}
function financeUnlocked() {
  if (isStudioHost()) return true;
  try {
    return sessionStorage.getItem(FIN_GATE_KEY) === "ok";
  } catch {
    return false;
  }
}
function setFinanceUnlocked() {
  try {
    sessionStorage.setItem(FIN_GATE_KEY, "ok");
  } catch {
    /* ignore */
  }
}
function financePinOk(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.length === 4 && Number(digits) === 0xcad;
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
  return state.db?.people || [];
}
function whoLabel(p) {
  if (p?.role === "finance") return p.name || "Dmytro Lisenbart";
  if (p?.role === "client") return p.name || "SuperPlay";
  return `${p.name} · ${jobMeta(p).code} ${jobMeta(p).title}`;
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
  if (isClientPreview() && !financeUnlocked()) return false;
  return me().role === "finance";
}
function isClient() {
  return me().role === "client";
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
function canWriteNotes() {
  return canOps() || isTeamLead();
}
function clientComments(t) {
  return Array.isArray(t?.comments) ? t.comments : [];
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
function roundHours(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return 0;
  return Math.round(x * 10) / 10;
}
function helpEntries(t) {
  const who = String(t?.assigneeId || "");
  const seen = new Set();
  const rows = [];
  for (const row of t?.help || []) {
    const id = String(row?.id || "").trim();
    const hours = roundHours(row?.hours);
    if (!id || id === who || hours <= 0 || seen.has(id)) continue;
    seen.add(id);
    rows.push({ id, hours });
  }
  return rows;
}
function helpHoursTotal(t) {
  return roundHours(helpEntries(t).reduce((s, row) => s + row.hours, 0));
}
function hoursOwned(t) {
  return Math.max(0, Math.round((hoursOf(t) - helpHoursTotal(t)) * 10) / 10);
}
function hoursForPerson(t, personId) {
  const id = String(personId || "");
  if (!id) return 0;
  if (id === String(t?.assigneeId || "")) return hoursOwned(t);
  return helpEntries(t).find((row) => row.id === id)?.hours || 0;
}
function helpedOn(t, personId) {
  return helpEntries(t).some((row) => row.id === personId);
}
function canEditHelp() {
  return canAssign() || canOps();
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
    const h = hoursOf(t);
    let allocated = 0;
    for (const p of crew()) {
      if (p.role === "manager" || !payMap[p.id]) continue;
      const share = hoursForPerson(t, p.id);
      if (share <= 0) continue;
      payMap[p.id].projects += 1;
      payMap[p.id].shifts += share / shiftHours();
      payMap[p.id].hours += share;
      payMap[p.id].tasks.push(t);
      allocated += share;
    }
    const leftover = Math.max(0, roundHours(h - allocated));
    if (leftover > 0.05) {
      unassignedHours += leftover;
      unassignedShifts += leftover / shiftHours();
      unassignedProjects += 1;
    }
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
    if (isDesigner() && t.assigneeId !== me().id && !helpedOn(t, me().id)) return false;
    if (!isDesigner() && state.designerFilter) {
      if (state.designerFilter === "unassigned") {
        if (t.assigneeId) return false;
      } else if (t.assigneeId !== state.designerFilter && !helpedOn(t, state.designerFilter)) return false;
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
          `<option value="${p.id}" ${p.id === state.roleId ? "selected" : ""}>${escapeHtml(whoLabel(p))}</option>`
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
        `<option value="${p.id}" ${p.id === state.roleId ? "selected" : ""}>${escapeHtml(whoLabel(p))}</option>`
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

function roleLine() {
  const p = me();
  const b = jobMeta(p);
  if (p.role === "designer") return `${b.code} ${b.title} · your queue · paste the result, then Done`;
  if (p.role === "teamlead") return `${b.code} ${b.title} · assign people · your own tasks like MD`;
  if (p.role === "manager") return `${b.code} ${b.title} · hours · Send to client after Done`;
  if (p.role === "finance") return `${b.code} ${b.title} · studio money`;
  if (p.role === "client") return `Hours this month · the list invoices are based on`;
  return "";
}

function renderChrome() {
  $("financeNav").hidden = !isFinance();
  if ($("inboxWrap")) $("inboxWrap").hidden = isClient();
  renderMonth();
  const meta = state.db?.meta || {};
  const brand = $("brandMode");
  if (brand) {
    if (meta.mode === "mirror") {
      brand.textContent = meta.bufferDirty
        ? "Mirror · clicks in this browser"
        : "Mirror · live snapshot";
    } else {
      brand.textContent = "";
    }
  }
  const hint = roleLine();
  if (meta.mode === "mirror") {
    $("roleHint").textContent = meta.bufferDirty
      ? `${hint} · Reset to live throws away clicks here. Core Excel / October Drive stay untouched.`
      : `${hint} · live people, hours, money. Clicks stay in a buffer.`;
  } else {
    $("roleHint").textContent = hint;
  }
  $("sideFoot").innerHTML = "";

  const tabs = [];
  if (isClient()) {
    tabs.push({ id: "report", label: "Hours" });
  } else {
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
    tabs.push({ id: "guide", label: "Як це працює" });
  }
  if (!tabs.some((t) => t.id === state.view)) state.view = isClient() ? "report" : "board";
  if (tabs.length <= 1) {
    $("views").innerHTML = "";
    $("views").hidden = true;
  } else {
    $("views").hidden = false;
    $("views").innerHTML = tabs
      .map(
        (t) =>
          `<button type="button" class="view-tab ${state.view === t.id ? "active" : ""}" data-view="${t.id}" role="tab" aria-selected="${state.view === t.id ? "true" : "false"}">${t.label}</button>`
      )
      .join("");
    $("views").querySelectorAll(".view-tab").forEach((el) => {
      el.addEventListener("click", () => {
        state.view = el.dataset.view;
        render();
      });
    });
  }
}

function renderToolbar() {
  if (state.view === "team" || state.view === "close" || state.view === "guide") {
    $("toolbar").innerHTML = "";
    return;
  }
  if (state.view === "report") {
    $("toolbar").innerHTML = `<input class="search" placeholder="Search project" />`;
    $("toolbar").querySelector(".search")?.addEventListener("input", render);
    return;
  }
  if (state.view === "excel") {
    const drive = state.db?.meta?.driveLiveExcel || state.db?.meta?.driveSandboxExcel || "";
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
      <button class="btn ghost" id="btnReset">Reset to live</button>
    `;
  }
  $("toolbar").querySelector(".search")?.addEventListener("input", render);
  $("btnImport")?.addEventListener("click", importMonday);
  $("btnEmail")?.addEventListener("click", () => $("emailModal").classList.add("show"));
  $("btnExport")?.addEventListener("click", exportMonday);
  $("btnReset")?.addEventListener("click", resetDemo);
}

function renderKpis() {
  if (state.view === "close" || state.view === "team" || state.view === "guide" || state.view === "report") {
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
function avatarHtml(p, name) {
  const inner = p?.avatarStar ? "🌟" : escapeHtml(initials(name || displayName(p)));
  return `<span class="avatar${p?.avatarStar ? " is-star" : ""}" style="background:${p?.color || "#c5c7d0"}">${inner}</span>`;
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
  return `<span class="person">${avatarHtml(p)}${escapeHtml(displayName(p))}${jobBadgeHtml(p)}</span>`;
}
function whoCell(t) {
  const base = personCell(t.assigneeId);
  const help = helpEntries(t);
  if (!help.length) return base;
  const names = help.map((row) => person(row.id)?.name || row.id).join(", ");
  return `${base}<small class="help-mark" title="${escapeHtml(names)}">+${help.length}</small>`;
}
function normalizeDriveFolder(url) {
  const raw = String(url || "");
  const open = raw.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/i);
  if (open) return `https://drive.google.com/drive/folders/${open[1]}`;
  const fold = raw.match(/https:\/\/drive\.google\.com\/drive\/folders\/[a-zA-Z0-9_-]+/i);
  return fold ? fold[0] : "";
}
function driveFolderIn(text) {
  return normalizeDriveFolder(text);
}
function labeledWorkFolder(text) {
  const m = String(text || "").match(
    /(?:working folder|pls work here|please work here|work here|pls work)[:\s]*\n*(https:\/\/drive\.google\.com\/(?:drive\/folders\/|open\?id=)[a-zA-Z0-9_-]+)/i
  );
  return m ? normalizeDriveFolder(m[1]) : "";
}
function workFolder(t) {
  return labeledWorkFolder(t?.brief) || String(t?.folderUrl || "").trim();
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
function parseBrief(t) {
  const raw = String(t?.brief || "").trim();
  const urls = raw.match(/https?:\/\/[^\s)<>"]+/gi) || [];
  const fileUrl =
    urls.find((u) => /\/file\//i.test(u) || /\.(mp4|mov|mkv)(\?|$)/i.test(u)) || "";
  const downloads = [
    ...raw.matchAll(/download\s*[-–—:]?\s*(\S+\.(?:mp4|mov|mkv))/gi),
  ].map((m) => m[1]);
  return { raw, fileUrl, downloads };
}
function linkifyBrief(text) {
  return escapeHtml(text).replace(
    /(https:\/\/[^\s<]+)/g,
    '<a class="pin-link" href="$1" target="_blank" rel="noreferrer">$1</a>'
  );
}
function pinHtml(t) {
  const raw = String(t?.brief || "").trim();
  const body = raw
    ? `<div class="pin-body">${linkifyBrief(raw)}</div>`
    : `<div class="pin-body is-empty">No brief from Monday yet</div>`;
  const work = workFolder(t);
  const briefBtn = t.docUrl
    ? `<a class="btn pack-brief" href="${escapeHtml(t.docUrl)}" target="_blank" rel="noreferrer">Open brief</a>`
    : "";
  const folderBtn = work
    ? `<a class="btn pack-folder" href="${escapeHtml(work)}" target="_blank" rel="noreferrer">Open folder</a>`
    : "";
  const actions = briefBtn || folderBtn
    ? `<footer class="pin-actions">${briefBtn}${folderBtn}</footer>`
    : "";
  return `<article class="pin">
      <header class="pin-head">Brief</header>
      ${body}
      ${actions}
    </article>`;
}
function driveFileId(url) {
  const text = String(url || "");
  const file = text.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (file) return file[1];
  const id = text.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  return id ? id[1] : "";
}
function shotThumb(url) {
  const id = driveFileId(url);
  if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w480`;
  if (/\.(?:png|jpe?g|gif|webp|bmp)(?:\?|$)/i.test(url)) return url;
  return "";
}
function commentWhen(at) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function shotSrc(a) {
  const url = String(a?.url || "");
  if (url.startsWith("data:image") || url.includes("/api/comment-file")) return url;
  if (a?.kind === "image") return shotThumb(url) || url;
  return shotThumb(url);
}
function isShot(a) {
  const url = String(a?.url || "");
  return a?.kind === "image" || url.startsWith("data:image") || url.includes("/api/comment-file") || Boolean(shotThumb(url));
}
function closeShot() {
  const box = $("shotBox");
  if (!box) return;
  box.hidden = true;
  const img = box.querySelector("img");
  if (img) img.removeAttribute("src");
}
function projectRoot(t) {
  const m = String(t?.name || "").trim().match(/^([A-Z]{2}-[A-Z0-9]+-\d+(?:-\d+)?)/i);
  const raw = (m ? m[1].toUpperCase() : String(t?.id || "SHOT")).replace(/[^A-Z0-9-]/g, "");
  return raw || "SHOT";
}
function allShotAtts(t) {
  const out = [];
  for (const row of clientComments(t)) {
    for (const att of row.attachments || []) {
      if (isShot(att)) out.push(att);
    }
  }
  return out;
}
function shotFileName(t, att) {
  if (att?.name) return att.name;
  const shots = allShotAtts(t);
  const total = shots.length;
  const index = Math.max(1, shots.indexOf(att) + 1);
  const extMatch = String(att?.url || "").match(/\.(png|jpe?g|gif|webp)(?:\?|$)/i);
  const ext = (extMatch ? extMatch[1] : "png").toLowerCase().replace("jpeg", "jpg");
  const root = projectRoot(t);
  if (total <= 1) return `${root}.${ext}`;
  return `${root}_${String(index).padStart(2, "0")}.${ext}`;
}
function openShot(src, name) {
  if (!src) return;
  let box = $("shotBox");
  if (!box) {
    box = document.createElement("div");
    box.id = "shotBox";
    box.className = "shot-box";
    box.hidden = true;
    box.innerHTML = `<button type="button" class="shot-box-x" aria-label="Close">×</button><a class="shot-box-dl" download>Download</a><img alt="Screenshot">`;
    document.body.appendChild(box);
    box.querySelector(".shot-box-x").addEventListener("click", (e) => {
      e.stopPropagation();
      closeShot();
    });
    box.addEventListener("click", (e) => {
      if (e.target === box) closeShot();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !box.hidden) closeShot();
    });
  }
  const file = name || "screenshot.png";
  const img = box.querySelector("img");
  const dl = box.querySelector(".shot-box-dl");
  img.alt = file;
  img.src = src;
  if (dl) {
    dl.href = src;
    dl.download = file;
    dl.textContent = file;
  }
  box.hidden = false;
}
function notesShotsHtml(row) {
  const files = (row.attachments || []).filter((a) => a?.url);
  if (!files.length) return "";
  return `<div class="notes-shots">${files
    .map((a, i) => {
      if (isShot(a)) {
        return `<button type="button" class="notes-shot" data-comment="${escapeHtml(row.id || "")}" data-i="${i}">
          <img alt="Screenshot" />
        </button>`;
      }
      return `<a class="pin-link" href="${escapeHtml(a.url)}" target="_blank" rel="noreferrer">Open link</a>`;
    })
    .join("")}</div>`;
}
function bindNoteShots(t) {
  $("drawer")?.querySelectorAll(".notes-shot").forEach((btn) => {
    const comment = clientComments(t).find((row) => row.id === btn.dataset.comment);
    const att = (comment?.attachments || [])[Number(btn.dataset.i)];
    const src = shotSrc(att) || att?.url || "";
    const img = btn.querySelector("img");
    const file = shotFileName(t, att);
    if (img && src) {
      img.src = src;
      img.alt = file;
      img.addEventListener("error", () => btn.remove());
    }
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openShot(img?.currentSrc || img?.src || src, file);
    });
  });
}
function notesHtml(t) {
  const rows = clientComments(t);
  const canWrite = canWriteNotes();
  if (!rows.length && !canWrite) return "";
  const items = rows
    .map(
      (row) => `<article class="notes-item" data-id="${escapeHtml(row.id || "")}">
        <header class="notes-meta">
          <strong>${escapeHtml(row.authorName || person(row.authorId)?.name || "Client")}</strong>
          <span>${escapeHtml(commentWhen(row.at))}${row.source === "monday" ? " · Monday" : ""}</span>
          ${
            canWrite && row.source !== "monday" && row.id
              ? `<button type="button" class="notes-del" data-id="${escapeHtml(row.id)}" aria-label="Remove note">×</button>`
              : ""
          }
        </header>
        <div class="notes-body">${linkifyBrief(row.body || "")}</div>
        ${notesShotsHtml(row)}
      </article>`
    )
    .join("");
  const composer = canWrite
    ? `<div class="notes-compose" id="stCommentBox">
        <textarea id="stComment" rows="3" placeholder="Paste client text, or paste / drop a screenshot"></textarea>
        <div class="notes-shots" id="stCommentShots"></div>
        <p class="io-hint">Brief stays as is. Paste a screenshot (Ctrl+V) or attach a file. Links still work.</p>
        <div class="notes-compose-actions">
          <label class="btn ghost" for="stCommentFiles">Attach screenshot</label>
          <input id="stCommentFiles" type="file" accept="image/*" multiple hidden />
          <button class="btn" type="button" id="addNote">Add note</button>
        </div>
      </div>`
    : "";
  return `<section class="notes${rows.length ? "" : " is-empty"}">
      <header class="notes-head">Client notes</header>
      ${items || (canWrite ? `<p class="notes-empty">No client notes yet</p>` : "")}
      ${composer}
    </section>`;
}
function sourceHtml(t) {
  const parts = parseBrief(t);
  const videoBtn = parts.fileUrl
    ? `<a class="btn pack-brief" href="${escapeHtml(parts.fileUrl)}" target="_blank" rel="noreferrer">Open video</a>`
    : "";
  const files = parts.downloads
    .map((f) => `<span class="file-chip">${escapeHtml(f)}</span>`)
    .join("");
  if (!videoBtn && !files) return "";
  return `<section class="io io-source">
      <h3>Source</h3>
      ${videoBtn}${files ? `<div class="file-row">${files}</div>` : ""}
    </section>`;
}
function resultHtml(t, performer, canPaste) {
  if (!showResultField(t)) return "";
  const body = canPaste
    ? `<input id="stResult" value="${escapeHtml(t.resultUrl || "")}" placeholder="Paste finished file link" />
        <p class="io-hint">${performer ? "The file, not the folder." : "Needed before Send to client."}</p>`
    : t.resultUrl
      ? `<a class="pin-link" href="${escapeHtml(t.resultUrl)}" target="_blank" rel="noreferrer">Open result</a>`
      : `<p class="io-empty">Waiting for ${escapeHtml(person(t.assigneeId)?.name || "designer")}</p>`;
  return `<section class="io io-result${performer ? " is-focus" : ""}">
      <h3>Result</h3>
      ${body}
    </section>`;
}
function hasDriveDoc(t) {
  return Boolean(String(t?.docUrl || "").trim());
}
function hasDriveFolder(t) {
  return Boolean(workFolder(t));
}
function cardJob(t) {
  const role = me().role;
  const mine = t.assigneeId === me().id;
  const hasResult = Boolean(String(t.resultUrl || "").trim());
  const who = person(t.assigneeId);
  const name = who ? displayName(who) : "";
  if (role === "designer") {
    if (!mine && helpedOn(t, me().id)) {
      const share = hoursForPerson(t, me().id);
      return {
        tone: "ok",
        title: "You helped",
        body: `${share}h studio pay on this task. ${name || "Who"} still owns Done.`,
      };
    }
    if (t.studioStatus === "closed") {
      return { tone: "ok", title: "Closed", body: "Client accepted. This task is finished." };
    }
    if (t.studioStatus === "approve") {
      return { tone: "ok", title: "Sent to client", body: "LP already sent this. Nothing else on this card." };
    }
    if (t.studioStatus === "done") {
      return { tone: "wait", title: "Waiting for LP", body: "Result is in. Line Producer sends it to the client." };
    }
    if (t.studioStatus === "revision") {
      return {
        tone: "fix",
        title: "Need Fixing",
        body: clientComments(t).length
          ? "Client notes are under the brief. Fix, paste the new result link, then Done."
          : "Fix the work, paste the new result link, then Done.",
      };
    }
    if (!hasResult) {
      return {
        tone: "do",
        title: "Your job",
        body: "Open the brief, work in the folder, paste the finished-file link, then Done.",
      };
    }
    return { tone: "do", title: "Mark Done", body: "Result link is in. Set Done and Save." };
  }
  if (role === "teamlead") {
    if (!t.assigneeId) {
      return { tone: "do", title: "Your job", body: "Assign a designer. They see it in their queue after Save." };
    }
    if (mine && t.studioStatus !== "done" && t.studioStatus !== "approve" && t.studioStatus !== "closed") {
      if (t.studioStatus === "revision") {
        return { tone: "fix", title: "This is your work · Need Fixing", body: "Fix, paste the new result link, then Done." };
      }
      if (!hasResult) {
        return { tone: "do", title: "This is your work", body: "Same as MD: paste the result link, then Done." };
      }
      return { tone: "do", title: "Mark Done", body: "Result link is in. Set Done and Save." };
    }
    if (t.studioStatus === "done") {
      return { tone: "wait", title: "Waiting for LP", body: `${name || "Designer"} finished. You cannot Send to client — that is LP.` };
    }
    if (t.studioStatus === "closed") {
      return { tone: "ok", title: "Closed", body: "Client accepted. This task is finished." };
    }
    if (t.studioStatus === "approve") {
      return { tone: "ok", title: "Sent to client", body: "Nothing else on this card." };
    }
    if (t.studioStatus === "revision") {
      return { tone: "fix", title: "Need Fixing", body: `${name || "Designer"} must fix and paste a new result.` };
    }
    return { tone: "wait", title: "Assigned", body: `${name || "They"} work this. Reassign here if the person is wrong.` };
  }
  if (t.studioStatus === "closed") {
    return { tone: "ok", title: "Closed", body: "Client accepted. Hours stay on this month." };
  }
  if (t.studioStatus === "approve") {
    return { tone: "ok", title: "Already sent", body: "Copy the Monday reply if External Weekly still needs it. Mark Closed when the client accepts." };
  }
  if (t.studioStatus === "done" && hasResult) {
    return { tone: "do", title: "Your job", body: "Result is in. Send to client — that sets Senior Approval." };
  }
  if (!t.assigneeId) {
    return { tone: "wait", title: "Waiting for TL", body: "Set hours if needed. Team Lead assigns. You send only after Done." };
  }
  if (t.studioStatus === "revision") {
    return { tone: "wait", title: "In Need Fixing", body: `${name || "Designer"} is fixing. Send only after they mark Done again.` };
  }
  return {
    tone: "wait",
    title: "In progress",
    body: `${name || "Designer"} is on this. Send only when status is Done and the result link is pasted.`,
  };
}
function showResultField(t) {
  if (String(t.resultUrl || "").trim()) return true;
  if (t.assigneeId === me().id && (isDesigner() || isTeamLead())) return true;
  if (canOps() && t.studioStatus !== "new") return true;
  return false;
}
function fillDrivePackIfMissing(t) {
  if (!isStudioHost() || !canOps()) return;
  if ((hasDriveDoc(t) && hasDriveFolder(t)) || state.driveTried[t.id]) return;
  state.driveTried[t.id] = true;
  api("/api/drive/ensure", { id: t.id, month: state.month, role: me().role }).then((out) => {
    if (out.state) applyState(out.state);
    if (out.ok && state.openId === t.id) openTask(t.id);
  });
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
  if (
    isClient() ||
    isDesigner() ||
    state.view === "close" ||
    state.view === "team" ||
    state.view === "excel" ||
    state.view === "guide" ||
    state.view === "report"
  ) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  const people = designers();
  const tasks = monthTasks();
  const rows = people.map((p) => {
    const mine = tasks.filter((t) => hoursForPerson(t, p.id) > 0);
    const hours = mine.reduce((s, t) => s + hoursForPerson(t, p.id), 0);
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
function parseDeadlineIso(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const dmy = s.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/);
  if (!dmy) return "";
  const year = dmy[3]
    ? dmy[3].length === 2
      ? `20${dmy[3]}`
      : dmy[3]
    : String(state.month || "").slice(0, 4) || "2026";
  return `${year}-${String(dmy[2]).padStart(2, "0")}-${String(dmy[1]).padStart(2, "0")}`;
}
function deadlineMark(t) {
  const iso = parseDeadlineIso(t.deadline);
  if (!iso) return { cls: "none", iso: "", label: "—", title: "No deadline", fill: 0 };
  const due = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(due.getTime())) return { cls: "none", iso: "", label: "—", title: "No deadline", fill: 0 };
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const start = new Date(`${t.month || state.month}-01T12:00:00`);
  const span = Math.max(1, due - start);
  const fill = Math.max(0, Math.min(1, (today - start) / span));
  const days = Math.round((due - today) / 86400000);
  const label = excelDate(iso);
  if (t.studioStatus === "closed") return { cls: "closed", iso, label, title: "Closed", fill };
  if (days < 0) return { cls: "late", iso, label, title: `${-days}d late`, fill: 1 };
  if (days === 0) return { cls: "soon", iso, label, title: "Due today", fill };
  if (days <= 2) return { cls: "soon", iso, label, title: `${days}d left`, fill };
  return { cls: "ok", iso, label, title: `${days}d left`, fill };
}
function dueCell(t) {
  const d = deadlineMark(t);
  return `<div class="due due-${d.cls}" title="${escapeHtml(d.title)}"><span>${escapeHtml(d.label)}</span><i class="due-bar" aria-hidden="true"><b style="width:${Math.round(d.fill * 100)}%"></b></i></div>`;
}

function fmtHours(n) {
  if (n === "" || n == null || Number.isNaN(Number(n))) return "";
  return Number(n).toFixed(1).replace(".", ",");
}

function fmtReportNum(n, digits) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  const rounded = Math.round(x * 10 ** digits) / 10 ** digits;
  return String(rounded);
}

function reportSections(tasks) {
  const lines = ["DX", "DD"];
  if (tasks.some((t) => t.line === "DS")) lines.push("DS");
  return lines.map((line) => {
    const rows = tasks
      .filter((t) => t.line === line)
      .slice()
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return {
      line,
      label: line === "DS" ? "Playables DS" : `MGX ${line}`,
      rows,
      shifts: rows.reduce((s, t) => s + (Number(t.shifts) || 0), 0),
      hours: rows.reduce((s, t) => s + hoursOf(t), 0),
    };
  });
}

function renderClientReport() {
  const q = (document.querySelector(".search")?.value || "").toLowerCase();
  const all = monthTasks();
  const tasks = all
    .filter((t) => !q || String(t.name || "").toLowerCase().includes(q))
    .slice()
    .sort((a, b) => String(a.line).localeCompare(String(b.line)) || String(a.name).localeCompare(String(b.name)));
  const year = String(state.month || "").slice(0, 4) || "2026";
  if (!all.length) {
    $("board").innerHTML = `<div class="sp-empty">No projects in ${escapeHtml(monthLabel(state.month))}.</div>`;
    return;
  }
  if (!tasks.length) {
    $("board").innerHTML = `<div class="sp-empty">No projects match.</div>`;
    return;
  }
  const sections = reportSections(tasks);
  const totalHours = sections.reduce((s, sec) => s + sec.hours, 0);
  const totalShifts = sections.reduce((s, sec) => s + sec.shifts, 0);
  const totalProjects = sections.reduce((s, sec) => s + sec.rows.length, 0);
  const body = sections
    .map((sec) => {
      const rows = sec.rows
        .map(
          (t) => `<tr class="sp-row">
            <td class="sp-name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</td>
            <td class="sp-num">${fmtReportNum(t.shifts, 3)}</td>
            <td class="sp-num">${fmtReportNum(hoursOf(t), 1)}</td>
            <td></td>
          </tr>`
        )
        .join("");
      return `<tr class="sp-sec">
          <th>${escapeHtml(sec.label)}</th>
          <th></th>
          <th></th>
          <th class="sp-num">${fmtReportNum(sec.hours, 1)}</th>
        </tr>${rows}`;
    })
    .join("");
  $("board").innerHTML = `
    <section class="sp-report">
      <header class="sp-head">
        <h2>Hours report</h2>
        <p>Every task billed in ${escapeHtml(monthLabel(state.month))}. PROJECT NAME / SHIFTS / HOURS — the same list the invoices are based on.</p>
      </header>
      <div class="sp-kpis">
        <div class="kpi"><b>${totalProjects}</b><span>projects</span></div>
        <div class="kpi"><b>${fmtReportNum(totalShifts, 1)}</b><span>shifts</span></div>
        <div class="kpi"><b>${fmtReportNum(totalHours, 1)} h</b><span>hours</span></div>
      </div>
      <div class="sp-sheet">
        <div class="sp-scroll">
          <table class="sp-table">
            <thead>
              <tr>
                <th class="sp-name">${escapeHtml(year)} PROJECT NAME</th>
                <th>SHIFTS</th>
                <th>HOURS</th>
                <th class="sp-sum-h"></th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
            <tfoot>
              <tr class="sp-gap"><td colspan="4"></td></tr>
              <tr class="sp-total">
                <td>TOTAL</td>
                <td></td>
                <td class="sp-num">${fmtReportNum(totalHours, 1)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>`;
}

function renderExcelSheet() {
  const people = designers();
  const q = (document.querySelector(".search")?.value || "").toLowerCase();
  const tasks = monthTasks()
    .filter((t) => !q || `${t.name} ${t.brief}`.toLowerCase().includes(q))
    .slice()
    .sort((a, b) => String(a.line).localeCompare(String(b.line)) || String(a.name).localeCompare(String(b.name)));
  const hoursOfPerson = (personId) =>
    tasks.reduce((s, t) => s + hoursForPerson(t, personId), 0);
  const allHours = tasks.reduce((s, t) => s + (Number(t.hours) || 0), 0);
  const allShifts = tasks.reduce((s, t) => s + (Number(t.shifts) || 0), 0);
  const nameHeads = people.map((p) => `<th class="xl-person">${escapeHtml(p.name)}</th>`).join("");
  const emplHeads = people.map((_, i) => `<th>EMPL ${i + 1}</th>`).join("");

  const rowHtml = (t) => {
    const cells = people
      .map((p) => {
        const share = hoursForPerson(t, p.id);
        const mine = share > 0;
        const h = mine ? fmtHours(share) : "";
        const style = mine ? `style="background:${p.color}"` : "";
        return `<td class="${mine ? "xl-fill" : ""}" ${style}>${h}</td>`;
      })
      .join("");
    const mark = statusMark(t);
    return `<tr class="xl-row${t.studioStatus === "closed" ? " is-closed" : ""}" data-id="${t.id}">
      <td class="xl-st st-${mark.cls}" title="${escapeHtml(mark.title)}">${escapeHtml(mark.label)}</td>
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
        <th class="xl-line">${line}</th><th>MGX</th><th>SHIFTS</th><th>HOURS</th><th>DEADLINE</th>${empl}
      </tr>
      ${rows.map(rowHtml).join("")}
    </tbody>`;
  };

  const totals = people.map((p) => `<td class="xl-num"><b>${fmtHours(hoursOfPerson(p.id))}</b></td>`).join("");

  $("board").innerHTML = `
    <section class="xl-wrap">
      <div class="xl-scroll">
        <table class="xl-table">
          <thead>
            <tr>
              <th class="xl-st-h"></th>
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

function ui(name) {
  return `<b class="ui">${escapeHtml(name)}</b>`;
}
function renderGuide() {
  const role = me()?.role;
  const card = (id, badge, title, who, steps) => `
    <article class="guide-card${role === id ? " is-you" : ""}">
      <header>
        <span class="job-badge job-${escapeHtml(badge.toLowerCase())}">${escapeHtml(badge)}</span>
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(who)}</p>
        </div>
        ${role === id ? `<em>Ти зараз тут</em>` : ""}
      </header>
      <ol>${steps.map((s) => `<li>${s}</li>`).join("")}</ol>
    </article>`;
  const chip = (cls, label) => `<span class="notice-chip notice-${cls}">${label}</span>`;
  const statusCard = (cls, short, full, who, meaning) => `
    <article class="guide-status">
      ${chip(cls, short)}
      <strong>${escapeHtml(full)}</strong>
      <p>${meaning}</p>
      <small>${who}</small>
    </article>`;
  const pipeStep = (n, badge, who, title, body, cls, short) => `
    <li class="guide-pipe-step">
      <span class="guide-pipe-n">${n}</span>
      <div class="guide-pipe-body">
        <header>
          <span class="job-badge job-${escapeHtml(badge.toLowerCase())}">${escapeHtml(badge)}</span>
          <b>${escapeHtml(who)}</b>
          <span>${escapeHtml(title)}</span>
        </header>
        <p>${body}</p>
      </div>
      <div class="guide-pipe-out">
        <small>статус стає</small>
        ${chip(cls, short)}
      </div>
    </li>`;
  $("board").innerHTML = `
    <section class="guide">
      <div class="guide-intro">
        <h2>Як працює LG Board</h2>
        <p>Monday лишається у клієнта. Тут — черга студії, години і здача. Чіп біля назви — статус проєкту. ${ui("Send to client")} — кнопка LP, не бейдж. Підписи кнопок англійською — як на екрані.</p>
      </div>
      <div class="guide-block">
        <h3>Статуси</h3>
        <p class="guide-lead">Один чіп на проєкт. Читай зверху вниз: що означає і хто з ним працює.</p>
        <div class="guide-status-grid">
          ${statusCard("ready", "Ready", "Ready to Start", "Хто: TL ставить виконавця", "Таск щойно зайшов з Monday або з листа. Людини ще немає — чекає старту.")}
          ${statusCard("wip", "WIP", "WIP", "Хто: MD робить роботу", "Виконавець уже стоїть. Робота йде. Файл ще не зданий.")}
          ${statusCard("fix", "Fix", "Need Fixing", "Хто: MD править", "Клієнт або LP відбили. Не Done — треба правка, потім знову здати.")}
          ${statusCard("done", "Done", "Done", "Хто: MD здав, далі LP", "Дизайнер вставив лінк результату і натиснув Done. Без лінка цей статус не ставиться.")}
          ${statusCard("appr", "Appr.", "Senior Approval", "Хто: чекаємо клієнта", "LP натиснув Send to client. Текст для Monday скопійовано. Ще не Closed.")}
          ${statusCard("closed", "Closed", "Closed", "Хто: LP після відповіді клієнта", "Клієнт прийняв. Години лишаються, роботи більше немає.")}
        </div>
      </div>
      <div class="guide-block">
        <h3>Пайплайн</h3>
        <p class="guide-lead">П’ять кроків підряд. Кожен крок змінює чіп справа.</p>
        <ol class="guide-pipe">
          ${pipeStep("1", "LP", "Line Producer", "Таск заходить", `${ui("Pull from Monday")} або ${ui("Shift email")} (рядок як в Orit: NAME | 0.3 shifts).`, "ready", "Ready")}
          ${pipeStep("2", "TL", "Team Lead", "Ставить виконавця", `${ui("Who works this")} → ${ui("Save")}. Людина одразу бачить таск у своїй черзі.`, "wip", "WIP")}
          ${pipeStep("3", "MD", "Motion design", "Здає файл", `${ui("Paste result link here")}, потім ${ui("Done")}. Лінк на файл, не на теку. Поки лінка немає — ${ui("Done")} недоступний.`, "done", "Done")}
          ${pipeStep("4", "LP", "Line Producer", "Відправляє клієнту", `${ui("Send to client")} лише з ${ui("Done")} + лінк. Копіює текст для External Weekly. ${ui("Appr.")} руками зі списку не ставиться.`, "appr", "Appr.")}
          ${pipeStep("5", "LP", "Line Producer", "Клієнт прийняв", `${ui("Mark Closed")} після ${ui("Appr.")}. Якщо відбили — ${ui("Need Fixing")}, чіп ${chip("fix", "Fix")}, MD знову крок 3.`, "closed", "Closed")}
        </ol>
      </div>
      <div class="guide-grid">
        ${card("manager", "LP", "Line Producer", "Анастасія. Бачить усе.", [
          `Новий пак: ${ui("Pull from Monday")} або ${ui("Shift email")} (рядок як в Orit: NAME | 0.3 shifts).`,
          `Бриф на картці — 1:1 як у Monday Doc. Не змінюється. ${ui("Client notes")} одразу під ним: встав текст і скрін (Ctrl+V) з Monday.`,
          `Години: ${ui("Shifts")} у рядку або в картці. 1 shift = 9 годин. Виконавця ставить TL.`,
          `Рядок фарбується за статусом. Чіп: ${ui("Ready")} / ${ui("WIP")} / ${ui("Fix")} / ${ui("Done")} / ${ui("Appr.")} / ${ui("Closed")}. Не ${ui("Send")}.`,
          `${ui("Excel")} — години як у файлі. Чіп зліва той самий, що в пайплайні, не лише WIP/Closed. ${ui("Due")} = ${ui("DEADLINE")}.`,
          `${ui("Send to client")} лише з ${ui("Done")} + лінк файлу. Копіює текст у External Weekly. ${ui("Appr.")} сам не ставиться.`,
          `${ui("Mark Closed")} після ${ui("Appr.")}, коли клієнт прийняв. Темно-зелений штамп, білий напис — не той самий колір, що ${ui("Done")}. Якщо відбили — ${ui("Need Fixing")}.`,
          `${ui("Hours split")} на картці: клієнтські години не ростуть. 0.5h тому, хто відрендерив замість колеги. Who лишається власником ${ui("Done")}.`,
        ])}
        ${card("teamlead", "TL", "Team Lead", "Настя. Усі проєкти + свої як виконавця.", [
          `Дзвіночок ${ui("New")} — нові без людини. Картка каже ${ui("Assign a designer")} — це твоя робота, не URL і не Done.`,
          `Прочитай бриф, ${ui("Open brief")} якщо треба Doc. ${ui("Who works this")} → ${ui("Save")}. Людина одразу бачить таск у себе.`,
          `Свої таски — як MD: ${ui("Paste result link here")}, потім ${ui("Done")}.`,
          `${ui("Hours split")} — якщо хтось відрендерив чужий файл, постав 0.5h (або скільки чесно). Клієнту години ті самі.`,
          `${ui("Excel")} — години як у ${ui("SP_MGX_check")}. Чіп зліва той самий, що в пайплайні: ${ui("WIP")} / ${ui("Fix")} / ${ui("Done")} / ${ui("Appr.")} / ${ui("Closed")}. ${ui("Send to client")} і ${ui("Closed")} у TL немає — це LP.`,
        ])}
        ${card("designer", "MD", "Motion design", "Марія, Сергій, Аліна, Олекса. Лише свої таски.", [
          `Дзвіночок ${ui("On you")} — тебе поставили. ${ui("Fix")} — ${ui("Need Fixing")}.`,
          `Картка: ${ui("Brief")} → ${ui("Client notes")} (якщо клієнт написав) → ${ui("Source")} → ${ui("Result")}. Бриф не міняється.`,
          `Зробив → ${ui("Paste result link here")} (лінк на файл, не на теку). Поки лінка немає, ${ui("Done")} у статусі немає.`,
          `Потім ${ui("Done")} → ${ui("Save")}. Далі чекає LP. ${ui("Appr.")} — уже в клієнта. ${ui("Closed")} — прийнято, нічого не робити.`,
          `Якщо відрендерив чужий таск — TL/LP ставить тобі години в ${ui("Hours split")}. Таск з’явиться в твоїй черзі як help, ${ui("Done")} лишається в Who.`,
        ])}
        ${card(
          "client",
          "SP",
          "SuperPlay",
          "Клієнт. Своя сторінка годин, без черги студії.",
          [
            `Сидіння ${ui("SuperPlay")} відкриває ${ui("Hours")} — усі таски місяця як у ${ui("SP-LG_projects")}: ${ui("PROJECT NAME")} / ${ui("SHIFTS")} / ${ui("HOURS")}.`,
            `Секції ${ui("MGX DX")} і ${ui("MGX DD")}, сума годин справа від заголовка, ${ui("TOTAL")} знизу. Це той самий список, на якому стоять інвойси.`,
            `Місяць перемикається стрілками зверху. Імен виконавців, ставок і карток тут немає.`,
          ]
        )}
      </div>
      <div class="guide-notes">
        <div>
          <h3>Дзвіночок</h3>
          <p>${ui("New")} нові · ${ui("On you")} тебе поставили · ${ui("Fix")} правки · ${ui("Send")} час клієнту (це inbox LP, не чіп рядка). Відкрив картку — позначка зникла. Telegram пізніше, якщо треба пінг коли немає світла.</p>
        </div>
        <div>
          <h3>Excel</h3>
          <p>Місяць як ${ui("SP_MGX_check")}. Зліва жирні ${ui("DX")} / ${ui("DD")}, у тій клітинці чіп проєкту: ${ui("Ready")} / ${ui("WIP")} / ${ui("Fix")} / ${ui("Done")} / ${ui("Appr.")} / ${ui("Closed")}. ${ui("DEADLINE")} у файлі = ${ui("Due")} на пайплайні. ${ui("Send")} там немає.</p>
        </div>
        <div>
          <h3>Правила</h3>
          <ol>
            <li>${ui("Done")} без вставленого лінка на результат — неможливо.</li>
            <li>${ui("Send to client")} лише з ${ui("Done")}. Не з ${ui("Ready")} і не з ${ui("WIP")}.</li>
            <li>${ui("Appr.")} ставить тільки ${ui("Send to client")}, не руками зі списку.</li>
            <li>${ui("Closed")} ставить LP після ${ui("Appr.")}, коли клієнт прийняв. Не з ${ui("Done")} і не замість Send.</li>
          </ol>
        </div>
      </div>
    </section>`;
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
  if (state.view === "guide") {
    renderGuide();
    return;
  }
  if (state.view === "report") {
    renderClientReport();
    return;
  }
  const exec = isExecView();
  let tasks = visibleTasks();
  if (state.view === "ready") tasks = tasks.filter((t) => t.studioStatus === "done");
  tasks = sortedTasks(tasks);
  const mode = exec ? "exec" : "ops";
  const frozenHead =
    mode === "ops"
      ? `<div class="frozen"><div class="cell">Line</div><div class="cell"></div><div class="cell">Project</div></div>`
      : `<div class="frozen"><div class="cell">Line</div><div class="cell">Project</div></div>`;
  const head = `<div class="cols ${mode}">
      ${frozenHead}
      <div class="meta">
        <div class="cell">Time</div>
        <div class="cell">Status</div>
        <div class="cell">Brief</div>
        <div class="cell">Result</div>
        <div class="cell">Who</div>
        <div class="cell">Due</div>
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
      el.closest(".row")?.classList.toggle("selected", el.checked);
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

function statusMark(t) {
  const key = t.studioStatus || "new";
  const title = (STATUS[key] || STATUS.new).label;
  return (
    {
      new: { cls: "ready", label: "Ready", title },
      wip: { cls: "wip", label: "WIP", title },
      revision: { cls: "fix", label: "Fix", title },
      done: { cls: "done", label: "Done", title },
      approve: { cls: "appr", label: "Appr.", title },
      closed: { cls: "closed", label: "Closed", title },
    }[key] || { cls: "ready", label: "Ready", title: STATUS.new.label }
  );
}
function excelStatus(t) {
  return statusMark(t);
}
function statusChip(t) {
  const spec = statusMark(t);
  return `<span class="notice-chip notice-${spec.cls}">${spec.label}</span>`;
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
  const chip = statusChip(t);
  const frozen =
    mode === "ops"
      ? `<div class="frozen">
          <div class="cell"><span class="pill line-${t.line}">${t.line}</span></div>
          <div class="cell">${pick}</div>
          <div class="cell name" title="${escapeHtml(t.name)}">${chip}${escapeHtml(t.name)}</div>
        </div>`
      : `<div class="frozen">
          <div class="cell"><span class="pill line-${t.line}">${t.line}</span></div>
          <div class="cell name" title="${escapeHtml(t.name)}">${chip}${escapeHtml(t.name)}</div>
        </div>`;
  return `
    <div class="row ${mode} tone-${escapeHtml(t.studioStatus || "new")}${gapCls} ${checked ? "selected" : ""}" data-id="${t.id}">
      ${frozen}
      <div class="meta">
        <div class="cell">${timeCell(t)}</div>
        <div class="cell"><span class="pill ${st.cls}">${st.label}</span></div>
        <div class="cell">${brief}</div>
        <div class="cell">${result}</div>
        <div class="cell">${whoCell(t)}</div>
        <div class="cell">${dueCell(t)}</div>
      </div>
    </div>`;
}

function statusChoices(task) {
  const keys = [...(STATUS_BY_ROLE[me().role] || STATUS_BY_ROLE.manager)];
  if (task?.studioStatus && !keys.includes(task.studioStatus)) keys.unshift(task.studioStatus);
  return keys;
}

const STATUS_KEYS = ["new", "wip", "revision", "done", "approve", "closed"];

function statusButtonDisabled(task, key, opts) {
  const on = (task.studioStatus || "new") === key;
  if (opts.locked && !on) return true;
  if (!opts.canEdit && !on) return true;
  if (on) return opts.locked;
  if (key === "approve") return true;
  if (key === "closed") return !(canOps() && task.studioStatus === "approve");
  if (
    key === "done" &&
    isTeamLead() &&
    String(task.assigneeId || "") !== String(me().id) &&
    !on
  ) {
    return true;
  }
  if (key === "done" && !on && !hasResultLink(task, opts.typedResult)) return true;
  return !canSetStatus(key);
}

function statusButtonsHtml(t, canEdit, lockedStatus) {
  const current = t.studioStatus || "new";
  const opts = { canEdit, locked: lockedStatus };
  const buttons = STATUS_KEYS.map((key) => {
    const mark = statusMark({ studioStatus: key });
    const on = current === key;
    const disabled = statusButtonDisabled(t, key, opts);
    return `<button type="button" class="status-btn st-${mark.cls} ${on ? "is-on" : "is-off"}" data-status="${key}" aria-pressed="${on ? "true" : "false"}" ${disabled ? "disabled" : ""} title="${escapeHtml(STATUS[key].label)}">${escapeHtml(mark.label)}</button>`;
  }).join("");
  return `<div class="status-btns" role="group" aria-label="Status">${buttons}</div>
    <input type="hidden" id="stStatus" value="${escapeHtml(current)}" />
    <p class="status-hint" id="stDoneHint"></p>`;
}

function paintStatusButtons(key) {
  const input = $("stStatus");
  if (input) input.value = key;
  $("drawer")
    ?.querySelectorAll(".status-btn")
    .forEach((btn) => {
      const on = btn.dataset.status === key;
      btn.classList.toggle("is-on", on);
      btn.classList.toggle("is-off", !on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  const pill = $("stMetaStatus");
  if (pill && STATUS[key]) {
    pill.className = `pill ${STATUS[key].cls}`;
    pill.textContent = STATUS[key].label;
  }
}

function canSetStatus(next) {
  return (STATUS_BY_ROLE[me().role] || []).includes(next);
}

function hasResultLink(task, typedResult) {
  const typed =
    typedResult !== undefined ? String(typedResult || "").trim() : "";
  const saved = String(task?.resultUrl || "").trim();
  return Boolean(typed || saved);
}

function savedNameWidth() {
  const n = Number(localStorage.getItem(NAME_WIDTH_KEY));
  if (!Number.isFinite(n)) return NAME_WIDTH_DEFAULT;
  const w = n === 520 ? NAME_WIDTH_DEFAULT : n;
  return w >= NAME_WIDTH_MIN ? w : NAME_WIDTH_DEFAULT;
}

function nameWidthMax(group) {
  const board = group?.closest(".board");
  const visible = board?.clientWidth || group?.clientWidth || 0;
  return Math.max(NAME_WIDTH_MIN, visible - 280);
}

function applyNameWidth(group, px) {
  if (!group) return;
  const max = nameWidthMax(group);
  const w = Math.round(Math.min(Math.max(NAME_WIDTH_MIN, px), max));
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
    group.classList.add("is-resizing");
    document.body.classList.add("col-resizing");
    const startX = e.clientX;
    const startLeft = group.getBoundingClientRect().left;
    const startW = parseFloat(getComputedStyle(group).getPropertyValue("--name-width")) || NAME_WIDTH_DEFAULT;
    const onMove = (ev) => {
      const shift = group.getBoundingClientRect().left - startLeft;
      applyNameWidth(group, startW + (ev.clientX - startX) - shift);
    };
    const onUp = () => {
      group.classList.remove("is-resizing");
      document.body.classList.remove("col-resizing");
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
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
  if (isClientPreview()) return;
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
  const tabBar = `<div class="fin-tabs" role="tablist">${tabs
    .map(
      (t) =>
        `<button type="button" class="fin-tab ${state.finTab === t.id ? "active" : ""}" data-tab="${t.id}" role="tab" aria-selected="${state.finTab === t.id ? "true" : "false"}">${t.label}</button>`
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
    <div class="fin-create-bar">
      <div class="fin-create-actions">
        <button type="button" class="btn" id="btnOpenFolder">Open folder</button>
        <button type="button" class="btn primary" id="btnCreateInvoices" ${canCreate ? "" : "disabled"}>Create DD / DX</button>
      </div>
      <p class="fin-view-only">Word + PDF go to the studio invoice folder. Live Drive October is not written.</p>
    </div>
    <section class="group fin-card">
      <div class="fin-scroll">
        <table class="fin-table">
          <thead><tr><th>Line</th><th class="num">Projects</th><th class="num">Shifts</th><th class="num">Hours</th><th class="num">Rate</th><th class="num">CLIENT IN</th><th class="num">Share</th></tr></thead>
          <tbody>${lineRows}</tbody>
          <tfoot><tr><td>MGX</td><td class="num">${fin.tasks.length}</td><td class="num">${fin.totalShifts.toFixed(1)}</td><td class="num">${hoursLabel(fin.totalHours)}</td><td></td><td class="num">${usd(fin.clientIn)}</td><td></td></tr></tfoot>
        </table>
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
  if (isClientPreview()) {
    toast("Open folder needs the studio app. This GitHub link is a mirror and has no invoice disk.");
    return;
  }
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
  if (isClientPreview()) {
    toast("Create DD / DX needs the studio app (python3 server.py). This GitHub link is a mirror and does not write Word files.");
    return;
  }
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

function crewJobSelect(p) {
  if (p.role !== "designer" && p.role !== "teamlead") {
    return `<span class="job-mark">${jobBadgeHtml(p)}<span class="job-title">${escapeHtml(jobMeta(p).title)}</span></span>`;
  }
  return `<span class="job-mark">${jobBadgeHtml(p)}
    <select class="team-job" aria-label="Role">
      <option value="designer" ${p.role === "designer" ? "selected" : ""}>Motion design</option>
      <option value="teamlead" ${p.role === "teamlead" ? "selected" : ""}>Team Lead</option>
    </select>
  </span>`;
}

function teamRowPayload(row) {
  const id = row?.dataset.id;
  const name = String(row?.querySelector(".team-name")?.value || "").trim();
  const job = row?.querySelector(".team-job")?.value || "";
  const payload = { id, name };
  if (job) payload.job = job;
  return payload;
}

async function flushTeamNames() {
  captureTeamDrafts();
  const people = [...($("board")?.querySelectorAll(".team-row") || [])]
    .map((row) => teamRowPayload(row))
    .filter((p) => p.id && p.name);
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
        <span class="person">${avatarHtml(p)}${escapeHtml(displayName(p))}</span>
        ${crewJobSelect(p)}
        <input class="team-name" value="${escapeHtml(displayName(p))}" placeholder="Real name" />
        <button class="btn primary team-save" type="button">Save</button>
        <button class="btn ghost team-del" type="button">Delete</button>
      </div>`
    )
    .join("");
  $("board").innerHTML = `
    <section class="group" style="padding:18px">
      <h2 style="margin:0 0 12px">Team names</h2>
      <p class="team-hint">Motion design and Team Lead can switch. Pay stays $15/h on their hours. Keep at least one Team Lead.</p>
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
      const payload = teamRowPayload(row);
      if (!payload.name) {
        toast("Name cannot be empty");
        return;
      }
      const out = await api("/api/people/update", { ...payload, role: me().role });
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
  if (p.role === "client" && (state.db.people || []).filter((x) => x.role === "client").length <= 1) {
    toast("Keep the SuperPlay hours login");
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
      .filter((x) => x.id !== id && x.role !== "client")
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

function liveAssigneeId(t) {
  return $("stPerson") ? $("stPerson").value : t.assigneeId || "";
}
function helpPersonOptions(t, selectedId, assigneeId, fromTask) {
  const who = assigneeId !== undefined ? assigneeId : liveAssigneeId(t) || t.assigneeId || "";
  const fromDom = fromTask
    ? []
    : [...($("helpRows")?.querySelectorAll(".help-person") || [])].map((el) => el.value);
  const source = fromDom.length ? fromDom : helpEntries(t).map((row) => row.id);
  const taken = new Set(source.filter((id) => id && id !== selectedId));
  if (who) taken.add(who);
  return designers()
    .filter((p) => p.id !== who && (p.id === selectedId || !taken.has(p.id)))
    .map(
      (p) =>
        `<option value="${p.id}" ${p.id === selectedId && p.id !== who ? "selected" : ""}>${escapeHtml(p.name)} · ${jobMeta(p).code}</option>`
    )
    .join("");
}
function helpSplitHtml(t, editable) {
  const total = hoursOf(t);
  const help = helpEntries(t);
  const ownerH = hoursOwned(t);
  const ownerName = person(t.assigneeId)?.name || "Unassigned";
  if (!editable && !help.length) return "";
  const rows = help
    .map(
      (row) => `
      <div class="help-row">
        ${
          editable
            ? `<select class="help-person">${helpPersonOptions(t, row.id, t.assigneeId, true)}</select>
               <input class="help-hours" type="number" min="0.1" step="0.1" value="${row.hours}" />
               <button type="button" class="btn ghost help-del" title="Remove">×</button>`
            : `<span>${personCell(row.id)}</span><span class="help-h">${row.hours}h</span>`
        }
      </div>`
    )
    .join("");
  return `<section class="help-split">
      <label>Hours split</label>
      <p class="status-hint">Client stays ${total}h. Only studio pay moves — render help, not extra SuperPlay hours.</p>
      <div class="help-owner"><span>${escapeHtml(ownerName)} · Who</span><b id="helpRemainder">${ownerH}h</b></div>
      <div id="helpRows">${rows}</div>
      ${
        editable
          ? `<button type="button" class="btn ghost" id="helpAdd">Add help hours</button>`
          : ""
      }
    </section>`;
}
function readHelpFromCard(assigneeId) {
  const help = [];
  const seen = new Set();
  $("drawer")?.querySelectorAll(".help-row").forEach((row) => {
    const id = row.querySelector(".help-person")?.value || "";
    const hours = roundHours(String(row.querySelector(".help-hours")?.value || "").replace(",", "."));
    if (!id || id === assigneeId || hours <= 0 || seen.has(id)) return;
    seen.add(id);
    help.push({ id, hours });
  });
  return help;
}
function refreshHelpRemainder(t) {
  const hint = $("helpRemainder");
  if (!hint) return;
  const assigneeId = $("stPerson")?.value || t.assigneeId;
  const total = $("stShifts") ? hoursFromShifts(parseShifts($("stShifts").value) || 0) : hoursOf(t);
  const given = readHelpFromCard(assigneeId).reduce((s, row) => s + row.hours, 0);
  const rest = Math.max(0, roundHours(total - given) || 0);
  const name = person(assigneeId)?.name || "Unassigned";
  hint.closest(".help-owner")?.querySelector("span") &&
    (hint.closest(".help-owner").querySelector("span").textContent = `${name} · Who`);
  hint.textContent = `${rest}h`;
  hint.classList.toggle("is-over", given > total + 0.001);
}
function bindHelpSplit(t) {
  const box = $("drawer")?.querySelector(".help-split");
  if (!box || !canEditHelp()) return;
  const paint = () => refreshHelpRemainder(t);
  box.addEventListener("input", paint);
  box.addEventListener("change", paint);
  $("helpAdd")?.addEventListener("click", () => {
    const assigneeId = $("stPerson")?.value || t.assigneeId;
    const taken = new Set(readHelpFromCard(assigneeId).map((row) => row.id));
    if (assigneeId) taken.add(assigneeId);
    const next = designers().find((p) => !taken.has(p.id));
    if (!next) {
      toast("Everyone already has hours on this task");
      return;
    }
    const draft = { ...t, assigneeId, help: [...readHelpFromCard(assigneeId), { id: next.id, hours: 0.5 }] };
    const wrap = $("helpRows");
    if (!wrap) return;
    wrap.insertAdjacentHTML(
      "beforeend",
      `<div class="help-row">
        <select class="help-person">${helpPersonOptions(draft, next.id)}</select>
        <input class="help-hours" type="number" min="0.1" step="0.1" value="0.5" />
        <button type="button" class="btn ghost help-del" title="Remove">×</button>
      </div>`
    );
    paint();
  });
  box.addEventListener("click", (e) => {
    const btn = e.target.closest(".help-del");
    if (!btn) return;
    btn.closest(".help-row")?.remove();
    paint();
  });
  $("stPerson")?.addEventListener("change", () => {
    const who = liveAssigneeId(t);
    $("helpRows")?.querySelectorAll(".help-row").forEach((row) => {
      const sel = row.querySelector(".help-person");
      if (sel?.value === who) row.remove();
    });
    $("helpRows")?.querySelectorAll(".help-person").forEach((sel) => {
      const keep = sel.value === who ? "" : sel.value;
      sel.innerHTML = helpPersonOptions(t, keep, who);
      if (keep && [...sel.options].some((o) => o.value === keep)) sel.value = keep;
      else if (!sel.options.length) sel.closest(".help-row")?.remove();
    });
    paint();
  });
  $("stShifts")?.addEventListener("input", paint);
}

function openTask(id) {
  if (isClient()) return;
  const t = state.db.tasks.find((x) => x.id === id);
  if (!t) return;
  state.openId = id;
  const mine = t.assigneeId === me().id;
  const canEdit = canOps() || canAssign() || mine;
  const lockedStatus = (t.studioStatus === "approve" || t.studioStatus === "closed") && !canOps();
  const job = cardJob(t);
  const performer = mine && (isDesigner() || isTeamLead());
  const canPaste = canPasteResult(t);
  const assignHero = isTeamLead() && !t.assigneeId;
  const assignSelect = canAssign()
    ? `<select id="stPerson">
        <option value="">— unassigned</option>
        ${designers()
          .map(
            (p) =>
              `<option value="${p.id}" ${t.assigneeId === p.id ? "selected" : ""}>${escapeHtml(p.name)} · ${jobMeta(p).code}</option>`
          )
          .join("")}
      </select>`
    : personCell(t.assigneeId);
  const heroAssign = assignHero
    ? `<div class="field field-focus">
        <label>Who works this</label>
        ${assignSelect}
      </div>`
    : "";
  const showAssignee = !isDesigner() && !assignHero;
  const whoAssign = showAssignee
    ? `<div class="who-assign"><label>Who works this</label>${canAssign() ? assignSelect : personCell(t.assigneeId)}</div>`
    : "";
  const opsTime = canEditTime()
    ? `<div class="ops-item"><label>Shifts</label>
        <input id="stShifts" type="number" min="0" step="0.1" value="${t.shifts ?? ""}" />
        <p class="status-hint" id="stHoursHint">${hoursFromShifts(t.shifts || 0)} h</p></div>
       <div class="ops-item"><label>Deadline</label>
        <input id="stDeadline" type="date" value="${parseDeadlineIso(t.deadline)}" />
        <p class="status-hint">Same as Excel DEADLINE</p></div>`
    : "";
  const whoBlock = `<section class="who-block">
      ${whoAssign}
      <div class="who-status">
        <label>Status</label>
        ${statusButtonsHtml(t, canEdit, lockedStatus)}
      </div>
    </section>`;
  const st = STATUS[t.studioStatus] || STATUS.new;
  const sourceBlock = sourceHtml(t);
  const resultBlock = resultHtml(t, performer, canPaste);
  $("drawer").innerHTML = `
    <div class="drawer-head">
      <h2>${escapeHtml(t.name)}</h2>
      <button type="button" class="drawer-x" id="closeDrawer" aria-label="Close">×</button>
    </div>
    <div class="meta"><span class="pill line-${t.line}">${t.line}</span> ${t.shifts || 0} shift · ${t.hours || 0} h · <span id="stMetaStatus" class="pill ${st.cls}">${st.label}</span></div>
    <div class="drawer-body">
    <div class="card-job tone-${job.tone}">
      ${jobBadgeHtml(me())}
      <div>
        <strong>${escapeHtml(job.title)}</strong>
        <p>${escapeHtml(job.body)}</p>
      </div>
    </div>
    ${heroAssign}
    ${pinHtml(t)}
    ${notesHtml(t)}
    ${sourceBlock || resultBlock ? `<div class="io-stack">${sourceBlock}${resultBlock}</div>` : ""}
    ${whoBlock}
    ${helpSplitHtml(t, canEditHelp())}
    ${opsTime ? `<div class="card-ops">${opsTime}</div>` : ""}
    </div>
    <div class="drawer-actions">
      ${canOps() && isSendable(t) ? `<button class="btn green" id="exportOne">Send this to client</button>` : ""}
      ${canOps() && t.studioStatus === "approve" ? `<button class="btn" id="closeOne">Mark Closed</button>` : ""}
      ${canOps() && t.studioStatus === "approve" && t.resultUrl ? `<button class="btn" id="copyOne">Copy Monday reply</button>` : ""}
      <button class="btn primary" id="saveTask">Save</button>
    </div>
  `;
  $("closeDrawer").onclick = closeDrawer;
  const pendingShots = [];
  function fileToShot(file) {
    return new Promise((resolve) => {
      if (!file || !String(file.type || "").startsWith("image/")) {
        resolve(null);
        return;
      }
      if (file.size > 6 * 1024 * 1024) {
        toast("Screenshot is over 6 MB");
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve({ mime: file.type || "image/png", data: String(reader.result || "") });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }
  function renderPendingShots() {
    const box = $("stCommentShots");
    if (!box) return;
    box.innerHTML = pendingShots
      .map(
        (s, i) => `<button type="button" class="notes-pending" data-i="${i}" aria-label="Remove screenshot">
          <img src="${s.data}" alt="" />
        </button>`
      )
      .join("");
    box.querySelectorAll(".notes-pending").forEach((btn) => {
      btn.addEventListener("click", () => {
        pendingShots.splice(Number(btn.dataset.i), 1);
        renderPendingShots();
      });
    });
  }
  async function addPendingFiles(files) {
    for (const file of files || []) {
      if (pendingShots.length >= 8) {
        toast("Up to 8 screenshots on one note");
        break;
      }
      const shot = await fileToShot(file);
      if (shot) pendingShots.push(shot);
    }
    renderPendingShots();
  }
  async function postClientNote({ reopen } = { reopen: true }) {
    const body = String($("stComment")?.value || "").trim();
    if (!body && !pendingShots.length) {
      toast("Paste client text or a screenshot");
      return false;
    }
    const out = await api("/api/tasks/comment", {
      id: t.id,
      body,
      attachments: pendingShots.map((s) => ({ mime: s.mime, data: s.data })),
      actorId: me().id,
      role: me().role,
    });
    if (out.error || !out.state) {
      toast(out.error || "Could not add note");
      return false;
    }
    pendingShots.length = 0;
    applyState(out.state);
    toast("Note added");
    if (reopen) openTask(t.id);
    else {
      if ($("stComment")) $("stComment").value = "";
      renderPendingShots();
    }
    return true;
  }
  $("addNote")?.addEventListener("click", () => postClientNote());
  $("stCommentFiles")?.addEventListener("change", async (e) => {
    await addPendingFiles([...e.target.files]);
    e.target.value = "";
  });
  $("stComment")?.addEventListener("paste", async (e) => {
    const files = [];
    for (const item of e.clipboardData?.items || []) {
      if (String(item.type || "").startsWith("image/")) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (!files.length) return;
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (text && $("stComment")) {
      const el = $("stComment");
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      el.value = el.value.slice(0, start) + text + el.value.slice(end);
    }
    await addPendingFiles(files);
  });
  const dropBox = $("stCommentBox");
  if (dropBox) {
    dropBox.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropBox.classList.add("is-drop");
    });
    dropBox.addEventListener("dragleave", () => dropBox.classList.remove("is-drop"));
    dropBox.addEventListener("drop", async (e) => {
      e.preventDefault();
      dropBox.classList.remove("is-drop");
      await addPendingFiles([...(e.dataTransfer?.files || [])]);
    });
  }
  $("drawer")?.querySelectorAll(".notes-del").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const out = await api("/api/tasks/comment", {
        id: t.id,
        deleteId: btn.dataset.id,
        actorId: me().id,
        role: me().role,
      });
      if (out.error || !out.state) {
        toast(out.error || "Could not remove note");
        return;
      }
      applyState(out.state);
      openTask(t.id);
    });
  });
  bindNoteShots(t);
  const N = window.LGNotices;
  if (N && N.forPerson(state.db, me().id, true).some((n) => n.taskId === id)) {
    ackNotices({ taskId: id });
  }
  const syncDoneOption = () => {
    const hint = $("stDoneHint");
    const typed = $("stResult")?.value || "";
    const hasResult = hasResultLink(t, typed);
    const doneBtn = $("drawer")?.querySelector('.status-btn[data-status="done"]');
    if (doneBtn && t.studioStatus !== "done") {
      doneBtn.disabled = statusButtonDisabled(t, "done", {
        canEdit,
        locked: lockedStatus,
        typedResult: typed,
      });
    }
    if (hint) {
      if (performer && !hasResult && t.studioStatus !== "done" && t.studioStatus !== "approve" && t.studioStatus !== "closed") {
        hint.textContent = "Paste the result link, then tap Done.";
      } else if (canOps() && t.studioStatus === "done") {
        hint.textContent = "Send to client — that sets Senior Approval.";
      } else if (canOps() && t.studioStatus === "approve") {
        hint.textContent = "Client accepted → Closed. Need Fixing if they bounce it.";
      } else if (canOps() && t.studioStatus === "closed") {
        hint.textContent = "Closed. Need Fixing only if the client reopens.";
      } else if (canOps() && t.studioStatus !== "new") {
        hint.textContent = "Senior Approval is set only by Send to client. Closed is after that.";
      } else if (isTeamLead() && t.assigneeId && t.assigneeId !== me().id) {
        hint.textContent = "Need Fixing sends it back to the designer.";
      } else {
        hint.textContent = "";
      }
    }
  };
  $("stResult")?.addEventListener("input", syncDoneOption);
  $("stResult")?.addEventListener("change", syncDoneOption);
  $("stResult")?.addEventListener("paste", () => setTimeout(syncDoneOption, 0));
  $("drawer")?.querySelectorAll(".status-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.status;
      if (!key || btn.disabled) return;
      if (key === "approve") {
        toast("Senior Approval is set only when you Send to client");
        return;
      }
      if (key === "closed" && t.studioStatus !== "closed" && t.studioStatus !== "approve") {
        toast("Closed is after Senior Approval, when the client accepts");
        return;
      }
      if (key === "done" && !($("stResult")?.value || t.resultUrl || "").trim()) {
        toast("Paste the result link before Done");
        return;
      }
      if (key !== t.studioStatus && !canSetStatus(key) && !(key === "closed" && canOps() && t.studioStatus === "approve")) {
        toast("This role cannot set " + (STATUS[key]?.label || key));
        return;
      }
      paintStatusButtons(key);
    });
  });
  syncDoneOption();
  $("drawerBg").classList.add("show");
  $("stShifts")?.addEventListener("input", () => {
    const shifts = parseShifts($("stShifts").value);
    const hint = $("stHoursHint");
    if (!hint) return;
    if (shifts === null) {
      hint.textContent = "Enter a number, 0 or more.";
      return;
    }
    hint.textContent = `${hoursFromShifts(shifts)} h`;
  });
  $("saveTask").onclick = async () => {
    if (canWriteNotes() && (String($("stComment")?.value || "").trim() || pendingShots.length)) {
      const ok = await postClientNote({ reopen: false });
      if (!ok) return;
    }
    const resultUrl = ($("stResult")?.value || t.resultUrl || "").trim();
    const studioStatus = $("stStatus").value;
    if (studioStatus !== t.studioStatus && !canSetStatus(studioStatus)) {
      toast("This role cannot set " + (STATUS[studioStatus]?.label || studioStatus));
      return;
    }
    if (studioStatus === "approve") {
      toast("Senior Approval is set only when you Send to client");
      return;
    }
    if (studioStatus === "closed" && t.studioStatus !== "closed" && t.studioStatus !== "approve") {
      toast("Closed is after Senior Approval, when the client accepts");
      return;
    }
    if (studioStatus === "done" && !resultUrl) {
      toast("Paste the result link before Done");
      return;
    }
    const assigneeId = canAssign() && $("stPerson") ? $("stPerson").value : t.assigneeId;
    const patch = { studioStatus, role: me().role };
    if (canAssign()) patch.assigneeId = assigneeId;
    if (canEditHelp()) {
      const help = readHelpFromCard(assigneeId);
      const total = patch.shifts !== undefined ? hoursFromShifts(patch.shifts) : hoursOf(t);
      const given = help.reduce((s, row) => s + row.hours, 0);
      if (given > total + 0.001) {
        toast("Help hours cannot exceed the client hours on this task");
        return;
      }
      patch.help = help;
    }
    if ($("stResult")) patch.resultUrl = resultUrl;
    if (canEditTime() && $("stShifts")) {
      const shifts = parseShifts($("stShifts").value);
      if (shifts === null) {
        toast("Shifts must be 0 or more");
        return;
      }
      patch.shifts = shifts;
    }
    if (canEditTime() && $("stDeadline")) {
      const deadline = parseDeadlineIso($("stDeadline").value);
      if ($("stDeadline").value && !deadline) {
        toast("Deadline must be a date");
        return;
      }
      patch.deadline = deadline;
    }
    const helpNote = patch.help
      ? patch.help.map((row) => `${person(row.id)?.name || row.id} ${row.hours}h`).join(", ")
      : "";
    const prevHelp = JSON.stringify(helpEntries(t));
    const nextHelp = JSON.stringify(patch.help || helpEntries(t));
    const note =
      patch.help && prevHelp !== nextHelp
        ? helpNote
          ? `${me().name} split hours: ${person(assigneeId)?.name || "Who"} keeps the rest · ${helpNote}`
          : `${me().name} cleared help hours`
        : patch.shifts !== undefined && patch.shifts !== Number(t.shifts)
        ? `${me().name} set ${patch.shifts} shifts → ${hoursFromShifts(patch.shifts)} h`
        : patch.deadline !== undefined && patch.deadline !== parseDeadlineIso(t.deadline)
          ? patch.deadline
            ? `${me().name} set deadline ${excelDate(patch.deadline)}`
            : `${me().name} cleared deadline`
        : studioStatus === "closed" && t.studioStatus !== "closed"
          ? `${me().name} marked Closed (client accepted)`
          : resultUrl && resultUrl !== t.resultUrl
            ? `${me().name} pasted the result`
            : `${me().name} updated status`;
    updateTask(t.id, { ...patch, note }, { close: true });
  };
  $("exportOne")?.addEventListener("click", async () => {
    await sendToClient([t.id]);
    openTask(t.id);
  });
  $("closeOne")?.addEventListener("click", () => {
    updateTask(
      t.id,
      {
        studioStatus: "closed",
        role: me().role,
        note: `${me().name} marked Closed (client accepted)`,
      },
      { close: true }
    );
  });
  bindHelpSplit(t);
  fillDrivePackIfMissing(t);
  $("copyOne")?.addEventListener("click", async () => {
    const pack = mondayReply(t);
    const ok = await copyText(pack);
    showPaste("Paste into Monday", "Already Senior Approval. Copy again into External Weekly.", pack);
    toast(ok ? "Copied Monday reply" : "Ready to copy");
  });
}

function closeDrawer() {
  closeShot();
  $("drawerBg").classList.remove("show");
  state.openId = null;
}

async function updateTask(id, patch, opts = {}) {
  const out = await api("/api/tasks/update", { id, actorId: me().id, ...patch });
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
  const out = await api("/api/import-monday", { month: state.month, role: me().role, actorId: me().id });
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
  const out = await api("/api/export-monday", { ids: ready.map((t) => t.id), role: me().role, actorId: me().id });
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
  if (
    !confirm(
      "Discard clicks in this browser and restore the live snapshot?\n\nThe real SP_MGX_check.xlsx and Projects / 10_October are not changed."
    )
  ) {
    return;
  }
  const out = await api("/api/reset", {});
  state.month = out.meta?.month || "2026-10";
  localStorage.setItem(MONTH_KEY, state.month);
  applyState(out);
  toast("Restored live snapshot · core files untouched");
}
function applyState(db) {
  state.db = db;
  state.finApi = null;
  state.finApiMonth = null;
  state.finApiLoading = null;
  state.selected = new Set([...state.selected].filter((id) => db.tasks.some((t) => t.id === id)));
  render();
}

function inboxOpen() {
  return $("inboxPanel") && !$("inboxPanel").hidden;
}
function setInboxOpen(open) {
  const panel = $("inboxPanel");
  const btn = $("inboxBtn");
  if (!panel || !btn) return;
  panel.hidden = !open;
  btn.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) renderInboxList();
}
function renderInbox() {
  const N = window.LGNotices;
  const countEl = $("inboxCount");
  const btn = $("inboxBtn");
  if (!countEl || !btn || !N || !state.db) return;
  const unread = N.forPerson(state.db, me().id, true);
  countEl.hidden = !unread.length;
  countEl.textContent = unread.length > 9 ? "9+" : String(unread.length);
  btn.classList.toggle("has-unread", unread.length > 0);
  $("inboxAll").hidden = !unread.length;
  if (inboxOpen()) renderInboxList();
}
function renderInboxList() {
  const N = window.LGNotices;
  const list = $("inboxList");
  if (!list || !N || !state.db) return;
  const unread = N.forPerson(state.db, me().id, true);
  if (!unread.length) {
    list.innerHTML = `<p class="inbox-empty">Nothing waiting for you.</p>`;
    return;
  }
  const groups = [];
  const map = new Map();
  for (const notice of unread) {
    if (!map.has(notice.kind)) {
      const group = { kind: notice.kind, items: [] };
      map.set(notice.kind, group);
      groups.push(group);
    }
    map.get(notice.kind).items.push(notice);
  }
  list.innerHTML = groups
    .map((group) => {
      const mark = (N.KINDS[group.kind] || {}).mark || "none";
      return `<div class="inbox-group">
        <div class="inbox-kind">${escapeHtml(N.labelOf(group.kind))} · ${group.items.length}</div>
        ${group.items
          .map(
            (n) => `<button type="button" class="inbox-item" data-id="${escapeHtml(n.id)}" data-task="${escapeHtml(n.taskId || "")}">
              <span class="notice-chip notice-${mark}">${escapeHtml(N.labelOf(n.kind))}</span>
              <span class="inbox-item-text">
                <strong>${escapeHtml(N.titleOf(n))}</strong>
                <small>${escapeHtml(N.detailOf(n))}</small>
              </span>
            </button>`
          )
          .join("")}
      </div>`;
    })
    .join("");
  list.querySelectorAll(".inbox-item").forEach((el) => {
    el.addEventListener("click", async () => {
      const taskId = el.dataset.task;
      setInboxOpen(false);
      await ackNotices({ ids: [el.dataset.id] });
      if (taskId) openTask(taskId);
    });
  });
}
async function ackNotices(payload) {
  const out = await api("/api/notices/read", { personId: me().id, ...payload });
  if (out.state) applyState(out.state);
}

function financeSeat() {
  return (state.db?.people || []).find((p) => p.role === "finance") || null;
}
function openFinanceSeat() {
  const seat = financeSeat();
  if (!seat) {
    toast("Finance login is missing");
    return;
  }
  state.roleId = seat.id;
  state.view = "close";
  state.selected.clear();
  state.designerFilter = null;
  setInboxOpen(false);
  render();
}
function closeFinancePin() {
  $("finGateModal")?.classList.remove("show");
  const pin = $("finGatePin");
  if (pin) pin.value = "";
}
function submitFinancePin() {
  if (!financePinOk($("finGatePin")?.value)) {
    toast("Wrong PIN");
    $("finGatePin")?.select();
    return;
  }
  setFinanceUnlocked();
  closeFinancePin();
  openFinanceSeat();
}
function requestFinance() {
  if (!isClientPreview()) {
    openFinanceSeat();
    return;
  }
  if (financeUnlocked()) {
    openFinanceSeat();
    return;
  }
  $("finGateModal")?.classList.add("show");
  setTimeout(() => $("finGatePin")?.focus(), 0);
}

function render() {
  if (!state.db) return;
  if (isClientPreview() && me().role === "finance" && !financeUnlocked()) {
    state.roleId = "manager";
    if (state.view === "close" || state.view === "team") state.view = "board";
  }
  if (isClient() && state.view !== "report") state.view = "report";
  renderWho();
  renderChrome();
  renderInbox();
  renderToolbar();
  renderKpis();
  renderLoad();
  renderBoard();
}

$("monthPrev").addEventListener("click", () => setMonth(shiftMonth(state.month, -1)));
$("monthNext").addEventListener("click", () => setMonth(shiftMonth(state.month, 1)));
$("monthLabel").addEventListener("click", () => setMonth(calendarMonth()));

$("who").addEventListener("change", (e) => {
  const next = person(e.target.value);
  if (isClientPreview() && next?.role === "finance" && !financeUnlocked()) {
    e.target.value = me().id;
    requestFinance();
    return;
  }
  state.roleId = e.target.value;
  state.selected.clear();
  state.designerFilter = null;
  state.view = next?.role === "finance" ? "close" : next?.role === "client" ? "report" : "board";
  setInboxOpen(false);
  if (state.session) writeSession({ ...state.session, seatId: e.target.value });
  render();
});
$("inboxBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  setInboxOpen(!inboxOpen());
});
$("inboxAll")?.addEventListener("click", async (e) => {
  e.stopPropagation();
  await ackNotices({ all: true });
  setInboxOpen(true);
});
document.addEventListener("click", (e) => {
  if (!$("inboxWrap") || $("inboxWrap").contains(e.target)) return;
  setInboxOpen(false);
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
$("finGateCancel")?.addEventListener("click", closeFinancePin);
$("finGateOk")?.addEventListener("click", submitFinancePin);
$("finGatePin")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    submitFinancePin();
  }
});
$("finGateModal")?.addEventListener("click", (e) => {
  if (e.target === $("finGateModal")) closeFinancePin();
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
  const out = await api("/api/parse-email", { text: $("emailText").value, month: state.month, role: me().role, actorId: me().id });
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

probeStudioApi()
  .then(() => api("/api/state"))
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
