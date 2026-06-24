import { escapeHtml } from "../utils/html.js";

const BASE_CSS = `
  *{box-sizing:border-box} body{margin:0;font-family:'Segoe UI',Tahoma,sans-serif;
  background:linear-gradient(135deg,#f5f7fa 0%,#e4e8f0 100%);min-height:100vh}
  .auth-card{max-width:380px;margin:8vh auto;background:#fff;border-radius:16px;
  box-shadow:0 8px 32px rgba(0,0,0,.1);padding:32px}
  .auth-card h1{font-size:24px;text-align:center;background:linear-gradient(135deg,#667eea,#764ba2);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;margin:0 0 24px}
  .auth-card label{display:block;font-size:14px;color:#555;margin:12px 0 6px}
  .auth-card input{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:15px}
  .auth-card button{width:100%;margin-top:20px;padding:11px;border:none;border-radius:8px;color:#fff;
  font-weight:500;cursor:pointer;background:linear-gradient(135deg,#667eea,#764ba2)}
  .auth-error{background:#fdecea;color:#b3261e;border-radius:8px;padding:10px;font-size:14px;margin-bottom:8px}
`;

export function pageLayout({ title, body, head = "" }) {
  return `<!DOCTYPE html><html lang="zh-CN"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="https://p1.meituan.net/csc/c195ee91001e783f39f41ffffbbcbd484286.ico" type="image/x-icon">
<style>${BASE_CSS}</style>
${head}
</head><body>${body}</body></html>`;
}
