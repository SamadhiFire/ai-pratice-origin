const fs = require("fs");
const os = require("os");
const path = require("path");
const { once } = require("events");
const { createApp } = require("../src/app");
const { MemoryStore } = require("../src/store");
const { PROVIDER_DEFAULTS } = require("../src/constants");
const { computeTextSimilarity } = require("../src/question-generation-rules");

const PROVIDER_ENV_KEYS = {
  deepseek: "DEEPSEEK_API_KEY",
  qwen: "DASHSCOPE_API_KEY",
};

const TEST_CASES = [
  {
    name: "modeA-single-instant-3",
    material:
      "文章阅读不能只看结论，还要回到原文证据。判断题目时，应先定位关键信息，再辨析选项是否准确复述、是否偷换概念、是否扩大了原文适用范围。高质量命题要让正确项能被原文直接支持，而干扰项往往利用局部相似制造误导。即时反馈模式下，解析应直接指出证据位置与最典型误区。",
    type: "single",
    difficulty: "medium",
    mode: "modeA",
    feedbackMode: "instant",
    targetCount: 3,
    userTags: ["阅读", "证据"],
  },
  {
    name: "modeB-multi-afterall-5",
    material:
      "用户给出的学习点包括：一是做阅读题时要先抓住中心论点，再看论据如何支撑结论；二是面对相似表述，要特别区分概念边界、适用条件和论证方向；三是做知识拓展时可以结合通用分析框架，但不能脱离原始材料的主题中心；四是困难题应能区分表面正确和严格成立之间的差别；五是整卷复盘时，解析应总结为什么错误项看起来像对的。",
    type: "multi",
    difficulty: "hard",
    mode: "modeB",
    feedbackMode: "after_all",
    targetCount: 5,
    userTags: ["阅读", "拓展"],
  },
];

async function requestJson(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, options);
  const data = await response.json();
  return { status: response.status, data };
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

function answerCount(answer) {
  return String(answer || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean).length;
}

function maxStemSimilarity(questions) {
  let max = 0;
  for (let i = 0; i < questions.length; i += 1) {
    for (let j = i + 1; j < questions.length; j += 1) {
      max = Math.max(max, computeTextSimilarity(questions[i].stem, questions[j].stem));
    }
  }
  return Number(max.toFixed(3));
}

function averageExplanationLength(questions) {
  if (!questions.length) {
    return 0;
  }
  const total = questions.reduce(
    (sum, question) => sum + String(question.explanation || "").length,
    0
  );
  return Math.round(total / questions.length);
}

function bannedOptionHits(questions) {
  const banned = ["以上都对", "以上都不对", "无法判断", "all of the above", "none of the above"];
  const hits = [];
  for (const question of questions) {
    for (const option of question.options || []) {
      const text = String(option.text || "").toLowerCase();
      for (const item of banned) {
        if (text.includes(item.toLowerCase())) {
          hits.push({
            questionId: question.id,
            option: option.key,
            text: option.text,
          });
        }
      }
    }
  }
  return hits;
}

