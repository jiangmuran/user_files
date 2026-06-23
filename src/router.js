import { handleSetup } from "./handlers/setup.js";
import { handleLogin, handleLogout } from "./handlers/login.js";

export async function route(request, env, config) {
  const { pathname } = new URL(request.url);
  switch (pathname) {
    case "/setup":
      return handleSetup(request, env, config);
    case "/login":
      return handleLogin(request, env, config);
    case "/logout":
      return handleLogout(request);
    default:
      return new Response("Not Found", { status: 404 });
  }
}
