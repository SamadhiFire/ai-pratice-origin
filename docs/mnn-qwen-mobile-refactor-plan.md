# AI 刷题项目端侧 Qwen + MNN 比赛改造计划

## 1. 项目背景

当前项目是一个 AI 辅助刷题应用，核心能力是：用户输入学习材料或目标方向，系统生成单选/多选题，并支持练习、错题、掌握状态、题集沉淀、标签分类等学习闭环。

当前仓库结构：

```text
.
|- frontend/  # Uni-app + Vue 3 + TypeScript 前端
|- backend/   # Node.js 后端，负责认证、LLM 调用、持久化等
|- docs/
```

当前 AI 生成链路：

```text
用户输入材料
  -> frontend 组织参数和 prompt
  -> frontend 或 backend 调用 Qwen / DeepSeek / OpenAI / Gemini 云端 API
  -> 返回文本
  -> 解析成题目 JSON
  -> 进入练习和题库流程
```

比赛要求的关键点是：

```text
完整手机 App
  -> 使用 Qwen 模型
  -> 使用 MNN 框架
  -> 在手机本地端侧 CPU 推理
  -> 开启或体现 Arm SME2 指令集加速
  -> 不是 H5 / 小程序 / 云端 API 壳
```

因此，本次改造的本质是：保留现有刷题业务闭环，把“大模型调用层”从云端 API 改成本地 Android 端侧推理。

## 2. 计划边界

### 2.1 本次必须完成

1. 交付一个可安装的 Android APK。
2. APK 不是纯 H5 或小程序产物，需要具备原生 Android 能力。
3. App 内集成 MNN 运行时，能够加载本地 Qwen MNN 模型。
4. 出题核心链路走本地模型，不依赖云端 LLM API。
5. 本地模型推理结果仍复用现有题目 JSON 解析、校验、练习和题库逻辑。
6. 提供一个“端侧推理信息/演示页”，展示模型、本地推理、MNN、CPU、线程、耗时、tokens/s、SME2 检测或启用状态。
7. 支持断网演示核心功能：输入一段材料后，本地生成题目并进入练习。

### 2.2 本次不强求完成

1. 不强求 iOS 版本。
2. 不强求保留所有云端模型供应商配置。
3. 不强求后端服务在比赛演示中可用。
4. 不强求模型下载中心、账号体系、云同步等完整商业化能力。
5. 不强求 NPU/GPU 推理，比赛重点是 CPU + SME2。

### 2.3 推荐保留但降级处理

1. 后端目录可以保留，作为历史能力和开发调试工具，但比赛版 APK 不应依赖它。
2. API Key 配置页可以改造成“模型管理/端侧运行状态”页。
3. 云端 provider 代码可以保留为开发 fallback，但默认关闭，并在比赛版构建中不作为主路径。

## 3. 当前项目可复用部分

可以优先复用：

1. `frontend/src/pages/index/index.vue`：出题首页交互。
2. `frontend/src/pages/practice/index.vue`：刷题练习页。
3. `frontend/src/pages/collection/index.vue`：题集、错题、掌握状态。
4. `frontend/src/pages/profile/index.vue`：可改造为端侧模型状态页。
5. `frontend/src/utils/quiz-generation/`：prompt 构造、JSON 解析、题目规范化、fallback。
6. `frontend/src/services/pipeline-segmented-service.ts`：分段出题流程可继续复用，但需要把底层 provider 换成本地推理。
7. `frontend/src/utils/question-bank.ts`、`practice-session.ts`、`user-tags.ts`：本地题库和学习闭环。

需要重点替换：

1. `frontend/src/utils/llm.ts`：当前是云端 API 调用，需要新增本地 MNN 推理 transport。
2. `frontend/src/utils/quiz-generation/provider-adapter.ts`：当前默认调用 `chatCompletion`，需要支持 `localMnnChatCompletion`。
3. `backend/src/llm-provider.js`：比赛版不再作为核心生成路径。
4. `frontend/src/pages/profile/index.vue`：从 API Key 配置改为模型管理和本地推理诊断。

