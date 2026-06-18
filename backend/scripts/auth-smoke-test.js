const fs = require("fs");
const os = require("os");
const path = require("path");
const { once } = require("events");
const { createApp } = require("../src/app");
const { MemoryStore } = require("../src/store");

async function requestJson(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, options);
  const data = await response.json();
  return {
    status: response.status,
    data,
  };
}

async function startApp(filePath) {
  const store = new MemoryStore({ filePath });
  const app = createApp(store);
  app.server.listen(0);
  await once(app.server, "listening");
  const address = app.server.address();
  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}/api/v1`,
  };
}

function assertAuthEnvelope(response, label) {
  if (response.status !== 200 || response.data.code !== 0) {
    throw new Error(`${label} failed: ${JSON.stringify(response.data)}`);
  }

  const data = response.data.data || {};
  if (!String(data.token || "").trim()) {
    throw new Error(`${label} missing token`);
  }
  if (!String(data.refreshToken || "").trim()) {
    throw new Error(`${label} missing refreshToken`);
  }
  if (!Number.isFinite(data.expiresIn) || data.expiresIn <= 0) {
    throw new Error(`${label} missing expiresIn`);
  }
  if (!data.user || !String(data.user.userId || "").trim()) {
    throw new Error(`${label} missing user.userId`);
  }
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aihouduan-auth-"));
  const filePath = path.join(tempDir, "state.json");
  let runtime = await startApp(filePath);

  try {
    const emailRegister = await requestJson(runtime.baseUrl, "/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "auth.email@example.com",
        password: "Passw0rd!",
        nickname: "email-user",
      }),
    });
    assertAuthEnvelope(emailRegister, "email register");
    if (emailRegister.data.data.user.account !== "auth.email@example.com") {
      throw new Error("email register should normalize into user.account");
    }

    const emailLogin = await requestJson(runtime.baseUrl, "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account: "auth.email@example.com",
        password: "Passw0rd!",
      }),
    });
    assertAuthEnvelope(emailLogin, "email login");
    if (emailLogin.data.data.user.userId !== emailRegister.data.data.user.userId) {
      throw new Error("email login should restore the same user");
    }

    const phoneRegister = await requestJson(runtime.baseUrl, "/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "13800138000",
        password: "Passw0rd!",
        nickname: "phone-user",
      }),
    });
    assertAuthEnvelope(phoneRegister, "phone register");
    if (phoneRegister.data.data.user.account !== "13800138000") {
      throw new Error("phone register should normalize into user.account");
    }

    const phoneLogin = await requestJson(runtime.baseUrl, "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "13800138000",
        password: "Passw0rd!",
      }),
    });
    assertAuthEnvelope(phoneLogin, "phone login");
    if (phoneLogin.data.data.user.userId !== phoneRegister.data.data.user.userId) {
      throw new Error("phone login should restore the same user");
    }

    process.stdout.write("Auth smoke test passed.\n");
  } finally {
    await new Promise((resolve) => runtime.app.server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
