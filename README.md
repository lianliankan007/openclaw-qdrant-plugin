# openclaw-qdrant-plugin

一个面向 OpenClaw 的 Qdrant 工具型插件仓库。

它不新增消息渠道，而是通过 `api.registerTool(...)` 暴露一组向量数据库工具，让 OpenClaw 可以直接对 Qdrant 执行常见操作。

## 当前仓库结构

```text
openclaw-qdrant-plugin/
├── README.md
└── .openclaw/
    └── extensions/
        └── qdrant/
            ├── index.ts
            ├── openclaw.plugin.json
            ├── package.json
            ├── config.example.json5
            ├── EXAMPLES.md
            └── src/
                ├── qdrant-client.ts
                └── schemas.ts
```

## 已实现工具

- `qdrant_health`
  - 连通性检查 / 基础健康检查
- `qdrant_collection`
  - `create`
  - `get`
  - `list`
  - `delete`
- `qdrant_points`
  - `upsert`
  - `delete`
- `qdrant_query`
  - `search`
  - `scroll`

## 为什么做成这种形态

根据当前 OpenClaw 插件机制，这类能力更适合做成 **工具型扩展**，而不是消息渠道插件：

- 使用 `package.json -> openclaw.extensions` 声明入口
- 使用 `openclaw.plugin.json` 提供静态配置 schema
- 在 `index.ts` 中通过 `api.registerTool(...)` 注册工具

这条路径和 OpenClaw 内置的工具型扩展风格一致，也更适合后续独立发布到 GitHub / npm。

## 安装方式

### 方式 1：从 GitHub clone 后本地安装（当前最稳）

```bash
git clone <你的仓库地址>
cd openclaw-qdrant-plugin
openclaw plugins install -l ./.openclaw/extensions/qdrant
```

说明：
- `-l` 是 link 安装，适合开发和本地调试
- 如果你想复制一份到 `~/.openclaw/extensions/qdrant`，可以去掉 `-l`

### 方式 2：手动复制到 workspace

也可以直接把插件目录复制到：

```text
<workspace>/.openclaw/extensions/qdrant
```

然后重启 OpenClaw Gateway。

### 方式 3：后续发布到 npm（推荐给其他人）

OpenClaw 文档明确支持：

```bash
openclaw plugins install <npm-package-name>
```

所以如果你后面把这个仓库发到 npm，安装体验会比 GitHub clone 更丝滑。

## 配置行为

- **未配置 `baseUrl`**：插件会被发现，但不会注册任何 Qdrant 工具；只输出 warning，不阻断 OpenClaw 启动。
- **配置了 `baseUrl`**：插件正常注册 `qdrant_health` / `qdrant_collection` / `qdrant_points` / `qdrant_query`。

典型 warning 如下：

```text
qdrant: plugin installed but inactive. Set plugins.entries.openclaw-qdrant-plugin.config.baseUrl (for example http://127.0.0.1:6333) to enable Qdrant tools.
```

## 安装后如何在 OpenClaw 中配置

建议至少补这几个字段：

```json5
{
  plugins: {
    enabled: true,
    allow: ["openclaw-qdrant-plugin"],
    entries: {
      "openclaw-qdrant-plugin": {
        enabled: true,
        config: {
          baseUrl: "http://127.0.0.1:6333",
          apiKey: "",
          timeoutMs: 15000,
          defaultVectorSize: 1536,
          defaultDistance: "Cosine"
        }
      }
    }
  }
}
```

说明：

- `plugins.allow` 建议显式写成 `["openclaw-qdrant-plugin"]`，避免自动加载不需要的第三方插件。
- `baseUrl` 是真正启用插件的关键配置。
- `apiKey` 只有在你的 Qdrant 实例启用了鉴权时才需要填写。
- 其余字段都可以先用默认值。

## 配置示例

参考：

- `./.openclaw/extensions/qdrant/config.example.json5`

示例：

```json5
{
  plugins: {
    enabled: true,
    entries: {
      "openclaw-qdrant-plugin": {
        enabled: true,
        config: {
          baseUrl: "http://127.0.0.1:6333",
          apiKey: "",
          timeoutMs: 15000,
          defaultVectorSize: 1536,
          defaultDistance: "Cosine"
        }
      }
    }
  }
}
```

## 调用示例

见：

- `./.openclaw/extensions/qdrant/EXAMPLES.md`

## 实现说明

### `qdrant-client.ts`

基于 Node 22 原生 `fetch` 实现一个轻量 REST client：

- 支持超时控制
- 支持 API Key
- 统一封装 Qdrant 错误
- 自动解包 Qdrant 常见 `{ result: ... }` 响应

这样做的好处是：

- 少依赖
- 仓库更轻
- 更方便别人直接从 GitHub 使用

### `schemas.ts`

集中维护所有工具的参数 JSON Schema，便于：

- OpenClaw 做参数校验
- 后续继续扩展更多 endpoint
- 保持 `index.ts` 更清晰

### `index.ts`

负责：

- 读取插件配置
- 初始化 Qdrant client
- 注册工具
- 注册一个轻量 CLI 诊断入口

## 当前验证情况

已完成：

- 对照 OpenClaw 现有扩展结构完成插件目录设计
- 核对 `feishu` 与 `memory-lancedb` 的工具注册模式
- 生成可被 OpenClaw 发现的扩展目录
- 完成工具 schema、客户端、工具注册和文档

未完成：

- 当前环境没有真实 Qdrant 实例，未做联机验证
- 当前环境没有完整 TS 构建链，未做 `tsc` 编译验证
- `preferGrpc` 目前只是预留字段，实际仍然走 REST
- 已对旧版 Qdrant 增加 `/points/search` 回退，降低接口版本差异带来的失败概率

## 建议的下一步

1. 先把这个仓库上传到 GitHub
2. 在一台装有 OpenClaw 的环境里 link 安装测试
3. 用真实 Qdrant 地址跑一遍：
   - health
   - create collection
   - upsert
   - search
   - delete
4. 如果验证通过，再补：
   - LICENSE
   - npm 发布配置
   - CI
   - 更完整的 README 示例
