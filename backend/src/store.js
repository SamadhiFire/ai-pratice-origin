const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const {
  DEFAULT_MONGODB_COLLECTION,
  DEFAULT_MONGODB_DB_NAME,
  DEFAULT_MONGODB_STATE_KEY,
  DEFAULT_MONGODB_URL,
  DEFAULT_STORAGE_DRIVER,
  REFRESH_TOKEN_TTL_SECONDS,
  TOKEN_TTL_SECONDS,
} = require("./constants");
const {
  clone,
  createDefaultLlmConfig,
  createPasswordHash,
  createUserProfile,
  generateId,
  makeToken,
  normalizeAccount,
  normalizeTags,
  now,
  verifyPassword,
} = require("./utils");

function mapFromObject(source = {}) {
  return new Map(Object.entries(source || {}));
}

function nestedMapFromObject(source = {}) {
  const result = new Map();
  for (const [key, value] of Object.entries(source || {})) {
    result.set(key, mapFromObject(value || {}));
  }
  return result;
}

function objectFromMap(map) {
  return Object.fromEntries(map.entries());
}

function objectFromNestedMap(map) {
  const result = {};
  for (const [key, value] of map.entries()) {
    result[key] = objectFromMap(value);
  }
  return result;
}

function createEmptyState() {
  return {
    users: {},
    tokens: {},
    refreshTokens: {},
    accountIndex: {},
    credentials: {},
    llmConfigs: {},
    tags: {},
    practiceSessions: {},
    questionBanks: {},
    generationJobs: {},
    idempotencyKeys: {},
  };
}

function isTruthyFlag(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase()
  );
}

function redactMongoUrl(url) {
  const value = String(url || "").trim();
  if (!value) {
    return "<empty mongo url>";
  }
  return value.replace(/:\/\/([^:@\/]+):([^@\/]+)@/, "://***:***@");
}

class BaseStore {
  constructor() {
    this.loadFromObject(createEmptyState());
  }

  loadFromObject(state = {}) {
    this.users = mapFromObject(state.users);
    this.tokens = mapFromObject(state.tokens);
    this.refreshTokens = mapFromObject(state.refreshTokens);
    this.accountIndex = mapFromObject(state.accountIndex);
    this.credentials = mapFromObject(state.credentials);
    this.llmConfigs = mapFromObject(state.llmConfigs);
    this.tags = mapFromObject(state.tags);
    this.practiceSessions = mapFromObject(state.practiceSessions);
    this.questionBanks = nestedMapFromObject(state.questionBanks);
    this.generationJobs = nestedMapFromObject(state.generationJobs);
    this.idempotencyKeys = nestedMapFromObject(state.idempotencyKeys);
  }

  exportState() {
    return {
      users: objectFromMap(this.users),
      tokens: objectFromMap(this.tokens),
      refreshTokens: objectFromMap(this.refreshTokens),
      accountIndex: objectFromMap(this.accountIndex),
      credentials: objectFromMap(this.credentials),
      llmConfigs: objectFromMap(this.llmConfigs),
      tags: objectFromMap(this.tags),
      practiceSessions: objectFromMap(this.practiceSessions),
      questionBanks: objectFromNestedMap(this.questionBanks),
      generationJobs: objectFromNestedMap(this.generationJobs),
      idempotencyKeys: objectFromNestedMap(this.idempotencyKeys),
    };
  }

  ensureUserMaps(userId) {
    if (!this.questionBanks.has(userId)) {
      this.questionBanks.set(userId, new Map());
    }
    if (!this.generationJobs.has(userId)) {
      this.generationJobs.set(userId, new Map());
    }
    if (!this.idempotencyKeys.has(userId)) {
      this.idempotencyKeys.set(userId, new Map());
    }
    if (!this.llmConfigs.has(userId)) {
      this.llmConfigs.set(userId, createDefaultLlmConfig());
    }
    if (!this.tags.has(userId)) {
      this.tags.set(userId, []);
    }
  }

  issueAuth(userId) {
    const timestamp = now();
    const token = makeToken("token");
    const refreshToken = makeToken("refresh");
    const expiresAt = timestamp + TOKEN_TTL_SECONDS * 1000;
    const refreshExpiresAt = timestamp + REFRESH_TOKEN_TTL_SECONDS * 1000;
    this.tokens.set(token, { userId, expiresAt });
    this.refreshTokens.set(refreshToken, { userId, expiresAt: refreshExpiresAt });
    return {
      token,
      refreshToken,
      expiresIn: TOKEN_TTL_SECONDS,
    };
  }

