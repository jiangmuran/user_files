import { handleSetup } from "./handlers/setup.js";
import { handleLogin, handleLogout } from "./handlers/login.js";
import { handleHome } from "./handlers/home.js";
import { handleUpload } from "./handlers/upload.js";
import { handleApiUpload } from "./handlers/apiUpload.js";
import { handleImage } from "./handlers/image.js";

export async function route(request, env, config) {
  const { pathname } = new URL(request.url);
  switch (pathname) {
    case "/":
      return handleHome(request, env, config);
    case "/setup":
      return handleSetup(request, env, config);
    case "/login":
      return handleLogin(request, env, config);
    case "/logout":
      return handleLogout(request);
    case "/upload":
      return handleUpload(request, env, config);
    case "/api/upload":
      return handleApiUpload(request, env, config);
    default:
      return handleImage(request, env, config);
  }
}