## 4. 目标架构

### 4.1 改造后的主链路

```text
用户输入学习材料
  -> Uni-app 页面收集参数
  -> quiz-generation prompt builder 生成 prompt
  -> localMnnChatCompletion(prompt)
  -> Android Native Bridge
  -> JNI / C++ MNN LLM Runtime
  -> 加载本地 Qwen MNN 模型
  -> 手机 CPU 推理，启用 ARM 优化/SME2 能力
  -> 流式或一次性返回文本
  -> parser-validator 解析 JSON
  -> 题目进入练习页和题库
```

### 4.2 建议目录结构

如果继续使用 Uni-app Android App 方案，建议新增：

```text
frontend/
  src/
    utils/
      local-mnn-llm.ts              # 前端 JS/TS 调原生插件的统一入口
      llm-runtime-status.ts         # 本地模型状态、性能信息、错误码
    nativeplugins/
      MnnQwenPlugin/                # Uni-app Android 原生插件
        android/
          src/main/java/...         # Kotlin/Java bridge
          src/main/cpp/...          # JNI + MNN C++ wrapper
          src/main/jniLibs/arm64-v8a/
            libMNN.so
            libMNN_Express.so
            libMNNOpenCL.so         # 如果不用 OpenCL 可不带
            libmnnllm.so            # 视 MNN 构建产物命名确定
          build.gradle
models/
  qwen-mnn/
    config.json
    llm_config.json
    llm.mnn
    llm.mnn.weight
    tokenizer.mtok
    embeddings_bf16.bin             # 如导出产物需要
```

如果改为纯 Android 原生 App，建议新增：

```text
android-app/
  app/
    src/main/java/...               # Kotlin UI 或 WebView + Native bridge
    src/main/cpp/...                # JNI + MNN wrapper
    src/main/assets/models/qwen-mnn/
    src/main/jniLibs/arm64-v8a/
```

两条路线二选一：

1. **路线 A：继续 Uni-app + Android 原生插件**  
   优点：最大化复用现有 Vue 页面和业务代码。  
   缺点：Uni-app 原生插件调试成本较高，App 打包环境要处理好。

2. **路线 B：新建 Android 原生壳，迁移核心页面**  
   优点：原生 MNN 集成更直接，比赛技术展示更清晰。  
   缺点：UI 迁移工作量更大。

推荐路线：**路线 A**。当前项目页面和业务逻辑已经在 Uni-app 里，优先用 Android 原生插件承接 MNN。

## 5. MNN 与 Qwen 模型方案

### 5.1 模型选择

建议优先选择小尺寸 Qwen Instruct 模型：

1. 第一优先：Qwen2.5-0.5B-Instruct 或 Qwen3-0.6B。
2. 第二优先：Qwen2.5-1.5B-Instruct 或 Qwen3-1.7B。
3. 不建议一开始使用 4B、7B 以上模型，手机 CPU 推理速度和内存压力会明显增加。

比赛演示更看重“端侧真实跑通 + 可用”，不是盲目追求最大模型。

### 5.2 MNN 模型导出产物

根据 MNN LLM 官方文档，Qwen 模型导出后通常需要这些运行时文件：

```text
config.json
llm_config.json
llm.mnn
llm.mnn.weight
tokenizer.mtok
embeddings_bf16.bin  # 视导出参数和模型而定
```

MNN 文档示例产物和配置项参考：

- MNN 仓库：https://github.com/alibaba/MNN
- MNN LLM 文档：https://mnn-docs.readthedocs.io/en/latest/transformers/llm.html

### 5.3 推荐导出流程

在 PC 上准备 MNN 和模型：

```bash
git clone https://github.com/alibaba/MNN.git
cd MNN
mkdir build
cd build
cmake .. -DMNN_BUILD_CONVERTER=ON -DMNN_BUILD_LLM=ON
make -j8
```

导出模型示例：

```bash
cd transformers/llm/export
python llmexport.py \
  --path /path/to/Qwen2.5-0.5B-Instruct \
  --export mnn \
  --quant_bit 4 \
  --quant_block 128 \
  --hqq
```