function validateCase(response, testCase) {
  if (response.status !== 200 || response.data.code !== 0) {
    throw new Error(`${testCase.name}: request failed ${JSON.stringify(response.data)}`);
  }

  const payload = response.data.data;
  const session = payload.session;
  const job = payload.generationJob;
  const keypoints = payload.keypoints;
  const questions = session.questions;

  if (job.execution.mode !== "llm") {
    throw new Error(`${testCase.name}: expected execution mode llm, got ${job.execution.mode}; reason=${job.execution.reason}`);
  }
  if (questions.length !== testCase.targetCount) {
    throw new Error(`${testCase.name}: expected ${testCase.targetCount} questions, got ${questions.length}`);
  }
  if (keypoints.length !== testCase.targetCount) {
    throw new Error(`${testCase.name}: expected ${testCase.targetCount} keypoints, got ${keypoints.length}`);
  }

  for (const question of questions) {
    if (question.type !== testCase.type) {
      throw new Error(`${testCase.name}: question type mismatch`);
    }
    if (question.mode !== testCase.mode) {
      throw new Error(`${testCase.name}: question mode mismatch`);
    }
    if (question.difficulty !== testCase.difficulty) {
      throw new Error(`${testCase.name}: question difficulty mismatch`);
    }
    if (!Array.isArray(question.options) || question.options.length !== 4) {
      throw new Error(`${testCase.name}: question options must be exactly four`);
    }
    const answers = answerCount(question.answer);
    if (testCase.type === "single" && answers !== 1) {
      throw new Error(`${testCase.name}: single question must have exactly one answer`);
    }
    if (testCase.type === "multi" && (answers < 2 || answers > 3)) {
      throw new Error(`${testCase.name}: multi question must have two or three answers`);
    }
    if (!String(question.explanation || "").trim()) {
      throw new Error(`${testCase.name}: explanation missing`);
    }
    if (!String(question.evidence_quote || "").trim()) {
      throw new Error(`${testCase.name}: evidence quote missing`);
    }
  }

  const bannedHits = bannedOptionHits(questions);
  if (bannedHits.length > 0) {
    throw new Error(`${testCase.name}: banned options found ${JSON.stringify(bannedHits)}`);
  }

  return {
    questionCount: questions.length,
    keypointCount: keypoints.length,
    maxStemSimilarity: maxStemSimilarity(questions),
    averageExplanationLength: averageExplanationLength(questions),
    firstStem: questions[0]?.stem || "",
    firstAnswer: questions[0]?.answer || "",
  };
}

async function runProvider(provider) {
  const envKey = PROVIDER_ENV_KEYS[provider];
  if (!String(process.env[envKey] || "").trim()) {
    throw new Error(`Set ${envKey} before running this script.`);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `llm-rule-live-${provider}-`));
  const runtime = await startApp(path.join(tempDir, "state.json"));
  const providerConfig = PROVIDER_DEFAULTS[provider];

  try {
    const guest = await requestJson(runtime.baseUrl, "/auth/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: `${provider}-rules-test`, avatarUrl: "" }),
    });
    if (guest.status !== 200 || guest.data.code !== 0) {
      throw new Error(`${provider}: guest login failed ${JSON.stringify(guest.data)}`);
    }

    const headers = {
      Authorization: `Bearer ${guest.data.data.token}`,
      "Content-Type": "application/json",
    };

    const verify = await requestJson(runtime.baseUrl, "/llm/config/verify", {
      method: "POST",
      headers,
      body: JSON.stringify({
        provider,
        baseUrl: providerConfig.baseUrl,
        model: providerConfig.model,
      }),
    });
    if (verify.status !== 200 || verify.data.data.status !== "success") {
      throw new Error(`${provider}: verify failed ${JSON.stringify(verify.data)}`);
    }

    const saveConfig = await requestJson(runtime.baseUrl, "/llm/config", {
      method: "PUT",
      headers,
      body: JSON.stringify({
        provider,
        baseUrl: providerConfig.baseUrl,
        model: providerConfig.model,
      }),
    });
    if (saveConfig.status !== 200 || saveConfig.data.code !== 0) {
      throw new Error(`${provider}: llm config save failed ${JSON.stringify(saveConfig.data)}`);
    }

    const reports = [];
    for (const testCase of TEST_CASES) {
      const generated = await requestJson(runtime.baseUrl, "/questions/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({
          material: testCase.material,
          type: testCase.type,
          difficulty: testCase.difficulty,
          mode: testCase.mode,
          feedbackMode: testCase.feedbackMode,
          targetCount: testCase.targetCount,
          initialBatchCount: testCase.targetCount,
          userTags: testCase.userTags,
          requestNonce: Date.now() + Math.floor(Math.random() * 1000),
        }),
      });
      reports.push({
        name: testCase.name,
        ...validateCase(generated, testCase),
      });
    }

    return {
      provider,
      verify: verify.data.data,
      reports,
    };
  } finally {
    await new Promise((resolve) => runtime.app.server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  const requested = String(process.argv[2] || "all").trim().toLowerCase();
  const providers = requested === "all" ? ["deepseek", "qwen"] : [requested];
  const results = [];
  for (const provider of providers) {
    if (!Object.prototype.hasOwnProperty.call(PROVIDER_ENV_KEYS, provider)) {
      throw new Error(`Unsupported provider: ${provider}`);
    }
    results.push(await runProvider(provider));
  }
  process.stdout.write(JSON.stringify(results, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});

