# AGENTS.md

## 项目范围

`@osqi/mcp-tuya-close-door` 是 Node.js 20+、严格 TypeScript、ESM 的 stdio MCP 包。

- 唯一公开 MCP 工具：`tuya_close_door`。
- 仅通过局域网连接 Tuya 设备；不接入 Tuya Cloud、Home Assistant 或 Frigate。
- 架构：`src/config.ts` 验证配置，`src/tuya-door-service.ts` 管理本地设备会话，`src/mcp.ts` 注册工具，`src/cli.ts` 启动 stdio transport。
- 不要增加开门、停止、通用 DPS 写入或未经物理验证的控制功能。

## 物理门控安全规则

1. 关门功能默认拒绝；只有完整、有效的 `TUYA_CLOSE_DPS` 和 `TUYA_CLOSE_VALUE` 才能启用。
2. MCP 调用必须精确提供 `{ "confirmation": true }`。
3. 每次写入前必须读取 DPS schema；目标 DPS 不存在时拒绝执行。
4. 当前项目只接受本地协议版本 `3.4`。
5. 不得根据产品名称、门名称或网络示例猜测 DPS/value。先用只读检查、官方 App 操作和独立物理验证建立映射。
6. “命令被接受”不等于门已关闭；使用独立摄像头、视觉或传感器流程复核。

## 配置与秘密

必填连接变量：

```text
TUYA_DEVICE_ID
TUYA_LOCAL_KEY
TUYA_HOST
TUYA_VERSION=3.4
TUYA_PORT
```

- `TUYA_HOST` 只能是主机名/IP，不能带协议、端口、路径或认证信息。
- `TUYA_LOCAL_KEY` 是敏感的 16 位密钥；在 `.env` 中必须加引号，避免 `#` 被 dotenv 解释为注释。
- `.env`、`.npmrc`、密钥、证书、设备 ID、Local Key 和 LAN 地址不能提交、记录、打印或放入 MCP 错误消息。
- MCP stdout 只能输出协议消息；诊断输出不得写入 stdout。

## 本地设备诊断

- `node scripts/inspect-tuya.mjs`：仅探测连接/协议并读取 DPS，不得改为调用 `set()`。
- `node scripts/listen-tuya.mjs`：仅监听 App 触发的 DPS 变化。其输出可能暴露设备运行状态，不能公开。
- 部分设备限制并发 TCP 连接；不要长期同时运行多个本地客户端。

## 代码与测试约定

- 使用 NodeNext ESM；内部相对导入必须使用 `.js` 扩展名。
- 保持 `strict` TypeScript；用 `unknown`、类型守卫和显式接口替代 `any`。
- 保持 `TuyaDeviceFactory` 依赖注入；单元测试必须 mock TuyAPI，绝不能接触真实设备。
- 每个本地会话都必须处理 `error` 事件、脱敏错误，并在全部成功/失败路径断开连接。
- 修改安全门控时覆盖：确认拒绝、缺失配置拒绝、DPS schema 拒绝、异步错误拒绝、错误脱敏和断开连接。

运行验证：

```sh
npm ci
npm run build
npm test
npm pack --dry-run
```

`npm test` 会构建生产代码、在 `.tmp/test-dist` 编译测试，并用 Node 内建测试运行器执行。测试失败时停止；先报告原因和修复方案，再修复。

## npm 发布

- 发布物由 `package.json#files` 限定为 `dist/`、`README.md`、`LICENSE` 和 `.env.example`。
- 发布前检查 `npm pack --dry-run`，确认 tarball 不含 `.env`、日志、测试产物或秘密。
- 公开 scoped 包使用：`npm publish --access public`。
- 不要手动编辑 `dist/`；先构建再打包。

## 文档

README 必须与实际公共工具、配置契约和安全约束一致。修改环境变量、MCP 工具或发布流程时，同步更新 `README.md` 与 `.env.example`。