实际命令要根据本地 MNN 版本和模型名称微调。

### 5.4 config.json 建议

建议先用 CPU 后端，保证比赛技术点清晰：

```json
{
  "backend_type": "cpu",
  "thread_num": 4,
  "precision": "low",
  "memory": "low",
  "sampler_type": "mixed",
  "temperature": 0.2,
  "topP": 0.8,
  "max_new_tokens": 1024,
  "reuse_kv": true
}
```

后续根据设备性能调整：

1. `thread_num`：通常 4 或 6 起步，实测后调。
2. `max_new_tokens`：出题 JSON 不要过长，建议 512 到 1536。
3. `temperature`：题目 JSON 生成建议较低，0.1 到 0.4。
4. `reuse_kv`：多轮或连续生成时开启。

## 6. APK 模型打包策略

### 6.1 方案一：模型直接打包进 APK/AAB

路径示例：

```text
android assets/models/qwen-mnn/
```

优点：

1. 安装后即可离线使用。
2. 比赛演示最稳定。
3. 最能证明端侧完整性。

缺点：

1. APK 体积大。
2. 大模型可能导致安装包超过平台限制。
3. 首次安装和拷贝模型耗时较长。

### 6.2 方案二：APK 内置 MNN，模型首次启动下载

路径示例：

```text
/data/data/<package-name>/files/models/qwen-mnn/
```

优点：

1. APK 小。
2. 便于替换模型版本。

缺点：

1. 首次启动依赖网络。
2. 需要下载进度、校验、失败重试。
3. 比赛演示前必须提前下载好模型。

### 6.3 推荐

比赛演示版推荐：

```text
小模型直接打包进 APK，或提供一键预置脚本把模型推送到 App 私有目录。
```

如果包体无法接受，则采用：

```text
APK 内置 MNN runtime + 首次启动模型下载 + 演示前预下载完成 + 断网可继续使用。
```

无论哪种，都必须在 UI 上显示：

1. 模型是否已存在。
2. 模型路径或模型版本。
3. 是否正在使用本地模型。
4. 最近一次推理耗时和 tokens/s。

## 7. Android 原生 MNN 插件设计

### 7.1 插件对外接口

前端需要一个统一 TS 接口：

```ts
export interface LocalMnnGenerateOptions {
  maxNewTokens?: number
  temperature?: number
  topP?: number
  stream?: boolean
}

export interface LocalMnnRuntimeStatus {
  available: boolean
  modelLoaded: boolean
  modelName: string
  modelPath: string
  backendType: 'cpu' | 'opencl' | 'unknown'
  threadNum: number
  sme2Supported: boolean
  sme2Enabled: boolean
  lastPromptTokens?: number
  lastOutputTokens?: number
  lastLatencyMs?: number
  lastTokensPerSecond?: number
  error?: string
}

export async function loadLocalMnnModel(modelDir?: string): Promise<LocalMnnRuntimeStatus>

export async function localMnnChatCompletion(
  messages: ChatMessage[],
  options?: LocalMnnGenerateOptions,
): Promise<string>

export async function getLocalMnnRuntimeStatus(): Promise<LocalMnnRuntimeStatus>
```

### 7.2 Android Java/Kotlin 层

职责：

1. 暴露 Uni-app 原生插件方法。
2. 管理模型文件路径。
3. 初始化 JNI。
4. 把 prompt 传给 C++ 层。
5. 接收推理结果。
6. 返回运行状态。
7. 捕获并转换错误。

建议方法：

```text
loadModel(modelDir)
generate(prompt, generationConfig)
getRuntimeStatus()
releaseModel()
```

### 7.3 C++ / JNI 层

职责：

1. 调用 MNN LLM runtime。
2. 加载 `config.json`。
3. 执行 `load()`。
4. 执行 `response(prompt)` 或流式 generate。
5. 统计耗时和 tokens/s。
6. 检测 CPU feature，记录 SME2 支持状态。

伪代码：

```cpp
class MnnQwenRunner {
public:
  bool load(const std::string& configPath);
  std::string generate(const std::string& prompt, const GenerateOptions& options);
  RuntimeStatus status() const;
  void release();
};
```

