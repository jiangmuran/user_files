import { escapeHtml } from "../utils/html.js";

// ── Design system: "developer console" ──────────────────────────────
// Dark blue-slate canvas, hairline borders, monospace as the lead voice,
// a single warm-amber accent. The signature is terminal language (prompts,
// mono readouts) rather than decoration. Boldness is spent on the upload
// dropzone + link readout; everything else stays quiet.
const BASE_CSS = `
:root{
  --bg:#0d1117; --panel:#161b22; --panel2:#1c232d; --line:#2a313c; --line2:#3a4351;
  --text:#e6edf3; --muted:#8b949e; --faint:#6e7681;
  --accent:#f2a33c; --accent2:#ffbe63; --accent-dim:rgba(242,163,60,.12);
  --danger:#f2675c; --danger-dim:rgba(242,103,92,.12); --ok:#46c28e;
  --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --sans:"Space Grotesk",ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;
  --r:8px; --maxw:1080px;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--sans);font-size:15px;
  line-height:1.5;-webkit-font-smoothing:antialiased;min-height:100vh}
::selection{background:var(--accent);color:#0d1117}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-thumb{background:var(--line2);border-radius:10px}
::-webkit-scrollbar-track{background:transparent}
.mono{font-family:var(--mono)}
.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}

/* top bar */
.topbar{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;
  gap:12px;padding:12px 20px;background:rgba(13,17,23,.82);backdrop-filter:blur(8px);
  border-bottom:1px solid var(--line)}
.brand{font-family:var(--mono);font-weight:500;color:var(--text);display:flex;align-items:center;gap:8px;font-size:14px}
.brand:hover{text-decoration:none}
.brand .dot{color:var(--accent)}
.nav{display:flex;align-items:center;gap:2px;flex-wrap:wrap}
.nav a,.nav .navbtn{font-family:var(--mono);font-size:13px;color:var(--muted);background:none;border:none;
  padding:6px 10px;border-radius:6px;cursor:pointer;transition:color .15s,background .15s}
.nav a:hover,.nav .navbtn:hover{color:var(--text);background:var(--panel);text-decoration:none}
.nav a.active{color:var(--accent)}
.chip{font-family:var(--mono);font-size:12px;color:var(--muted);background:var(--panel);
  border:1px solid var(--line);border-radius:999px;padding:4px 10px;margin-left:4px}
.chip b{color:var(--text);font-weight:500}

/* page shell */
.page{max-width:var(--maxw);margin:0 auto;padding:30px 20px 64px}
h1{font-family:var(--sans);font-weight:700;font-size:27px;letter-spacing:-.015em;margin:6px 0 4px}
.sub{color:var(--muted);font-size:14px;margin:0 0 24px}

/* buttons */
.btn{font-family:var(--mono);font-size:13px;color:var(--text);background:var(--panel2);
  border:1px solid var(--line);border-radius:6px;padding:8px 14px;cursor:pointer;
  transition:border-color .15s,background .15s;line-height:1.4}
.btn:hover{border-color:var(--line2);background:#222b37}
.btn-primary{background:var(--accent);color:#0d1117;border-color:var(--accent);font-weight:500}
.btn-primary:hover{background:var(--accent2);border-color:var(--accent2)}
.btn-danger{color:var(--danger);background:transparent;border-color:transparent}
.btn-danger:hover{background:var(--danger-dim);border-color:var(--danger)}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-sm{padding:5px 9px;font-size:12px}

/* inputs */
.input,.select,textarea{font-family:var(--mono);font-size:13px;color:var(--text);background:var(--panel2);
  border:1px solid var(--line);border-radius:6px;padding:9px 11px;width:100%}
.input::placeholder,textarea::placeholder{color:var(--faint)}
.input:focus,.select:focus,textarea:focus{outline:none;border-color:var(--accent)}
.select{appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--muted) 50%),linear-gradient(135deg,var(--muted) 50%,transparent 50%);
  background-position:calc(100% - 16px) 52%,calc(100% - 11px) 52%;background-size:5px 5px,5px 5px;background-repeat:no-repeat;padding-right:30px}
.field{margin:14px 0}
.field label{display:block;font-family:var(--mono);font-size:12px;color:var(--muted);margin-bottom:6px;letter-spacing:.03em}

/* surfaces */
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:20px}
.alert{font-family:var(--mono);font-size:13px;border-radius:6px;padding:10px 12px;margin-bottom:16px}
.alert-error{background:var(--danger-dim);border:1px solid var(--danger);color:#ffb3ac}
.alert-ok{background:rgba(70,194,142,.12);border:1px solid var(--ok);color:#9be8c8}

/* table */
.table-wrap{border:1px solid var(--line);border-radius:var(--r);overflow:hidden;overflow-x:auto}
table.tbl{width:100%;border-collapse:collapse;font-size:13px}
table.tbl th{font-family:var(--mono);font-weight:500;text-transform:uppercase;letter-spacing:.06em;
  font-size:11px;color:var(--muted);text-align:left;padding:11px 14px;background:var(--panel);border-bottom:1px solid var(--line)}
table.tbl td{padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:middle}
table.tbl tr:last-child td{border-bottom:none}
table.tbl tbody tr:hover td{background:rgba(255,255,255,.02)}
table.tbl code{font-family:var(--mono);color:var(--accent)}

.empty{font-family:var(--mono);color:var(--muted);text-align:center;padding:64px 20px;
  border:1px dashed var(--line);border-radius:var(--r)}

/* auth screens */
.auth{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.auth-card{width:100%;max-width:392px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:30px}
.auth-card .mark{font-family:var(--mono);font-size:11px;color:var(--accent);letter-spacing:.12em;text-transform:uppercase}
.auth-card h1{font-size:23px;margin:8px 0 2px}
.auth-card .btn-primary{width:100%;margin-top:20px;padding:11px}

.foot{font-family:var(--mono);font-size:12px;color:var(--faint);text-align:center;margin-top:44px}
.foot a{color:var(--muted)}

@media (max-width:560px){.page{padding:22px 14px 48px}h1{font-size:22px}.nav .chip{display:none}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Space+Grotesk:wght@400;500;700&display=swap" rel="stylesheet">`;

export function pageLayout({ title, body, head = "" }) {
  return `<!DOCTYPE html><html lang="zh-CN"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#0d1117">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230d1117'/%3E%3Ctext x='16' y='22' font-family='monospace' font-size='18' fill='%23f2a33c' text-anchor='middle'%3E%E2%96%B8%3C/text%3E%3C/svg%3E">
${FONTS}
<style>${BASE_CSS}</style>
${head}
</head><body>${body}</body></html>`;
}

// Shared top navigation. active ∈ "home" | "admin" | "users" | "apikeys".
export function topbar(user, active = "") {
  const link = (href, key, label) => `<a href="${href}"${active === key ? ' class="active"' : ""}>${label}</a>`;
  return `<header class="topbar">
  <a class="brand" href="/"><span class="dot">▸</span>files.muran.tech</a>
  <nav class="nav">
    ${link("/", "home", "上传")}
    ${link("/admin", "admin", "图库")}
    ${user.role === "admin" ? link("/users", "users", "用户") : ""}
    ${link("/apikeys", "apikeys", "API&nbsp;Key")}
    <span class="chip"><b>${escapeHtml(user.username)}</b> · ${escapeHtml(user.role)}</span>
    <form method="post" action="/logout" style="display:inline"><button type="submit" class="navbtn">登出</button></form>
  </nav>
</header>`;
}
