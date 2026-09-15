# @osqi/mcp-tuya-close-door

本地运行的 stdio MCP 服务，仅提供一个经过安全确认的 Tuya 卷闸门关门接口。它直接通过局域网连接设备，不依赖 Tuya Cloud、Home Assistant 或 Frigate。

> Node.js 20+。此工具只代表本地设备接受了指令，不保证门已物理关闭；应由后续摄像头/视觉 skill 复核。

## 安全机制

- 仅公开 `tuya_close_door` 一个 MCP 工具。
- 每次调用必须传入 `{"confirmation": true}`。
- 未同时配置并验证 `TUYA_CLOSE_DPS` 与 `TUYA_CLOSE_VALUE` 时，关门功能默认禁用。
- 下发前会读取本地 DPS 状态；若配置的 DPS 不存在则拒绝执行。
- 不要提交 `.env`，也不要在日志、提示词或 issue 中暴露设备 ID、Local Key 或局域网地址。

## 安装

发布后可全局安装：

```sh
npm install -g @osqi/mcp-tuya-close-door
```

或由 MCP host 通过 npx 启动：

```sh
npx -y @osqi/mcp-tuya-close-door
```

可执行命令为：

```text
mcp-tuya-close-door
```

它只使用标准输入/输出传输 MCP 消息；不要将诊断信息写入 stdout，也不需要开放 HTTP 端口。

## 配置

复制模板并限制文件权限：

```sh
cp .env.example .env
chmod 600 .env
```

```env
TUYA_DEVICE_ID=你的设备ID
TUYA_LOCAL_KEY="你的16位LocalKey"
TUYA_HOST=192.168.1.50
TUYA_VERSION=3.4
TUYA_PORT=6668

# 仅在独立验证实际关门映射后填写：
TUYA_CLOSE_DPS=6
TUYA_CLOSE_VALUE=false
```

`TUYA_LOCAL_KEY` 必须加引号：若密钥包含 `#`，未加引号时 dotenv 会把后半部分当作注释。

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `TUYA_DEVICE_ID` | 是 | 本地 Tuya 设备 ID。 |
| `TUYA_LOCAL_KEY` | 是 | 设备的 16 位 Local Key。 |
| `TUYA_HOST` | 是 | 设备的局域网 IP/主机名；不包含协议或端口。 |
| `TUYA_VERSION` | 是 | 本项目只接受已验证的 `3.4`。 |
| `TUYA_PORT` | 是 | 设备端口，通常为 `6668`，范围为 `1–65535`。 |
| `TUYA_CLOSE_DPS` | 否 | 经独立验证的关门 DPS 编号。须与 value 一起设置。 |
| `TUYA_CLOSE_VALUE` | 否 | 对应关门值，必须是 JSON 标量，例如 `false`、`1` 或 `"close"`。 |

未确认 DPS 映射时，请不要填写最后两个变量。可使用仓库中未发布的 `scripts/inspect-tuya.mjs` 做只读检查，并在官方 App 中人工确认物理门与 DPS 的对应关系。

## 获取 Tuya 本地参数

本 MCP 运行时只连接局域网设备，但首次取得设备元数据的官方路径通常需要 Tuya Developer Platform 的 App 账户授权。不同 OEM、固件和网关设备的支持情况不同；不要根据产品名称猜测 DPS、值或协议版本。

| 本 MCP 变量 | Tuya 名称 | 推荐来源 |
| --- | --- | --- |
| `TUYA_DEVICE_ID` | `Device ID` / `devId` | Developer Platform 的设备列表或设备详情。 |
| `TUYA_LOCAL_KEY` | `local_key` | 授权项目的设备详情/API。 |
| `TUYA_HOST` | `ip` | 路由器/DHCP 客户端列表，或设备详情。 |
| `TUYA_VERSION` | LAN 协议版本 | 本地只读探测的成功结果。 |
| `TUYA_PORT` | 本地 TCP 端口 | 常见默认值为 `6668`，但须实际验证。 |
| `TUYA_CLOSE_DPS` / `TUYA_CLOSE_VALUE` | 数字 DPS 与值 | 本地观察与独立物理验证。 |

### Device ID 和 Local Key