### 7.4 SME2 检测与展示

比赛要求“开启 Arm SME2 指令集加速”。这部分需要严谨处理：

1. 编译 MNN 时确认当前版本是否包含 SME2 相关优化。
2. 使用目标设备确认 CPU 是否支持 SME2。
3. Android 侧读取 `/proc/cpuinfo` 或通过 NDK CPU feature 能力检测，作为 UI 展示参考。
4. MNN 日志中打开 logcat，记录实际 backend 和 CPU 优化信息。
5. 在演示页显示：

```text
CPU backend: MNN CPU
SME2 supported: true/false
SME2 enabled: true/false/unknown
MNN build: with LLM / with ARM optimized kernels
```

注意：如果测试手机本身不支持 SME2，只能显示“不支持，已使用 MNN CPU ARM 优化路径”。比赛若强制 SME2，需要准备支持 SME2 的设备。

## 8. 前端业务改造

### 8.1 新增本地推理 transport

新增：

```text
frontend/src/utils/local-mnn-llm.ts
```

职责：

1. 把当前 `ChatMessage[]` 转成 Qwen chat prompt。
2. 调用原生插件。
3. 返回模型原始文本。
4. 提供错误信息，例如模型未加载、模型文件缺失、推理超时。

### 8.2 修改 provider adapter

当前：

```ts
createQuizGenerationProviderAdapter(chatCompletion)
```

改造目标：

```ts
const transport = isLocalMnnEnabled()
  ? localMnnChatCompletion
  : chatCompletionForDevOnly

createQuizGenerationProviderAdapter(transport)
```

比赛版建议强制：

```ts
localMnnChatCompletion
```

避免演示时误走云端 API。

### 8.3 Prompt 控制

端侧小模型对长 prompt 和复杂 JSON 更敏感，需要调整：

1. 单次输入材料长度做硬限制，例如 800 到 1500 中文字。
2. 每次生成题目数量默认 3 到 5 题，最多 10 题。
3. 输出 JSON schema 保持短字段。
4. 降低 prompt 中的解释性文本，保留严格格式要求。
5. 失败后自动重试一次：加入“只输出 JSON，不要解释”修复 prompt。
6. 保留现有 parser-validator 和 fallbackQuestions。

### 8.4 Profile 页改造

当前 profile 页偏 API Key 配置。比赛版建议改成：

```text
端侧模型
- 模型：Qwen2.5-0.5B-Instruct MNN 4bit
- 状态：已加载 / 未加载
- 运行后端：CPU
- SME2：支持并启用 / 不支持 / 未知
- 线程数：4
- 最近推理：耗时、输出 token、tokens/s
- 断网可用：是
- 重新加载模型
- 运行测试 prompt
```

### 8.5 首页文案调整

避免继续暗示云端 API：

1. “AI 生成”改为“本地 AI 出题”。
2. “模型 API Key”改为“本地模型状态”。
3. 错误提示中避免“请配置 API Key”，改为“请先加载本地模型”。

## 9. 后端处理策略

比赛版不依赖 `backend/`。

建议：

1. 保留后端代码，不删除。
2. README 中说明比赛 APK 的核心 AI 能力为端侧本地推理。
3. 前端构建比赛版时关闭 `VITE_API_BASE_URL` 依赖。
4. 账号、云同步等能力如果没有必要，比赛版可以隐藏入口。

可新增环境开关：

```env
VITE_LLM_RUNTIME=local-mnn
VITE_ENABLE_REMOTE_LLM=false
VITE_ENABLE_BACKEND_SYNC=false
```

## 10. 阶段任务拆分

### 阶段 0：基线确认

目标：确认当前项目能正常跑起来，并记录现有出题链路。

任务：

1. 在 `frontend` 运行类型检查。
2. 在 `frontend` 跑现有 generation fixtures。
3. 梳理 `chatCompletion` 调用路径。
4. 标记所有“API Key / provider / backend sync”的 UI 入口。

交付：

