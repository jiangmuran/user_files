import { isTypeAllowed, extensionOf, categoryForExtension } from "../auth/filetypes.js";
import { getContentType } from "../utils/contentType.js";
import { insertMedia } from "../db/media.js";

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export async function performUpload({ file, user, env, config }) {
  if (!file || typeof file === "string") throw fail(400, "缺少文件");
  if (file.size > config.maxSize) throw fail(413, `文件大小超过 ${config.maxSize / (1024 * 1024)}MB 限制`);
  if (!isTypeAllowed(file.name, user.allowed_types)) {
    const cat = categoryForExtension(extensionOf(file.name));
    throw fail(415, `你的账号不允许上传 ${cat} 类型文件（允许：${user.allowed_types}）`);
  }

  const fd = new FormData();
  fd.append("chat_id", config.tgChatId);
  let toSend = file;
  if (file.type.startsWith("image/gif")) {
    toSend = new File([file], file.name.replace(/\.gif$/i, ".jpeg"), { type: "image/jpeg" });
  }
  fd.append("document", toSend);

  const tgRes = await fetch(`https://api.telegram.org/bot${config.tgBotToken}/sendDocument`, { method: "POST", body: fd });
  if (!tgRes.ok) {
    const err = await tgRes.json().catch(() => ({}));
    throw fail(502, err.description || "上传到 Telegram 失败");
  }
  const data = await tgRes.json();
  const fileId = data.result?.video?.file_id || data.result?.document?.file_id || data.result?.sticker?.file_id;
  if (!fileId) throw fail(502, "返回数据中没有文件 ID");

  const ext = extensionOf(file.name);
  const ts = Date.now();
  const url = `https://${config.domain}/${ts}.${ext}`;
  await insertMedia(env.DATABASE, {
    url, fileId, ownerId: user.id, filename: file.name,
    contentType: getContentType(ext), extension: ext, size: file.size, createdAt: ts,
  });
  return { url };
}