  async buildAuthPayload(userId, isNew) {
    const user = this.users.get(userId);
    if (!user) {
      return null;
    }

    const auth = this.issueAuth(userId);
    await this.persist();
    return {
      ...auth,
      isNew,
      user: clone(user),
    };
  }

  async createGuestLogin(payload) {
    const user = createUserProfile(payload || {});
    this.users.set(user.userId, user);
    this.ensureUserMaps(user.userId);
    return this.buildAuthPayload(user.userId, true);
  }

  async registerAccount(payload) {
    const normalizedAccount = normalizeAccount(payload.account);
    if (!normalizedAccount) {
      return { ok: false, reason: "invalid_account" };
    }
    if (this.accountIndex.has(normalizedAccount)) {
      return { ok: false, reason: "account_exists" };
    }

    const user = createUserProfile({
      account: normalizedAccount,
      nickname: payload.nickname || normalizedAccount,
      avatarUrl: payload.avatarUrl,
    });
    const passwordData = createPasswordHash(payload.password);

    this.users.set(user.userId, user);
    this.accountIndex.set(normalizedAccount, user.userId);
    this.credentials.set(user.userId, {
      account: normalizedAccount,
      passwordHash: passwordData.hash,
      passwordSalt: passwordData.salt,
      createdAt: now(),
      updatedAt: now(),
    });
    this.ensureUserMaps(user.userId);

    return {
      ok: true,
      data: await this.buildAuthPayload(user.userId, true),
    };
  }

  async loginAccount(payload) {
    const normalizedAccount = normalizeAccount(payload.account);
    const userId = this.accountIndex.get(normalizedAccount);
    if (!userId) {
      return null;
    }

    const credential = this.credentials.get(userId);
    if (
      !credential ||
      !verifyPassword(payload.password, credential.passwordSalt, credential.passwordHash)
    ) {
      return null;
    }

    const user = this.users.get(userId);
    if (!user) {
      return null;
    }

    user.lastLoginAt = now();
    user.updatedAt = now();
    return this.buildAuthPayload(userId, false);
  }

  async refreshAuth(refreshToken) {
    const record = this.refreshTokens.get(refreshToken);
    if (!record || record.expiresAt <= now()) {
      return null;
    }

    const user = this.users.get(record.userId);
    if (!user) {
      return null;
    }

    user.lastLoginAt = now();
    user.updatedAt = now();
    return this.buildAuthPayload(user.userId, false);
  }

  getUserByToken(token) {
    const record = this.tokens.get(token);
    if (!record || record.expiresAt <= now()) {
      return null;
    }
    return this.users.get(record.userId) || null;
  }

  getUser(userId) {
    return this.users.get(userId) || null;
  }

  async updateUser(userId, patch) {
    const user = this.users.get(userId);
    if (!user) {
      return null;
    }

    if (typeof patch.nickname === "string") {
      user.nickname = patch.nickname.trim() || user.nickname;
    }
    if (typeof patch.avatarUrl === "string") {
      user.avatarUrl = patch.avatarUrl;
    }

    user.updatedAt = now();
    await this.persist();
    return clone(user);
  }

  getLlmConfig(userId) {
    this.ensureUserMaps(userId);
    return clone(this.llmConfigs.get(userId));
  }

  async setLlmConfig(userId, config) {
    this.ensureUserMaps(userId);
    const value = {
      ...createDefaultLlmConfig(),
      ...clone(config),
      managedKeys: {
        ...createDefaultLlmConfig().managedKeys,
        ...(config.managedKeys || {}),
      },
      updatedAt: now(),
    };
    this.llmConfigs.set(userId, value);
    await this.persist();
    return clone(value);
  }

  getTags(userId) {
    this.ensureUserMaps(userId);
    return clone(this.tags.get(userId) || []);
  }

  async setTags(userId, tags) {
    this.ensureUserMaps(userId);
    const value = normalizeTags(tags);
    this.tags.set(userId, value);
    await this.persist();
    return clone(value);
  }