1. 当前链路说明。
2. 待替换文件清单。

### 阶段 1：App 打包路线确认

目标：确定比赛 APK 的技术路线。

任务：

1. 确认 Uni-app 是否已有 Android App 打包配置。
2. 如果没有，补齐 Android App 构建配置。
3. 确认原生插件目录规范。
4. 生成一个不含 MNN 的空 APK，验证可安装和页面可打开。

交付：

1. 可安装 APK。
2. App 首页能正常进入。

### 阶段 2：MNN Android Runtime 集成

目标：App 能加载 MNN native 库。

任务：

1. 编译或引入 MNN Android arm64-v8a so。
2. 开启 `MNN_BUILD_LLM=ON`。
3. 如需日志，开启 `MNN_USE_LOGCAT=ON`。
4. 把 so 放入 Android 插件或 App 的 `jniLibs/arm64-v8a`。
5. 写 JNI smoke test：App 启动后返回 MNN runtime version 或初始化成功状态。

交付：

1. APK 内包含 MNN so。
2. 端侧状态页显示 MNN runtime 可用。

### 阶段 3：Qwen MNN 模型准备

目标：准备可在手机 CPU 上推理的 Qwen MNN 模型。

任务：

1. 下载 Qwen 小模型。
2. 使用 MNN `llmexport.py` 转换为 MNN 格式。
3. 使用 4bit 量化控制体积。
4. 在 PC 上用 MNN demo 测试模型可以回答。
5. 在 Android 测试机上用 demo 或 App 插件加载模型。

交付：

1. 模型目录。
2. 模型转换命令记录。
3. PC 推理日志。
4. Android 推理日志。

### 阶段 4：原生插件推理闭环

目标：前端能通过插件获得本地模型回复。

任务：

1. 实现 `loadModel`。
2. 实现 `generate`。
3. 实现 `getRuntimeStatus`。
4. 实现错误码：
   - 模型文件不存在
   - MNN so 加载失败
   - config.json 解析失败
   - 模型加载失败
   - 推理超时
   - 输出为空
5. 在 profile 页加入“测试本地模型”按钮。

交付：

1. 输入“请回复 OK”，本地模型返回文本。
2. 断网后仍可返回文本。

### 阶段 5：替换出题生成链路

目标：刷题产品主流程改走本地 Qwen + MNN。

任务：

1. 新增 `frontend/src/utils/local-mnn-llm.ts`。
2. 修改 `provider-adapter.ts` 默认 transport。
3. 修改 `llm.ts` 中比赛版配置，避免缺 API Key 报错。
4. 调整 prompt，降低端侧模型压力。
5. 生成题目失败时走 JSON 修复和 fallback。
6. 首页生成按钮前检查模型是否已加载。

交付：

1. 首页输入材料后，本地生成题目。
2. 题目能进入练习页。
3. 题目能保存到题库。

### 阶段 6：SME2 与性能证明

目标：让比赛评委能看到端侧 CPU 推理和 SME2 相关证据。

任务：

1. 在 MNN 构建和运行日志中保留 CPU backend 信息。
2. 检测设备 CPU feature。
3. UI 展示 SME2 支持/启用状态。
4. 记录每次推理：
   - prompt 字符数
   - 输出字符数
   - 首 token 时间，如可获取
   - 总耗时
   - tokens/s，如可获取
   - 线程数
5. 准备一段固定演示材料，便于稳定复现。

交付：

1. 端侧推理信息页。
2. logcat 关键日志。
3. 断网演示流程。

### 阶段 7：比赛版收尾

目标：打出可交付 APK，并准备说明文档。

任务：

1. 清理或隐藏云端 API Key 入口。
2. README 增加比赛版说明。
3. 增加 `docs/demo-script-mnn-qwen.md` 口播稿。
4. 打 release APK。
5. 在目标手机上完整验收。

交付：

1. APK。
2. 模型说明。
3. 技术说明。
4. 演示脚本。

## 11. 验收标准

### 11.1 功能验收

