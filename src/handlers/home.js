import { resolveUser } from "../auth/middleware.js";
import { htmlResponse, redirect } from "../utils/http.js";
import { homePage } from "../views/homePage.js";

export async function handleHome(request, env, config) {
  const auth = await resolveUser(request, env, config);
  if (!auth || auth.via !== "session") return redirect("/login");
  return htmlResponse(homePage(auth.user), 200, { "Cache-Control": "no-store" });
}