  getQuestionBankMap(userId) {
    this.ensureUserMaps(userId);
    return this.questionBanks.get(userId);
  }

  getQuestionBank(userId) {
    return Array.from(this.getQuestionBankMap(userId).values()).map(clone);
  }

  async saveQuestions(userId, questions) {
    const bank = this.getQuestionBankMap(userId);
    for (const question of questions) {
      bank.set(question.id, clone(question));
    }
    await this.persist();
    return questions.length;
  }

  async overwriteQuestionBank(userId, questions) {
    this.ensureUserMaps(userId);
    const bank = new Map();
    for (const question of questions) {
      bank.set(question.id, clone(question));
    }
    this.questionBanks.set(userId, bank);
    await this.persist();
    return questions.length;
  }

  getQuestion(userId, questionId) {
    return clone(this.getQuestionBankMap(userId).get(questionId) || null);
  }

  async updateQuestion(userId, questionId, updater) {
    const bank = this.getQuestionBankMap(userId);
    const current = bank.get(questionId);
    if (!current) {
      return null;
    }
    const nextValue = updater(clone(current));
    bank.set(questionId, clone(nextValue));
    await this.persist();
    return clone(nextValue);
  }

  async deleteQuestions(userId, ids) {
    const bank = this.getQuestionBankMap(userId);
    let deletedCount = 0;
    for (const id of ids) {
      if (bank.delete(id)) {
        deletedCount += 1;
      }
    }

    const session = this.practiceSessions.get(userId);
    if (session) {
      session.questions = session.questions.filter(
        (question) => !ids.includes(question.id)
      );
    }

    await this.persist();
    return deletedCount;
  }

  getPracticeSession(userId) {
    this.ensureUserMaps(userId);
    return clone(this.practiceSessions.get(userId) || null);
  }

  async setPracticeSession(userId, session) {
    this.ensureUserMaps(userId);
    this.practiceSessions.set(userId, clone(session));
    await this.persist();
    return clone(session);
  }

  async clearPracticeSession(userId) {
    this.practiceSessions.delete(userId);
    await this.persist();
  }

  getGenerationJobMap(userId) {
    this.ensureUserMaps(userId);
    return this.generationJobs.get(userId);
  }

  async saveGenerationJob(userId, job) {
    const jobs = this.getGenerationJobMap(userId);
    jobs.set(job.jobId, clone(job));
    await this.persist();
    return clone(job);
  }

  getGenerationJob(userId, jobId) {
    return clone(this.getGenerationJobMap(userId).get(jobId) || null);
  }

  getActiveGenerationJob(userId) {
    const jobs = Array.from(this.getGenerationJobMap(userId).values())
      .filter((job) => job.status === "running")
      .sort((left, right) => right.updatedAt - left.updatedAt);
    return clone(jobs[0] || null);
  }

  async setIdempotency(userId, key, value) {
    this.ensureUserMaps(userId);
    this.idempotencyKeys.get(userId).set(key, clone(value));
    await this.persist();
  }

  getIdempotency(userId, key) {
    this.ensureUserMaps(userId);
    return clone(this.idempotencyKeys.get(userId).get(key) || null);
  }

  createSessionShell(mode, feedbackMode) {
    return {
      id: generateId("session"),
      createdAt: now(),
      mode: mode === "modeB" ? "modeB" : "modeA",
      feedbackMode: feedbackMode === "after_all" ? "after_all" : "instant",
      generationJobId: null,
      questions: [],
    };
  }

