const { once } = require("events");
const { createApp } = require("../src/app");
const { MongoStore } = require("../src/store");
const { DEFAULT_MONGODB_URL } = require("../src/constants");

async function requestJson(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, options);
  const data = await response.json();
  return {
    status: response.status,
    data,
  };
}

async function startApp(stateKey) {
  const store = await MongoStore.create({ stateKey });
  const app = createApp(store);
  app.server.listen(0);
  await once(app.server, "listening");
  const address = app.server.address();
  return {
    app,
    store,
    baseUrl: `http://127.0.0.1:${address.port}/api/v1`,
  };
}

async function stopRuntime(runtime) {
  await new Promise((resolve) => runtime.app.server.close(resolve));
  await runtime.store.close();
}

async function main() {
  const stateKey = `mongo_smoke_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const account = `mongo-${Date.now()}@example.com`;
  const password = "Passw0rd!";

  let runtime = await startApp(stateKey);

  try {
    const registered = await requestJson(runtime.baseUrl, "/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account,
        password,
        nickname: "mongo-user",
        avatarUrl: "",
      }),
    });
    if (registered.status !== 200 || registered.data.code !== 0) {
      throw new Error(`register failed: ${JSON.stringify(registered.data)}`);
    }

    const authHeaders = {
      Authorization: `Bearer ${registered.data.data.token}`,
      "Content-Type": "application/json",
    };

    const tags = await requestJson(runtime.baseUrl, "/tags", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ tags: ["mongo", "persist"] }),
    });
    if (tags.status !== 200 || tags.data.data.tags.length !== 2) {
      throw new Error("tag write failed");
    }

    const llmConfig = await requestJson(runtime.baseUrl, "/llm/config", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        provider: "deepseek",
        apiKey: "sk-test-key",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-chat",
        managedKeys: {
          qwen: "",
          deepseek: "sk-test-key",
          openai: "",
          gemini: "",
        },
      }),
    });
    if (llmConfig.status !== 200 || llmConfig.data.data.provider !== "deepseek") {
      throw new Error("llm config write failed");
    }

    const questionBank = await requestJson(runtime.baseUrl, "/question-bank/full", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        questions: [
          {
            id: "q_mongo_demo_001",
            type: "single",
            stem: "哪一项最能说明 MongoDB 已被接入当前后端？",
            tag: "mongo",
            options: [
              { key: "A", text: "同一账号重启后仍可恢复持久化数据" },
              { key: "B", text: "只能在当前进程内读取内存数据" },
              { key: "C", text: "后端完全不保存任何状态" },
              { key: "D", text: "刷新页面后所有数据都丢失" }
            ],
            answer: "A",
            explanation: "如果持久化层切到 MongoDB，同一账号的数据应在服务重启后继续可读。",
            evidence_quote: "Mongo persistence keeps backend state available across restarts.",
            keypoint_id: "kp_mongo_demo",
            difficulty: "easy",
            mode: "modeA",
            createdAt: Date.now(),
            practiceCount: 0,
            wrongCount: 0,
            isMastered: false
          }
        ]
      }),
    });
    if (questionBank.status !== 200 || questionBank.data.data.savedCount !== 1) {
      throw new Error("question bank write failed");
    }

    const session = await requestJson(runtime.baseUrl, "/practice-session/current", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        session: {
          id: `session_${Date.now()}`,
          createdAt: Date.now(),
          mode: "modeA",
          feedbackMode: "instant",
          generationJobId: null,
          questions: questionBank.data.data.savedCount
            ? [
                {
                  id: "q_mongo_demo_001",
                  type: "single",
                  stem: "哪一项最能说明 MongoDB 已被接入当前后端？",
                  tag: "mongo",
                  options: [
                    { key: "A", text: "同一账号重启后仍可恢复持久化数据" },
                    { key: "B", text: "只能在当前进程内读取内存数据" },
                    { key: "C", text: "后端完全不保存任何状态" },
                    { key: "D", text: "刷新页面后所有数据都丢失" }
                  ],
                  answer: "A",
                  explanation: "如果持久化层切到 MongoDB，同一账号的数据应在服务重启后继续可读。",
                  evidence_quote: "Mongo persistence keeps backend state available across restarts.",
                  keypoint_id: "kp_mongo_demo",
                  difficulty: "easy",
                  mode: "modeA",
                  createdAt: Date.now(),
                  practiceCount: 0,
                  wrongCount: 0,
                  isMastered: false
                }
              ]
            : []
        }
      }),
    });
    if (session.status !== 200 || !session.data.data.session) {
      throw new Error("practice session write failed");
    }

    await stopRuntime(runtime);
    runtime = await startApp(stateKey);

    const loggedIn = await requestJson(runtime.baseUrl, "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account, password }),
    });
    if (loggedIn.status !== 200 || loggedIn.data.code !== 0) {
      throw new Error("login after restart failed");
    }

    const loginHeaders = {
      Authorization: `Bearer ${loggedIn.data.data.token}`,
      "Content-Type": "application/json",
    };

    const restoredMe = await requestJson(runtime.baseUrl, "/users/me", {
      method: "GET",
      headers: loginHeaders,
    });
    const restoredTags = await requestJson(runtime.baseUrl, "/tags", {
      method: "GET",
      headers: loginHeaders,
    });
    const restoredConfig = await requestJson(runtime.baseUrl, "/llm/config", {
      method: "GET",
      headers: loginHeaders,
    });
    const restoredBank = await requestJson(runtime.baseUrl, "/question-bank/full", {
      method: "GET",
      headers: loginHeaders,
    });
    const restoredSession = await requestJson(runtime.baseUrl, "/practice-session/current", {
      method: "GET",
      headers: loginHeaders,
    });

    if (restoredMe.status !== 200 || restoredMe.data.data.account !== account) {
      throw new Error("user restore failed");
    }
    if (restoredTags.status !== 200 || restoredTags.data.data.tags.length !== 2) {
      throw new Error("tag restore failed");
    }
    if (restoredConfig.status !== 200 || restoredConfig.data.data.provider !== "deepseek") {
      throw new Error("llm config restore failed");
    }
    if (restoredBank.status !== 200 || restoredBank.data.data.questions.length !== 1) {
      throw new Error("question bank restore failed");
    }
    if (
      restoredSession.status !== 200 ||
      !restoredSession.data.data.session ||
      restoredSession.data.data.session.questions.length !== 1
    ) {
      throw new Error("practice session restore failed");
    }

    process.stdout.write(`Mongo smoke test passed. url=${DEFAULT_MONGODB_URL} stateKey=${stateKey}\n`);
  } finally {
    await stopRuntime(runtime);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
