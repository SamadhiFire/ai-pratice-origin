const fs = require("fs");
const os = require("os");
const path = require("path");
const { once } = require("events");
const { createApp } = require("../src/app");
const { PROVIDER_DEFAULTS } = require("../src/constants");
const { createProviderText } = require("../src/llm-provider");
const { MemoryStore } = require("../src/store");

const PROVIDER_ENV_KEYS = {
  qwen: "DASHSCOPE_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};

const PROVIDER_PROMPTS = {
  qwen: {
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "\u4f60\u662f\u8c01\uff1f" },
    ],
    nickname: "qwen-test",
    material:
      "\u725b\u987f\u7b2c\u4e00\u5b9a\u5f8b\u8bf4\u660e\uff0c\u5982\u679c\u7269\u4f53\u4e0d\u53d7\u5916\u529b\u4f5c\u7528\uff0c\u5b83\u5c06\u4fdd\u6301\u9759\u6b62\u6216\u5300\u901f\u76f4\u7ebf\u8fd0\u52a8\u3002\u6469\u64e6\u529b\u4f1a\u6539\u53d8\u7269\u4f53\u7684\u8fd0\u52a8\u72b6\u6001\uff0c\u56e0\u6b64\u5728\u5206\u6790\u53d7\u529b\u65f6\u5fc5\u987b\u533a\u5206\u7406\u60f3\u60c5\u51b5\u548c\u771f\u5b9e\u60c5\u51b5\u3002",
    tags: ["physics", "motion"],
  },
  deepseek: {
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      {
        role: "user",
        content: "Reply with one short sentence about what you can help with.",
      },
    ],
    nickname: "deepseek-test",
    material:
      "\u540e\u7aef\u670d\u52a1\u5e94\u901a\u8fc7\u7edf\u4e00\u7684\u54cd\u5e94\u7ed3\u6784\u8fd4\u56de\u6570\u636e\u3002\u5bf9\u4e8e\u9519\u8bef\u573a\u666f\uff0c\u9700\u8981\u8fd4\u56de\u660e\u786e\u7684\u9519\u8bef\u7801\u548c\u6d88\u606f\uff0c\u5e76\u8bb0\u5f55\u8bf7\u6c42\u4e0a\u4e0b\u6587\uff0c\u4fbf\u4e8e\u6392\u67e5\u95ee\u9898\u3002",
    tags: ["backend", "api"],
  },
  openai: {
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Say hello in one sentence." },
    ],
    nickname: "openai-test",
    material:
      "API contracts should be explicit. Stable response envelopes and validation rules reduce client-side ambiguity and lower integration cost.",
    tags: ["api", "contracts"],
  },
  gemini: {
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Introduce yourself in one short sentence." },
    ],
    nickname: "gemini-test",
    material:
      "Learning systems should keep question generation deterministic when provider output is invalid, while still preferring live model output whenever the backend contract is satisfied.",
    tags: ["learning", "generation"],
  },
};

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

function resolveProviderInput() {
  const provider = String(process.argv[2] || "qwen").trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(PROVIDER_DEFAULTS, provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  return provider;
}

async function main() {
  const provider = resolveProviderInput();
  const envKey = PROVIDER_ENV_KEYS[provider];
  if (!String(process.env[envKey] || "").trim()) {
    throw new Error(`Set ${envKey} before running this script.`);
  }

  const providerConfig = PROVIDER_DEFAULTS[provider];
  const prompts = PROVIDER_PROMPTS[provider];

  const hello = await createProviderText({
    config: {
      provider,
      baseUrl: providerConfig.baseUrl,
      model: providerConfig.model,
    },
    messages: prompts.messages,
    temperature: 0,
    maxOutputTokens: 256,
  });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `aihouduan-${provider}-`));
  const filePath = path.join(tempDir, "state.json");
  let runtime = await startApp(filePath);

  try {
    const guestLogin = await requestJson(runtime.baseUrl, "/auth/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: prompts.nickname, avatarUrl: "" }),
    });
    if (guestLogin.status !== 200 || guestLogin.data.code !== 0) {
      throw new Error("guest login failed");
    }

    const token = guestLogin.data.data.token;
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const saveConfig = await requestJson(runtime.baseUrl, "/llm/config", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        provider,
        baseUrl: providerConfig.baseUrl,
        model: providerConfig.model,
      }),
    });
    if (saveConfig.status !== 200 || saveConfig.data.data.provider !== provider) {
      throw new Error(`${provider} config save failed`);
    }

    const verify = await requestJson(runtime.baseUrl, "/llm/config/verify", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        provider,
        baseUrl: providerConfig.baseUrl,
        model: providerConfig.model,
      }),
    });
    if (verify.status !== 200 || verify.data.data.status !== "success") {
      throw new Error(`${provider} verify failed: ${JSON.stringify(verify.data)}`);
    }

    const generated = await requestJson(runtime.baseUrl, "/questions/generate", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        material: prompts.material,
        type: "single",
        difficulty: "medium",
        mode: "modeA",
        feedbackMode: "instant",
        targetCount: 3,
        initialBatchCount: 3,
        userTags: prompts.tags,
        requestNonce: Date.now(),
      }),
    });
    if (generated.status !== 200 || generated.data.data.session.questions.length !== 3) {
      throw new Error(`question generation failed: ${JSON.stringify(generated.data)}`);
    }

    process.stdout.write(
      JSON.stringify(
        {
          provider,
          hello: hello.text,
          transport: hello.transport,
          verify: verify.data.data,
          execution: generated.data.data.generationJob.execution,
          firstQuestion: generated.data.data.session.questions[0],
        },
        null,
        2
      ) + "\n"
    );
  } finally {
    await new Promise((resolve) => runtime.app.server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
