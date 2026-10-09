/** Browser store so the client demo runs on Netlify / GitHub Pages without Python. */
(function () {
  const KEY = "lg-board-db-v6";
  const EMAIL_LINE =
    /^\s*([A-Z]{2}-[A-Za-z0-9._-]+)\s*\|\s*([\d]+(?:[.,]\d+)?)\s*shifts?\s*$/i;
  const OPS_ROLES = new Set(["manager", "finance"]);
  const STATUS_BY_ROLE = {
    designer: new Set(["wip", "done"]),
    teamlead: new Set(["new", "wip", "revision", "done"]),
    manager: new Set(["new", "wip", "revision", "done", "closed"]),
    finance: new Set(["new", "wip", "revision", "done", "closed"]),
    client: new Set(),
  };
  const mondayReply = (task) =>
    `${task.name || ""}\ncheck it please\n${task.resultUrl || ""}`.trim();
  const isSendable = (task) =>
    task && task.studioStatus === "done" && String(task.resultUrl || "").trim();

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const hoursFromShift = (shift) => Math.round(Number(shift) * 9 * 10) / 10;
  const roundHours = (n) => {
    const x = Number(n);
    if (!Number.isFinite(x) || x <= 0) return 0;
    return Math.round(x * 10) / 10;
  };
  const normalizeHelp = (task, peopleIds) => {
    const who = String(task.assigneeId || "");
    const total = Number(task.hours) || hoursFromShift(task.shifts || 0) || 0;
    const ids = peopleIds || new Set();
    const rows = [];
    let used = 0;
    const seen = new Set();
    for (const row of task.help || []) {
      const pid = String(row?.id || "").trim();
      const hours = roundHours(row?.hours);
      if (!pid || pid === who || hours <= 0 || seen.has(pid) || (ids.size && !ids.has(pid))) continue;
      let next = hours;
      if (used + next > total + 0.001) next = Math.round(Math.max(0, total - used) * 10) / 10;
      if (next <= 0) continue;
      seen.add(pid);
      rows.push({ id: pid, hours: next });
      used = Math.round((used + next) * 10) / 10;
      if (used >= total) break;
    }
    task.help = rows;
    return rows;
  };
  const performerIds = (db) =>
    new Set((db.people || []).filter((p) => p.role === "teamlead" || p.role === "designer").map((p) => p.id));
  const lineFromName = (name) => {
    const prefix = String(name).split("-", 1)[0].toUpperCase();
    return ["DD", "DX", "DS"].includes(prefix) ? prefix : "DD";
  };
  const taskMonth = (data, db) =>
    data?.month || db?.meta?.month || "2026-10";

  let seedCache = null;
  async function loadSeed() {
    if (!seedCache) {
      const res = await fetch("seed.json", { cache: "no-store" });
      seedCache = await res.json();
    }
    return clone(seedCache);
  }

  function readDb() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return null;
  }

  function writeDb(db) {
    localStorage.setItem(KEY, JSON.stringify(db));
    return db;
  }

  function mondayFixture() {
    return [
      {
        id: "t-dd-new-banana",
        name: "DD-VEO-068-001_BananaBoat_8s_Resize",
        line: "DD",
        game: "Dice Dreams",
        mondayStatus: "Ready to Start",
        brief: "Resize BananaBoat 8s. Keep logo top-left.",
        folderUrl: "https://drive.google.com/drive/folders/13-eo8f5K8rZm-DEkIXgQ0EWNsqC_O5HF",
        docUrl: "https://docs.google.com/document/d/1dbxJCigaJisDTUnHFqjkmAFTctjM_kFR1tMrw9dFTxU/edit",
      },
    ];
  }

  function parseEmail(text) {
    const found = [];
    for (const raw of String(text || "").split(/\n/)) {
      const m = EMAIL_LINE.exec(raw.trim().replace(/\\_/g, "_"));
      if (!m) continue;
      const name = m[1].replace(/\\_/g, "_");
      const shift = Number(String(m[2]).replace(",", "."));
      found.push({
        name,
        line: lineFromName(name),
        shifts: shift,
        hours: hoursFromShift(shift),
      });
    }
    return found;
  }

  function N() {
    return window.LGNotices;
  }

  function migrate(db) {
    if (!db) return db;
    if (N()) N().ensure(db);
    else {
      db.notices = db.notices || [];
      db.noticeReads = db.noticeReads || {};
    }
    const crewTint = [
      { match: (p) => p.id === "designer3" || p.name === "Сергій", color: "#7EC4FF", avatarStar: true },
      { match: (p) => p.id === "designer4" || p.name === "Аліна", color: "#FFB38A" },
      { match: (p) => p.id === "designer5" || p.name === "Олекса", color: "#FF9EC8" },
    ];
    for (const p of db.people || []) {
      const tint = crewTint.find((row) => row.match(p));
      if (!tint) continue;
      p.color = tint.color;
      if (tint.avatarStar) p.avatarStar = true;
    }
    return db;
  }

  async function ensureDb() {
    const existing = readDb();
    if (existing) {
      const had = Object.prototype.hasOwnProperty.call(existing, "notices");
      migrate(existing);
      if (!had) writeDb(existing);
      return existing;
    }
    return writeDb(migrate(await loadSeed()));
  }

  async function localApi(path, payload) {
    const data = payload || {};
    let db = await ensureDb();

    if (path === "/api/state") return clone(db);

    if (path === "/api/reset") {
      db = writeDb(migrate(await loadSeed()));
      return clone(db);
    }

    if (path === "/api/parse-email") {
      if (!OPS_ROLES.has(data.role)) return { error: "only Line Producer can parse shift email" };
      const rows = parseEmail(data.text);
      let added = 0;
      let updated = 0;
      for (const row of rows) {
        const existing = db.tasks.find((t) => t.name === row.name);
        if (existing) {
          existing.shifts = row.shifts;
          existing.hours = row.hours;
          existing.line = row.line;
          existing.source = existing.brief ? "monday+email" : "email";
          existing.activity = existing.activity || [];
          existing.activity.push({
            at: now(),
            text: `From email: ${row.shifts} shifts → ${row.hours} h`,
          });
          updated += 1;
        } else {
          db.tasks.push({
            id: `t-${row.name.slice(0, 40)}-${db.tasks.length}`,
            name: row.name,
            line: row.line,
            department: "MGX",
            game: "SettAI",
            shifts: row.shifts,
            hours: row.hours,
            deadline: "",
            month: taskMonth(data, db),
            studioStatus: "new",
            mondayStatus: "Ready to Start",
            assigneeId: "",
            brief: "",
            folderUrl: "",
            docUrl: "",
            resultUrl: "",
            source: "email",
            activity: [{ at: now(), text: `From Orit email: ${row.shifts} shifts` }],
          });
          added += 1;
          if (N()) N().onLanded(db, db.tasks[db.tasks.length - 1], data.actorId);
        }
      }
      db.events = db.events || [];
      db.events.unshift({
        at: now(),
        text: `Parsed email: ${added} new, ${updated} shifts updated`,
      });
      writeDb(db);
      return { added, updated, parsed: rows, state: clone(db) };
    }

    if (path === "/api/import-monday") {
      if (!OPS_ROLES.has(data.role)) return { error: "only Line Producer can pull from Monday" };
      const incoming = data.tasks && data.tasks.length ? data.tasks : mondayFixture();
      let added = 0;
      for (const item of incoming) {
        const existing = db.tasks.find((t) => t.name === item.name);
        if (existing) {
          if (item.brief && !existing.brief) existing.brief = item.brief;
          existing.mondayStatus = item.mondayStatus || existing.mondayStatus;
          continue;
        }
        db.tasks.push({
          id: item.id || `t-imp-${db.tasks.length}`,
          name: item.name,
          line: item.line || lineFromName(item.name),
          department: "MGX",
          game: item.game || "SettAI",
          shifts: item.shifts || 0,
          hours: item.hours || 0,
          deadline: "",
          month: item.month || taskMonth(data, db),
          studioStatus: "new",
          mondayStatus: item.mondayStatus || "Ready to Start",
          assigneeId: "",
          brief: item.brief || "",
          folderUrl: item.folderUrl || "",
          docUrl: item.docUrl || "",
          resultUrl: "",
          source: "monday",
          activity: [{ at: now(), text: "Pulled from Monday External Weekly" }],
        });
        added += 1;
        if (N()) N().onLanded(db, db.tasks[db.tasks.length - 1], data.actorId);
      }
      db.events = db.events || [];
      db.events.unshift({ at: now(), text: `Monday import: ${added} new tasks` });
      writeDb(db);
      return { added, drive: { created: 0, linked: added, ready: added }, state: clone(db) };
    }

    if (path === "/api/drive/ensure") {
      return { error: "Drive folders are created in the studio sandbox, not on GitHub Pages." };
    }

    if (path === "/api/export-monday") {
      if (!OPS_ROLES.has(data.role)) return { error: "only Line Producer can send to the client" };
      const ids = new Set(data.ids || []);
      const exported = [];
      for (const task of db.tasks) {
        if (!ids.has(task.id) || !isSendable(task)) continue;
        const before = { studioStatus: task.studioStatus, assigneeId: task.assigneeId };
        task.studioStatus = "approve";
        task.mondayStatus = "Senior Approval";
        if (N()) N().onTaskChange(db, task, before, data.actorId);
        task.activity = task.activity || [];
        task.activity.push({
          at: now(),
          text: "Sent to Monday: check it please + link → Senior Approval",
        });
        exported.push({
          name: task.name,
          reply: mondayReply(task),
          mondayStatus: "Senior Approval",
        });
      }
      if (!exported.length) {
        return {
          error: "Send only works on Done projects that have a result link",
          exported: [],
          state: clone(db),
        };
      }
      db.events = db.events || [];
      db.events.unshift({
        at: now(),
        text: `Sent ${exported.length} tasks to Monday Senior Approval`,
      });
      writeDb(db);
      return { exported, state: clone(db) };
    }

    if (path === "/api/tasks/update") {
      const task = db.tasks.find((t) => t.id === data.id);
      if (!task) return { error: "not found" };
      const before = { studioStatus: task.studioStatus, assigneeId: task.assigneeId };
      const nxt = data.studioStatus;
      const role = data.role || "";
      const allowed = STATUS_BY_ROLE;
      if (nxt === "approve" && nxt !== task.studioStatus) {
        return { error: "Senior Approval is set only when you Send to client" };
      }
      if (nxt === "closed" && nxt !== task.studioStatus && task.studioStatus !== "approve") {
        return { error: "Closed is after Senior Approval, when the client accepts" };
      }
      if (nxt && nxt !== task.studioStatus && allowed[role] && !allowed[role].has(nxt)) {
        return { error: `${role} cannot set ${nxt}` };
      }
      const statusAfter = "studioStatus" in data ? data.studioStatus : task.studioStatus;
      const resultAfter = "resultUrl" in data ? data.resultUrl : task.resultUrl;
      if (statusAfter === "done" && !String(resultAfter || "").trim()) {
        return { error: "paste the result link before Done" };
      }
      if ("shifts" in data) {
        if (role !== "manager" && role !== "finance") {
          return { error: "only manager or finance can edit time" };
        }
        const shift = Number(String(data.shifts).replace(",", "."));
        if (!Number.isFinite(shift) || shift < 0) return { error: "shifts must be 0 or more" };
        task.shifts = shift;
        task.hours = hoursFromShift(shift);
      }
      if ("deadline" in data) {
        if (role !== "manager" && role !== "finance") {
          return { error: "only manager or finance can edit deadline" };
        }
        const raw = String(data.deadline || "").trim();
        if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw.slice(0, 10))) {
          return { error: "deadline must be a date" };
        }
        task.deadline = raw ? raw.slice(0, 10) : "";
      }
      for (const key of ["studioStatus", "assigneeId", "resultUrl", "brief", "folderUrl", "docUrl"]) {
        if (key in data) task[key] = data[key];
      }
      if ("help" in data) {
        if (role !== "manager" && role !== "finance" && role !== "teamlead") {
          return { error: "only TL or LP can split hours" };
        }
        const helpRows = [];
        for (const row of data.help || []) {
          const pid = String(row?.id || "").trim();
          const hours = Number(String(row?.hours ?? "").replace(",", "."));
          if (!pid || !Number.isFinite(hours) || hours <= 0) continue;
          helpRows.push({ id: pid, hours });
        }
        task.help = helpRows;
      }
      normalizeHelp(task, performerIds(db));
      if (task.studioStatus === "closed") task.mondayStatus = "Closed";
      else if (nxt === "revision") task.mondayStatus = "Need Fixing";
      if (data.note) {
        task.activity = task.activity || [];
        task.activity.push({ at: now(), text: data.note });
      }
      if (N()) N().onTaskChange(db, task, before, data.actorId);
      writeDb(db);
      return { task: clone(task), state: clone(db) };
    }

    if (path === "/api/meta/update") {
      if (data.role !== "finance") return { error: "only finance can edit rates" };
      db.meta = db.meta || {};
      const money = (val) => {
        if (val === null || val === undefined || val === "") return null;
        const n = Number(String(val).replace(",", "."));
        if (!Number.isFinite(n) || n < 0) throw new Error("rate");
        return n;
      };
      try {
        if ("clientRateUsd" in data) {
          const rate = money(data.clientRateUsd);
          if (rate === null) return { error: "Superplay rate must be 0 or more" };
          db.meta.clientRateUsd = rate;
        }
        if ("designerRateUsd" in data) {
          const rate = money(data.designerRateUsd);
          if (rate === null) return { error: "pay rate must be 0 or more" };
          db.meta.designerRateUsd = rate;
        }
        if ("taxPct" in data) {
          let rate = money(data.taxPct);
          if (rate === null) return { error: "tax must be a number, 0–100%" };
          if (rate > 1) rate = rate / 100;
          if (rate > 1) return { error: "tax must be 0–100%" };
          db.meta.taxPct = Math.round(rate * 1e6) / 1e6;
        }
        if ("nbuRate" in data) {
          const rate = money(data.nbuRate);
          if (rate === null || rate <= 0) return { error: "NBU rate must be more than 0" };
          db.meta.nbuRate = rate;
        }
      } catch {
        return { error: "rates must be numbers, 0 or more" };
      }
      writeDb(db);
      return { meta: clone(db.meta), state: clone(db) };
    }

    if (path === "/api/people/update") {
      if (data.role !== "finance") return { error: "only finance can edit the team" };
      const items = data.people || (() => {
        const item = { id: data.id };
        if ("name" in data) item.name = data.name;
        if ("rateUsd" in data) item.rateUsd = data.rateUsd;
        return [item];
      })();
      const updated = [];
      for (const item of items) {
        const person = db.people.find((p) => p.id === item.id);
        if (!person) continue;
        if ("name" in item && item.name !== undefined) {
          const name = String(item.name || "").trim();
          if (!name) return { error: "name cannot be empty" };
          person.name = name;
        }
        if ("rateUsd" in item) {
          if (item.rateUsd === null || item.rateUsd === undefined || item.rateUsd === "") {
            delete person.rateUsd;
          } else {
            const n = Number(String(item.rateUsd).replace(",", "."));
            if (!Number.isFinite(n) || n < 0) return { error: "pay rate must be a number, 0 or more" };
            person.rateUsd = n;
          }
        }
        updated.push(clone(person));
      }
      if (!updated.length && data.id) return { error: "not found" };
      writeDb(db);
      return { people: updated, state: clone(db) };
    }

    if (path === "/api/people/add") {
      if (data.role !== "finance") return { error: "only finance can add people" };
      const job = data.job || "designer";
      const labels = {
        designer: "Designer",
        teamlead: "Team lead",
        manager: "Manager",
        finance: "Finance",
      };
      if (!labels[job]) return { error: "unknown role" };
      const existing = new Set(db.people.map((p) => p.id));
      let n = 1;
      let pid = job;
      while (existing.has(pid)) {
        n += 1;
        pid = `${job}${n}`;
      }
      const palette = {
        designer: ["#00c875", "#579bfc", "#ff5ac4", "#fdab3d", "#9d50dd", "#00c2e0", "#bb3354"],
        teamlead: ["#fdab3d", "#e67e22"],
        manager: ["#9d50dd", "#7b2cbf"],
        finance: ["#0073ea", "#0059b3"],
      }[job];
      const count = db.people.filter((p) => p.role === job).length;
      const payOrder = Math.max(0, ...db.people.map((p) => Number(p.payOrder) || 0)) + 1;
      const titles = { designer: "Motion design", teamlead: "Team Lead", manager: "Line Producer" };
      const person = {
        id: pid,
        name: n === 1 ? labels[job] : `${labels[job]} ${n}`,
        role: job,
        color: palette[count % palette.length],
        payOrder,
      };
      if (titles[job]) person.jobTitle = titles[job];
      if (job === "manager") person.rateUsd = 5;
      else if (job === "designer" || job === "teamlead") person.rateUsd = 15;
      db.people.push(person);
      writeDb(db);
      return { person: clone(person), state: clone(db) };
    }

    if (path === "/api/people/delete") {
      if (data.role !== "finance") return { error: "only finance can delete people" };
      const person = db.people.find((p) => p.id === data.id);
      if (!person) return { error: "not found" };
      if (data.id === data.actorId) return { error: "you cannot delete yourself" };
      if (person.role === "finance" && db.people.filter((p) => p.role === "finance").length <= 1) {
        return { error: "keep at least one finance login" };
      }
      if (person.role === "client" && db.people.filter((p) => p.role === "client").length <= 1) {
        return { error: "keep the SuperPlay hours login" };
      }
      const held = db.tasks.filter((t) => t.assigneeId === data.id);
      if (held.length && !("reassignTo" in data)) {
        return { error: "this person still has projects — choose who takes them", count: held.length };
      }
      const dest = data.reassignTo || "";
      if (dest === data.id) return { error: "cannot move projects onto the person being deleted" };
      if (dest && !db.people.some((p) => p.id === dest)) return { error: "move-to person not found" };
      for (const task of db.tasks) {
        task.help = (task.help || []).filter((row) => row?.id !== data.id);
        if (dest && task.assigneeId === dest) {
          task.help = (task.help || []).filter((row) => row?.id !== dest);
        }
      }
      for (const task of held) {
        const before = { assigneeId: data.id, studioStatus: task.studioStatus };
        task.assigneeId = dest;
        if (dest) task.help = (task.help || []).filter((row) => row?.id !== dest);
        task.activity = task.activity || [];
        task.activity.push({
          at: now(),
          text: `Moved from deleted person to ${dest || "unassigned"}`,
        });
        if (dest && N()) N().onTaskChange(db, task, before, data.actorId);
      }
      db.people = db.people.filter((p) => p.id !== data.id);
      writeDb(db);
      return { deleted: data.id, reassigned: held.length, state: clone(db) };
    }

    if (path === "/api/notices/read") {
      if (N()) {
        if (data.all) N().ack(db, data.personId, { allMine: true });
        else if (data.taskId) N().ack(db, data.personId, { taskId: data.taskId });
        else N().ack(db, data.personId, { ids: data.ids || [] });
      }
      writeDb(db);
      return { state: clone(db) };
    }

    if (path === "/api/excel/pull") {
      return { added: 0, updated: 0, state: clone(db) };
    }
    if (path === "/api/excel/save") {
      return { error: "The SP_MGX_check calculator is updated in the studio sandbox, not on GitHub Pages." };
    }
    if (path === "/api/excel/import") {
      return { error: "Open the studio app to import SP_MGX_check.xlsx" };
    }

    return { error: "unknown endpoint" };
  }

  window.LGLocalApi = localApi;
})();
