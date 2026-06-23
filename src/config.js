export function extractConfig(env) {
  return {
    domain: env.DOMAIN,
    sessionSecret: env.SESSION_SECRET,
    tgBotToken: env.TG_BOT_TOKEN,
    tgChatId: env.TG_CHAT_ID,
    maxSize: (env.MAX_SIZE_MB ? parseInt(env.MAX_SIZE_MB, 10) : 20) * 1024 * 1024,
  };
}