1. 登录 [Tuya Developer Platform](https://iot.tuya.com/)，创建或选择与 Smart Life/Tuya Smart 账户同一区域的项目。
2. 进入 **Devices → Link Tuya App Account → Add App Account**，用 App 扫码并确认授权。
3. 在 **Devices → All Devices** 中选择目标设备，复制 `Device ID`。
4. 通过 **Debug Device** 或授权后的设备详情 API 取得 `local_key`、当前 `ip` 和在线状态。
5. 将 `Device ID` 填入 `TUYA_DEVICE_ID`，将 `local_key` 原样加双引号填入 `TUYA_LOCAL_KEY`。

Smart Life App 通常不能直接显示 Local Key。删除重加设备、恢复出厂或重新配网后，Local Key 和 IP 可能变化，必须重新取得并验证。不要将 Local Key、平台 Access ID/Secret 或令牌写入日志、issue 或聊天消息。

官方参考：

- [链接 Tuya App 账户](https://developer.tuya.com/en/docs/iot/link-devices?id=Ka471nu1sfmkl)
- [查看设备列表](https://developer.tuya.com/en/docs/iot/view-the-device-list?id=Ka47201wc9ohp)
- [查询设备详情](https://developer.tuya.com/en/docs/cloud/3829469013?id=Kcp2l2v9wma0m)

### IP、端口和协议版本

在路由器/DHCP 客户端列表中按设备 MAC 或名称查找当前 IP，填入 `TUYA_HOST`。建议为设备保留 DHCP 租约。主机变量只填 IP/主机名，例如 `192.168.1.50`，不要填写 `http://` 或 `:6668`。

填入已知的 Device ID、Local Key、IP 和端口后，可运行只读探测：

```sh
node scripts/inspect-tuya.mjs
```

该脚本会尝试本地协议并读取 DPS；不会调用 `set()` 或发送开关门指令。若输出 `protocolVersion: 3.4` 和 `dps`，设置：

```env
TUYA_VERSION=3.4
TUYA_PORT=6668
```

本 MCP 只接受本项目已验证的 `3.4`。若探测仅在其他版本成功，请勿强行绕过限制。

### 确认关门 DPS 与值

仅发现某个 DPS 存在，不能证明它是“关门”。安全流程：

1. 保持 `TUYA_CLOSE_DPS` 和 `TUYA_CLOSE_VALUE` 未设置，让 MCP 关门功能保持禁用。
2. 运行 `node scripts/inspect-tuya.mjs`，保存 DPS 基线。
3. 确认门体活动区域安全后，通过官方 App 对已确认的目标门做一次人工操作。
4. 可同时运行 `node scripts/listen-tuya.mjs`，观察 App 操作引起的 DPS 变化；它只监听，不会控制门。
5. 只有经独立物理验证确认“此 DPS + 此 JSON 值”确实为目标门关门操作后，才写入 `.env`。

部分设备限制并发 LAN 连接；监听时不要长期运行多个本地客户端。监听输出可能暴露运行状态，不应公开。

`TUYA_CLOSE_VALUE` 是 JSON 标量，以下值类型不同：

```env
TUYA_CLOSE_VALUE=false
TUYA_CLOSE_VALUE=1
TUYA_CLOSE_VALUE='"close"'
```

最后一项才是 JSON 字符串 `"close"`。更新 `.env` 后重启 MCP 服务。

## Hermes / MCP Host 示例

推荐直接由 host 注入环境变量，而非依赖当前工作目录的 `.env`：

```json
{
  "mcpServers": {
    "tuya-close-door": {
      "command": "npx",
      "args": ["-y", "@osqi/mcp-tuya-close-door"],
      "env": {
        "TUYA_DEVICE_ID": "你的设备ID",
        "TUYA_LOCAL_KEY": "你的16位LocalKey",
        "TUYA_HOST": "192.168.1.50",
        "TUYA_VERSION": "3.4",
        "TUYA_PORT": "6668",
        "TUYA_CLOSE_DPS": "6",
        "TUYA_CLOSE_VALUE": "false"
      }
    }
  }
}
```

全局安装时，将 `command` 改为 `mcp-tuya-close-door`。

## MCP 工具

### `tuya_close_door`

向已配置的设备发送一次本地关门指令。

```json
{ "confirmation": true }
```

未传确认或非 `true` 值会被拒绝。命令接受成功仅表示本地 Tuya 设备接受请求；请用摄像头或其他独立方式验证门已关闭。

## 开发与发布

```sh
npm ci
npm test
npm pack --dry-run
```

确认 tarball 不包含 `.env` 后，再发布公开 scoped 包：

```sh
npm login
npm publish --access public
```

建议为 npm 账户启用 2FA。发布后可使用：

```sh
npx -y @osqi/mcp-tuya-close-door
```

## License

[MIT](LICENSE)
