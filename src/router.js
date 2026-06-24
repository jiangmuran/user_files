import { handleSetup } from "./handlers/setup.js";
import { handleLogin, handleLogout } from "./handlers/login.js";
import { handleHome } from "./handlers/home.js";
import { handleUpload } from "./handlers/upload.js";
import { handleApiUpload } from "./handlers/apiUpload.js";
import { handleImage } from "./handlers/image.js";
import { handleBing } from "./handlers/bing.js";
import { handleDelete } from "./handlers/delete.js";
import { handleAdmin } from "./handlers/admin.js";
import { handleUsersPage, handleUsersAction } from "./handlers/users.js";
import { handleApiKeysPage, handleApiKeysAction } from "./handlers/apikeysUi.js";

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
    case "/bing-images":
      return handleBing();
    case "/delete-images":
      return handleDelete(request, env, config);
    case "/admin":
      return handleAdmin(request, env, config);
    case "/users":
      return handleUsersPage(request, env, config);
    case "/users/create":
      return handleUsersAction(request, env, config, "create");
    case "/users/update":
      return handleUsersAction(request, env, config, "update");
    case "/users/delete":
      return handleUsersAction(request, env, config, "delete");
    case "/apikeys":
      return handleApiKeysPage(request, env, config);
    case "/apikeys/create":
      return handleApiKeysAction(request, env, config, "create");
    case "/apikeys/delete":
      return handleApiKeysAction(request, env, config, "delete");
    default:
      return handleImage(request, env, config);
  }
}
