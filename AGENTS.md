# opencode-quota-dashboard 项目约定

## 项目定位

OpenCode Desktop 的额度面板插件：标题栏胶囊 + 侧边面板，显示 DeepSeek 余额、OpenCode Go 额度、GLM 与 MiMo 用量。

## 可写目录（产物 / 依赖 / 临时）

- `node_modules/`：npm 依赖缓存，可再生。
- `dist/`：Vite 构建产物，可再生。
- `temp/`：探针脚本输出、截图、临时 JSON；会话结束前清理。
- `build/`：预留，构建中间产物。

`src/`、`test/`、`README.md`、根目录配置文件均为人工维护内容，不用脚本批量改写。

## 构建与运行

- `npm run build`：构建 `dist/gui-experimental.cjs`。
- `npm run dev`：Vite watch，改 GUI 后在 Desktop 窗口自动重载。
- 服务端入口 `src/index.ts` 由 OpenCode 运行时直接加载；改动后需要重载插件或重启 Desktop。

## 安全

- API key 只在服务端内存中使用；RPC 输出、日志、README 均不得出现 key。
- 诊断输出只保留布尔状态、HTTP 状态码和脱敏标签。
