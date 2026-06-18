const fs = require("fs");
process.env.ALLOW_DETERMINISTIC_FALLBACK = "1";
const os = require("os");
const path = require("path");
const { once } = require("events");
const { createApp } = require("../src/app");
const { MemoryStore } = require("../src/store");

async function requestRaw(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, options);
  const text = await response.text();
  return {
    status: response.status,
    data: text ? JSON.parse(text) : null,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

async function requestJson(baseUrl, pathName, options = {}) {
  const response = await requestRaw(baseUrl, pathName, options);
  return {
    status: response.status,
    data: response.data,
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

function ensureDistinctStems(questions) {
  const seen = new Set();
  for (const question of questions) {
    const signature = String(question.stem || "")
      .replace(/[\p{P}\p{S}\s]+/gu, "")
      .toLowerCase();
    if (seen.has(signature)) {
      throw new Error("question stems should stay distinct");
    }
    seen.add(signature);
  }
}

function ensureNoLowSignalText(questions) {
  const bannedPatterns = [/非常棒的问题/, /好问题/, /值得思考/];
  for (const question of questions) {
    const texts = [
      String(question.stem || ""),
      String(question.evidence_quote || ""),
      ...((question.options || []).map((option) => String(option.text || ""))),
    ];
    for (const text of texts) {
      if (bannedPatterns.some((pattern) => pattern.test(text))) {
        throw new Error("generated question should not contain low-signal filler text");
      }
    }
  }
}

function ensureGeneratedQuestionShape(questions) {
  if (questions.length !== 5) {
    throw new Error("generated question count mismatch");
  }

  for (const question of questions) {
    if (question.type !== "multi") {
      throw new Error("expected multi-select questions");
    }
    if (question.mode !== "modeB") {
      throw new Error("expected modeB questions");
    }
    if (question.difficulty !== "hard") {
      throw new Error("expected hard difficulty questions");
    }
    if (!Array.isArray(question.options) || question.options.length !== 4) {
      throw new Error("each question must contain exactly four options");
    }
    const answerCount = String(question.answer || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean).length;
    if (answerCount < 2 || answerCount > 3) {
      throw new Error("multi-select question must contain two or three answers");
    }
    if (!String(question.explanation || "").trim()) {
      throw new Error("question explanation is required");
    }
  }

  ensureDistinctStems(questions);
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aihouduan-"));
  const filePath = path.join(tempDir, "state.json");
  const account = "tester@example.com";
  const password = "Passw0rd!";

  let runtime = await startApp(filePath);

  try {
    const registered = await requestJson(runtime.baseUrl, "/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account,
        password,
        nickname: "tester",
        avatarUrl: "",
      }),
    });
    if (
      registered.status !== 200 ||
      registered.data.code !== 0 ||
      registered.data.data.user.account !== account
    ) {
      throw new Error("account registration failed");
    }

    const token = registered.data.data.token;
    const refreshToken = registered.data.data.refreshToken;
    const userId = registered.data.data.user.userId;
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const preflight = await requestRaw(runtime.baseUrl, "/questions/generate", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    const allowHeaders = String(preflight.headers["access-control-allow-headers"] || "").toLowerCase();
    const allowMethods = String(preflight.headers["access-control-allow-methods"] || "").toLowerCase();
    if (
      preflight.status !== 204 ||
      preflight.headers["access-control-allow-origin"] !== "http://localhost:5173" ||
      !allowHeaders.includes("authorization") ||
      !allowHeaders.includes("content-type") ||
      !allowMethods.includes("get") ||
      !allowMethods.includes("post") ||
      !allowMethods.includes("put") ||
      !allowMethods.includes("patch") ||
      !allowMethods.includes("delete") ||
      !allowMethods.includes("options") ||
      !String(preflight.headers["access-control-max-age"] || "").trim()
    ) {
      throw new Error(`CORS preflight failed: ${JSON.stringify(preflight)}`);
    }

    const missingToken = await requestJson(runtime.baseUrl, "/llm/config", {
      method: "GET",
      headers: {
        Origin: "http://localhost:5173",
      },
    });
    if (
      missingToken.status !== 401 ||
      missingToken.data.code !== 40100 ||
      typeof missingToken.data.message !== "string" ||
      !missingToken.data.message.trim() ||
      !missingToken.data.data ||
      Array.isArray(missingToken.data.data)
    ) {
      throw new Error(`missing token handling failed: ${JSON.stringify(missingToken)}`);
    }

    const invalidToken = await requestJson(runtime.baseUrl, "/llm/config", {
      method: "GET",
      headers: {
        Origin: "http://localhost:5173",
        Authorization: "Bearer invalid-token",
      },
    });
    if (
      invalidToken.status !== 401 ||
      invalidToken.data.code !== 40100 ||
      typeof invalidToken.data.message !== "string" ||
      !invalidToken.data.message.trim() ||
      !invalidToken.data.data ||
      Array.isArray(invalidToken.data.data)
    ) {
      throw new Error(`invalid token handling failed: ${JSON.stringify(invalidToken)}`);
    }

    const tags = await requestJson(runtime.baseUrl, "/tags", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        tags: ["english", "reading", "extension"],
      }),
    });
    if (tags.status !== 200 || tags.data.data.tags.length !== 3) {
      throw new Error("tags update failed");
    }

    const llmConfig = await requestJson(runtime.baseUrl, "/llm/config", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        provider: "openai",
        apiKey: "",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-5.2",
        managedKeys: {
          qwen: "",
          deepseek: "",
          openai: "",
          gemini: "",
        },
      }),
    });
    if (llmConfig.status !== 200 || llmConfig.data.data.provider !== "openai") {
      throw new Error("llm config save failed");
    }

    const invalidBatchCount = await requestJson(runtime.baseUrl, "/questions/generate", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        material: [
          "Reading comprehension should track explicit evidence before making conclusions.",
          "When extending a claim, the student must keep the original topic and boundary conditions in view.",
          "High-quality distractors often borrow part of the source idea but twist the scope, condition, or logical direction.",
          "A difficult question should separate source-supported inference from attractive but overextended interpretation.",
          "Review mode after the full paper should emphasize the reason each tempting option fails.",
        ].join(" "),
        type: "multi",
        difficulty: "hard",
        mode: "modeB",
        feedbackMode: "after_all",
        targetCount: 5,
        initialBatchCount: 3,
        userTags: ["english", "reading", "extension"],
        requestNonce: 123455,
      }),
    });
    if (
      invalidBatchCount.status !== 400 ||
      invalidBatchCount.data.code !== 40001 ||
      invalidBatchCount.data.message !== "initialBatchCount must equal targetCount"
    ) {
      throw new Error(`initialBatchCount validation failed: ${JSON.stringify(invalidBatchCount)}`);
    }

    const corsAuthorized = await requestRaw(runtime.baseUrl, "/llm/config", {
      method: "GET",
      headers: {
        Origin: "http://localhost:5173",
        Authorization: `Bearer ${token}`,
      },
    });
    if (
      corsAuthorized.status !== 200 ||
      corsAuthorized.data.code !== 0 ||
      corsAuthorized.headers["access-control-allow-origin"] !== "http://localhost:5173"
    ) {
      throw new Error(`authorized CORS request failed: ${JSON.stringify(corsAuthorized)}`);
    }

    const generated = await requestJson(runtime.baseUrl, "/questions/generate", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        material: [
          "Reading comprehension should track explicit evidence before making conclusions.",
          "When extending a claim, the student must keep the original topic and boundary conditions in view.",
          "High-quality distractors often borrow part of the source idea but twist the scope, condition, or logical direction.",
          "A difficult question should separate source-supported inference from attractive but overextended interpretation.",
          "Review mode after the full paper should emphasize the reason each tempting option fails.",
        ].join(" "),
        type: "multi",
        difficulty: "hard",
        mode: "modeB",
        feedbackMode: "after_all",
        targetCount: 5,
        initialBatchCount: 5,
        userTags: ["english", "reading", "extension"],
        requestNonce: 123456,
      }),
    });
    if (
      generated.status !== 200 ||
      generated.data.code !== 0 ||
      generated.data.data.generationJob.status !== "completed" ||
      !generated.data.data.session.generationJobId
    ) {
      throw new Error("question generation failed");
    }

    const generatedQuestions = generated.data.data.session.questions;
    ensureGeneratedQuestionShape(generatedQuestions);
    ensureNoLowSignalText(generatedQuestions);
    if (generated.data.data.keypoints.length !== 5) {
      throw new Error("expected five keypoints");
    }
    if (generated.data.data.generationJob.loadedCount !== 5) {
      throw new Error("generation job should report all questions as loaded");
    }
    if (generated.data.data.generationJob.batchState.batch1.requestedCount !== 5) {
      throw new Error("batch1 should represent the full initial question set");
    }
    if (generated.data.data.generationJob.batchState.batch2.requestedCount !== 0) {
      throw new Error("batch2 should stay empty for one-shot generation");
    }
    if (generated.data.data.session.mode !== "modeB") {
      throw new Error("session mode should be modeB");
    }
    if (generated.data.data.session.feedbackMode !== "after_all") {
      throw new Error("session feedbackMode should be after_all");
    }

    await new Promise((resolve) => runtime.app.server.close(resolve));
    runtime = await startApp(filePath);

    const loggedIn = await requestJson(runtime.baseUrl, "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account, password }),
    });
    if (
      loggedIn.status !== 200 ||
      loggedIn.data.code !== 0 ||
      loggedIn.data.data.user.userId !== userId
    ) {
      throw new Error("account login failed");
    }

    const loginHeaders = {
      Authorization: `Bearer ${loggedIn.data.data.token}`,
      "Content-Type": "application/json",
    };

    const me = await requestJson(runtime.baseUrl, "/users/me", {
      method: "GET",
      headers: loginHeaders,
    });
    if (
      me.status !== 200 ||
      me.data.data.userId !== userId ||
      me.data.data.account !== account
    ) {
      throw new Error("users/me restore failed");
    }

    const persistedLlmConfig = await requestJson(runtime.baseUrl, "/llm/config", {
      method: "GET",
      headers: loginHeaders,
    });
    if (
      persistedLlmConfig.status !== 200 ||
      persistedLlmConfig.data.data.provider !== "openai"
    ) {
      throw new Error("persisted llm config was not restored");
    }

    const persistedQuestionBank = await requestJson(
      runtime.baseUrl,
      "/question-bank/full",
      {
        method: "GET",
        headers: loginHeaders,
      }
    );
    if (
      persistedQuestionBank.status !== 200 ||
      persistedQuestionBank.data.data.questions.length !== 5
    ) {
      throw new Error("persisted question bank was not restored");
    }
    ensureGeneratedQuestionShape(persistedQuestionBank.data.data.questions);

    const persistedSession = await requestJson(
      runtime.baseUrl,
      "/practice-session/current",
      {
        method: "GET",
        headers: loginHeaders,
      }
    );
    if (
      persistedSession.status !== 200 ||
      !persistedSession.data.data.session ||
      persistedSession.data.data.session.questions.length !== 5 ||
      !persistedSession.data.data.session.generationJobId
    ) {
      throw new Error("persisted practice session was not restored");
    }
    if (persistedSession.data.data.session.mode !== "modeB") {
      throw new Error("persisted session mode should be modeB");
    }
    if (persistedSession.data.data.session.feedbackMode !== "after_all") {
      throw new Error("persisted session feedbackMode should be after_all");
    }

    const refreshed = await requestJson(runtime.baseUrl, "/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (
      refreshed.status !== 200 ||
      refreshed.data.code !== 0 ||
      refreshed.data.data.user.userId !== userId
    ) {
      throw new Error("refresh flow failed");
    }

    process.stdout.write("Smoke test passed.\n");
  } finally {
    await new Promise((resolve) => runtime.app.server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});

