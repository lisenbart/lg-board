const GDRIVE_SCOPE = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const DOC_MIME = "application/vnd.google-apps.document";

function driveAccessToken() {
  return String(state.driveAccessToken || sessionStorage.getItem("lgDriveToken") || "").trim();
}

function setDriveAccessToken(token) {
  state.driveAccessToken = String(token || "").trim();
  if (state.driveAccessToken) sessionStorage.setItem("lgDriveToken", state.driveAccessToken);
  else sessionStorage.removeItem("lgDriveToken");
}

function openDriveClientModal() {
  $("driveClientErr").textContent = "";
  $("driveClientJson").value = "";
  $("driveClientModal").classList.add("show");
  $("driveClientJson").focus();
}
function closeDriveClientModal() {
  $("driveClientModal").classList.remove("show");
}

function loadGis() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.querySelector("script[data-lg-gis]");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Google sign-in failed to load")));
      return;
    }
    const el = document.createElement("script");
    el.src = "https://accounts.google.com/gsi/client";
    el.async = true;
    el.dataset.lgGis = "1";
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Google sign-in failed to load"));
    document.head.appendChild(el);
  });
}

async function requestDriveToken(opts = {}) {
  const clientId = drivePack().clientId;
  if (!clientId) throw new Error("Paste the Google OAuth client JSON first");
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GDRIVE_SCOPE,
      callback: (resp) => {
        if (resp?.error) {
          reject(new Error(resp.error_description || resp.error));
          return;
        }
        const token = String(resp?.access_token || "").trim();
        if (!token) {
          reject(new Error("Google did not return a token"));
          return;
        }
        setDriveAccessToken(token);
        resolve(token);
      },
      error_callback: (err) => {
        reject(new Error(err?.message || "Google sign-in was cancelled"));
      },
    });
    client.requestAccessToken({ prompt: opts.prompt ?? "consent" });
  });
}

async function connectDrive() {
  if (!isFinance()) {
    toast("Sign in as DL to connect Drive");
    return;
  }
  if (!drivePack().hasClient || !drivePack().clientId) {
    openDriveClientModal();
    return;
  }
  try {
    const token = await requestDriveToken();
    const out = await api("/api/drive/token", { token });
    if (out.error) {
      toast(out.error);
      return;
    }
    if (out.drive) state.drive = out.drive;
    else state.drive = { ...(state.drive || {}), connected: true };
    toast("Drive connected · Create task can write folders");
    render();
  } catch (err) {
    toast(err.message || "Could not connect Drive");
  }
}

async function saveDriveClientJson() {
  const raw = String($("driveClientJson")?.value || "").trim();
  const err = $("driveClientErr");
  if (!raw) {
    if (err) err.textContent = "Paste the OAuth client JSON";
    return;
  }
  const out = await api("/api/drive/client", { json: raw });
  if (out.error) {
    if (err) err.textContent = out.error;
    return;
  }
  if (out.drive) state.drive = out.drive;
  closeDriveClientModal();
  toast("OAuth client saved · sign in with Google");
  await connectDrive();
}

async function gdriveApi(method, path, { query, body, upload } = {}) {
  const token = driveAccessToken();
  if (!token) throw new Error("Drive is not connected");
  const q = new URLSearchParams({ supportsAllDrives: "true", ...(query || {}) });
  const url = (upload ? "https://www.googleapis.com/upload/drive/v3/" : "https://www.googleapis.com/drive/v3/") + path + "?" + q;
  const headers = { Authorization: `Bearer ${token}` };
  let payload;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: payload });
  const text = await res.text();
  if (!res.ok) throw new Error(`Drive ${res.status}: ${text.slice(0, 220)}`);
  return text ? JSON.parse(text) : {};
}

async function gdriveFindChild(parentId, title, mime) {
  const safe = String(title).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  let q = `name = '${safe}' and '${parentId}' in parents and trashed = false`;
  if (mime) q += ` and mimeType = '${mime}'`;
  const out = await gdriveApi("GET", "files", {
    query: { q, fields: "files(id,name,mimeType)", pageSize: "10", includeItemsFromAllDrives: "true" },
  });
  return (out.files || [])[0] || null;
}

async function gdriveMkdir(parentId, title) {
  const found = await gdriveFindChild(parentId, title, FOLDER_MIME);
  if (found) return found.id;
  const created = await gdriveApi("POST", "files", {
    query: { fields: "id" },
    body: { name: title, mimeType: FOLDER_MIME, parents: [parentId] },
  });
  return created.id;
}

async function gdriveCreateDoc(parentId, title) {
  const found = await gdriveFindChild(parentId, title, DOC_MIME);
  if (found) return found.id;
  const created = await gdriveApi("POST", "files", {
    query: { fields: "id" },
    body: { name: title, mimeType: DOC_MIME, parents: [parentId] },
  });
  return created.id;
}

async function gdriveWriteBrief(docId, text) {
  const token = driveAccessToken();
  if (!token) throw new Error("Drive is not connected");
  const got = await fetch(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(docId)}?fields=body(content(endIndex))`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const doc = await got.json();
  if (!got.ok) throw new Error(`Docs ${got.status}: ${JSON.stringify(doc).slice(0, 220)}`);
  let end = 1;
  for (const block of doc.body?.content || []) {
    const n = Number(block.endIndex || 1);
    if (n > end) end = n;
  }
  const requests = [];
  if (end > 2) requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: end - 1 } } });
  const body = String(text || "").trim();
  if (body) requests.push({ insertText: { location: { index: 1 }, text: body } });
  if (!requests.length) return;
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(docId)}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Docs write ${res.status}: ${err.slice(0, 220)}`);
  }
}

async function gdriveCreatePack(name, line) {
  const parentId = (line || "DD").toUpperCase() === "DX" ? drivePack().octoberDXId : drivePack().octoberDDId;
  if (!parentId) throw new Error("October DD/DX folder is not configured");
  if (!driveAccessToken()) await requestDriveToken({ prompt: "" });
  const folderId = await gdriveMkdir(parentId, name);
  const docId = await gdriveCreateDoc(folderId, name);
  return {
    folderId,
    docId,
    folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
    docUrl: `https://docs.google.com/document/d/${docId}/edit`,
  };
}

async function persistDriveToken() {
  const token = driveAccessToken();
  if (!token) return;
  const out = await api("/api/drive/token", { token });
  if (out.drive) state.drive = out.drive;
  else if (!out.error) state.drive = { ...(state.drive || {}), connected: true };
}