1. APK 可安装、可启动。
2. 断网后 App 可以打开。
3. 断网后模型状态显示“本地模型已加载”。
4. 输入材料后可以生成题目。
5. 生成题目可以正常练习。
6. 题目可以沉淀到题库。
7. 错题和掌握状态可用。

### 11.2 技术验收

1. APK 内或 App 私有目录存在 Qwen MNN 模型文件。
2. App 内集成 MNN native so。
3. 核心生成链路不发起云端 LLM 请求。
4. 端侧状态页显示：
   - Qwen 模型名称
   - MNN runtime 状态
   - CPU backend
   - 线程数
   - SME2 状态
   - 最近推理耗时
5. logcat 能看到 MNN 加载和推理日志。

### 11.3 演示验收

建议演示步骤：

1. 开启飞行模式或断网。
2. 打开 App。
3. 进入模型状态页，展示本地 Qwen + MNN + CPU/SME2 信息。
4. 回到首页，输入固定学习材料。
5. 点击生成。
6. 展示生成题目。
7. 进入练习。
8. 提交答案，展示反馈。
9. 进入题库，展示沉淀结果。

## 12. 主要难点与风险

### 12.1 SME2 设备风险

难点：不是所有 Android 手机都支持 Arm SME2。  
处理：尽早确认比赛测试设备；如自备设备，必须选择支持 SME2 的芯片。UI 需要区分“支持并启用”和“设备不支持”。

### 12.2 MNN LLM 集成风险

难点：MNN LLM 的 Android 集成涉及 C++、JNI、so、模型文件路径、ABI、运行时配置。  
处理：先做最小 demo，不要一开始接完整出题流程。

### 12.3 模型体积风险

难点：模型进入 APK 后包体可能过大。  
处理：优先 0.5B/0.6B 4bit；如果仍过大，改为首次下载或演示机预置。

### 12.4 推理速度风险

难点：手机 CPU 出题可能慢，长材料更慢。  
处理：限制材料长度和题目数量；默认 3 题；提供生成中状态和超时提示。

### 12.5 JSON 稳定性风险

难点：小模型可能输出解释文本、格式错误、字段缺失。  
处理：强化 parser-validator；增加 JSON 修复 prompt；保留 fallbackQuestions；降低 temperature。

### 12.6 Uni-app 原生插件风险

难点：Uni-app 插件打包和 Android native 调试成本可能高。  
处理：如果两天内插件链路无法打通，切换到 Android 原生壳方案，优先保证比赛技术点。

## 13. 建议 CodeBuddy 执行顺序

让 CodeBuddy 按下面顺序做，不要一口气大改：

1. 先跑通当前项目，记录现有生成链路。
2. 新增 `local-mnn-llm.ts` 的 TypeScript 接口和 mock 实现。
3. 把 `provider-adapter.ts` 改成可注入本地 transport，但先用 mock 返回固定 JSON。
4. 验证首页到练习页闭环不坏。
5. 再做 Android 原生插件空壳，只返回 runtime status。
6. 再集成 MNN so。
7. 再加载真实 Qwen MNN 模型。
8. 最后替换 mock 为真实本地推理。

每一步都要能单独验收，避免改到最后才发现基础链路断了。

## 14. 推荐新增文档

建议后续新增：

```text
docs/mnn-model-conversion.md        # 模型转换记录
docs/android-mnn-integration.md     # Android 集成记录
docs/demo-script-mnn-qwen.md        # 比赛演示口播
docs/offline-test-checklist.md      # 断网验收 checklist
```

## 15. 最终交付物清单

1. Android APK。
2. Qwen MNN 模型文件或模型下载/预置说明。
3. MNN 集成源码。
4. 本地推理 bridge 源码。
5. 端侧模型状态页。
6. 断网演示材料。
7. README 比赛版说明。
8. 性能和 SME2 状态截图或日志。

## 16. 关键原则

1. 比赛版主链路必须是本地推理。
2. 页面可以简单，但端侧证据必须扎实。
3. 优先小模型跑通，不要先追求大模型效果。
4. 先打通 MNN demo，再接入业务。
5. 任何云端 API 都只能作为开发辅助，不能作为比赛演示核心。
