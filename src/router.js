import { handleSetup } from "./handlers/setup.js";

export async function route(request, env, config) {
  const { pathname } = new URL(request.url);
  switch (pathname) {
    case "/setup":
      return handleSetup(request, env, config);
    default:
      return new Response("Not Found", { status: 404 });
  }
}
