/** Browser store so the client demo runs on Netlify / GitHub Pages without Python. */
(function () {
  const KEY = "lg-board-db-v1";
  const EMAIL_LINE =
    /^\s*([A-Z]{2}-[A-Za-z0-9._-]+)\s*\|\s*([\d]+(?:[.,]\d+)?)\s*shifts?\s*$/i;

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const hoursFromShift = (shift) => Math.round(Number(shift) * 9 * 10) / 10;
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

  async function ensureDb() {
    return readDb() || writeDb(await loadSeed());
  }

  async function localApi(path, payload) {
    const data = payload || {};
    let db = await ensureDb();

    if (path === "/api/state") return clone(db);

    if (path === "/api/reset") {
      db = writeDb(await loadSeed());
      return clone(db);
    }

    if (path === "/api/parse-email") {
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
          folderUrl: "",
          docUrl: "",
          resultUrl: "",
          source: "monday",
          activity: [{ at: now(), text: "Pulled from Monday External Weekly" }],
        });
        added += 1;
      }
      db.events = db.events || [];
      db.events.unshift({ at: now(), text: `Monday import: ${added} new tasks` });
      writeDb(db);
      return { added, state: clone(db) };
    }

    if (path === "/api/export-monday") {
      const ids = new Set(data.ids || []);
      const exported = [];
      for (const task of db.tasks) {
        if (!ids.has(task.id) || !task.resultUrl) continue;
        task.studioStatus = "approve";
        task.mondayStatus = "Senior Approval";
        task.activity = task.activity || [];
        task.activity.push({
          at: now(),
          text: "Sent to Monday: check it please + link → Senior Approval",
        });
        exported.push({
          name: task.name,
          reply: `check it please\n${task.resultUrl}`,
          mondayStatus: "Senior Approval",
        });
      }
      db.events = db.events || [];
      db.events.unshift({
        at: now(),
        text: `Sent ${exported.length} tasks to Monday Senior Approval`,
      });
      writeDb(db);
      return { exported, state: clone(db) };
    }

    if (path === "/api/provision") {
      const ids = new Set(data.ids || []);
      const dd = db.meta?.driveOctoberDD || "";
      const dx = db.meta?.driveOctoberDX || "";
      let n = 0;
      for (const task of db.tasks) {
        if (!ids.has(task.id)) continue;
        const parent = task.line === "DD" ? dd : dx;
        if (!task.folderUrl) task.folderUrl = parent;
        if (!task.docUrl) task.docUrl = parent;
        task.activity = task.activity || [];
        task.activity.push({
          at: now(),
          text: "Folder/brief marked in _PORTAL_TEST (sandbox, not live October)",
        });
        n += 1;
      }
      writeDb(db);
      return { provisioned: n, state: clone(db) };
    }

    if (path === "/api/tasks/update") {
      const task = db.tasks.find((t) => t.id === data.id);
      if (!task) return { error: "not found" };
      const nxt = data.studioStatus;
      const role = data.role || "";
      const allowed = {
        designer: new Set(["wip", "done"]),
        teamlead: new Set(["new", "wip", "revision", "done"]),
        manager: new Set(["new", "wip", "revision", "done", "approve"]),
        finance: new Set(["new", "wip", "revision", "done", "approve"]),
      };
      if (nxt && nxt !== task.studioStatus && allowed[role] && !allowed[role].has(nxt)) {
        return { error: `${role} cannot set ${nxt}` };
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
      for (const key of ["studioStatus", "assigneeId", "resultUrl", "brief", "folderUrl", "docUrl"]) {
        if (key in data) task[key] = data[key];
      }
      if (data.note) {
        task.activity = task.activity || [];
        task.activity.push({ at: now(), text: data.note });
      }
      writeDb(db);
      return { task: clone(task), state: clone(db) };
    }

    if (path === "/api/people/update") {
      if (data.role !== "finance") return { error: "only finance can rename people" };
      const items = data.people || [{ id: data.id, name: data.name }];
      const updated = [];
      for (const item of items) {
        const person = db.people.find((p) => p.id === item.id);
        if (!person) continue;
        const name = String(item.name || "").trim();
        if (!name) return { error: "name cannot be empty" };
        person.name = name;
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
      const person = {
        id: pid,
        name: n === 1 ? labels[job] : `${labels[job]} ${n}`,
        role: job,
        color: palette[count % palette.length],
      };
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
      const held = db.tasks.filter((t) => t.assigneeId === data.id);
      if (held.length && !("reassignTo" in data)) {
        return { error: "this person still has projects — choose who takes them", count: held.length };
      }
      const dest = data.reassignTo || "";
      if (dest === data.id) return { error: "cannot move projects onto the person being deleted" };
      if (dest && !db.people.some((p) => p.id === dest)) return { error: "move-to person not found" };
      for (const task of held) {
        task.assigneeId = dest;
        task.activity = task.activity || [];
        task.activity.push({
          at: now(),
          text: `Moved from deleted person to ${dest || "unassigned"}`,
        });
      }
      db.people = db.people.filter((p) => p.id !== data.id);
      writeDb(db);
      return { deleted: data.id, reassigned: held.length, state: clone(db) };
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