  createJobShell(payload, sessionId) {
    const timestamp = now();
    return {
      jobId: generateId("job"),
      sessionId,
      material: String(payload.material || ""),
      type: payload.type === "multi" ? "multi" : "single",
      difficulty: ["easy", "medium", "hard"].includes(payload.difficulty)
        ? payload.difficulty
        : "medium",
      mode: payload.mode === "modeB" ? "modeB" : "modeA",
      feedbackMode:
        payload.feedbackMode === "after_all" ? "after_all" : "instant",
      userTags: normalizeTags(payload.userTags || []),
      targetCount: Number(payload.targetCount || 0),
      initialBatchCount: Number(payload.initialBatchCount || payload.targetCount || 0),
      loadedCount: 0,
      keypoints: [],
      usedStemSignatures: [],
      status: "running",
      nonce: Number(payload.requestNonce || 0),
      batchState: {
        batch1: {
          index: 1,
          requestedCount: 0,
          loadedCount: 0,
          status: "pending",
          attempts: 0,
          error: "",
        },
        batch2: {
          index: 2,
          requestedCount: 0,
          loadedCount: 0,
          status: "pending",
          attempts: 0,
          error: "",
        },
        batch3: {
          index: 3,
          requestedCount: 0,
          loadedCount: 0,
          status: "pending",
          attempts: 0,
          error: "",
        },
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  async persist() {}

  async close() {}
}

class MemoryStore extends BaseStore {
  constructor(options = {}) {
    super();
    this.driver = "file";
    this.filePath =
      options.filePath || path.join(__dirname, "..", "data", "state.json");
    this.load();
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      return;
    }

    const raw = fs.readFileSync(this.filePath, "utf8");
    if (!raw.trim()) {
      return;
    }

    this.loadFromObject(JSON.parse(raw));
  }

  async persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempFilePath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempFilePath, JSON.stringify(this.exportState(), null, 2), "utf8");
    fs.renameSync(tempFilePath, this.filePath);
  }
}

class MongoStore extends BaseStore {
  constructor(options = {}) {
    super();
    this.driver = "mongodb";
    this.mongoUrl = options.mongoUrl || DEFAULT_MONGODB_URL;
    this.dbName = options.dbName || DEFAULT_MONGODB_DB_NAME;
    this.collectionName =
      options.collectionName || DEFAULT_MONGODB_COLLECTION;
    this.stateKey = options.stateKey || DEFAULT_MONGODB_STATE_KEY;
    this.client = null;
    this.collection = null;
  }

  static async create(options = {}) {
    const store = new MongoStore(options);
    await store.initialize();
    return store;
  }

  async initialize() {
    this.client = new MongoClient(this.mongoUrl, {
      serverSelectionTimeoutMS: 8000,
    });
    await this.client.connect();
    const db = this.client.db(this.dbName);
    this.collection = db.collection(this.collectionName);
    const existing = await this.collection.findOne({ _id: this.stateKey });
    if (existing) {
      this.loadFromObject(existing);
      return;
    }
    await this.persist();
  }

  async persist() {
    if (!this.collection) {
      throw new Error("mongo store is not initialized");
    }

    await this.collection.updateOne(
      { _id: this.stateKey },
      {
        $set: {
          ...this.exportState(),
          updatedAt: now(),
        },
      },
      { upsert: true }
    );
  }

  async close() {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.collection = null;
    }
  }
}

async function createDefaultStore(options = {}) {
  const driver = String(options.driver || DEFAULT_STORAGE_DRIVER || "mongodb")
    .trim()
    .toLowerCase();

  if (["file", "json", "memory"].includes(driver)) {
    return new MemoryStore({ filePath: options.filePath });
  }

  const strictMongoStartup =
    typeof options.strictMongoStartup === "boolean"
      ? options.strictMongoStartup
      : isTruthyFlag(process.env.MONGODB_STRICT_STARTUP);
  const mongoOptions = {
    mongoUrl: options.mongoUrl || DEFAULT_MONGODB_URL,
    dbName: options.dbName || DEFAULT_MONGODB_DB_NAME,
    collectionName: options.collectionName || DEFAULT_MONGODB_COLLECTION,
    stateKey: options.stateKey || DEFAULT_MONGODB_STATE_KEY,
  };

  try {
    return await MongoStore.create(mongoOptions);
  } catch (error) {
    if (strictMongoStartup) {
      throw error;
    }

    const fallbackStore = new MemoryStore({ filePath: options.filePath });
    fallbackStore.startupWarning =
      `[store] MongoDB unavailable at ${redactMongoUrl(mongoOptions.mongoUrl)}; ` +
      `falling back to file store at ${fallbackStore.filePath}. ` +
      `Set STORAGE_DRIVER=file to silence this locally, or set MONGODB_STRICT_STARTUP=true to fail fast. ` +
      `Root error: ${error.message}`;
    process.stderr.write(`${fallbackStore.startupWarning}\n`);
    return fallbackStore;
  }
}

module.exports = {
  MemoryStore,
  MongoStore,
  createDefaultStore,
};


