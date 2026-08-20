# Tencent TokenHub 接入详情（hy3）

> 2026-08-18 实测。WorkBuddy 的 hy3 也是这个接入方式（兄弟确认）。

## Provider 定义

| 项 | 值 |
|---|---|
| Provider 名 | `tencent-tokenhub`（别名 `tencent`/`tokenhub`/`tencentmaas`） |
| 端点 | `https://tokenhub.tencentmaas.com/v1` |
| env 变量 | **`TOKENHUB_API_KEY`**（⚠️ 运行时只认这个；models_dev_snapshot.json 里写的 `TENCENT_TOKENHUB_API_KEY` 是错的） |
| 认证 | `Authorization: Bearer <key>` |

## 模型列表（2026-08-18 实测，key 权限内）

| 模型 | 状态 | 备注 |
|---|---|---|
| `hy3` | online | 256K 上下文/64K 输出，reasoning 支持 toggle/effort，支持工具调用（实测 terminal 工具 9s 完成） |
| `hy3-preview` | pre-offline | 旧版 |
| `glm-5.3` | online | |
| `glm-5.2` | online | |
| `deepseek-v4-flash` | online | 注意：这是 TokenHub 的 deepseek，不是 opencode-go 那个 |
| `kimi-k3` / `kimi-k2.7-code-highspeed` | online | |

完整列表：`GET https://tokenhub.tencentmaas.com/v1/models`（带 key）。

## 已知特性

- hy3 默认**极速响应模式（no_think）**，Hermes 暂不支持切思考模式（兄弟提供的指南原文）
- 直连 chat/completions **偶发 504 Gateway Timeout**（网关超时），重试即成功，不是 key/模型问题
- hy3 回答带 reasoning（Hermes 里显示 Reasoning 块）
- 腾讯文档：https://cloud.tencent.com/document/product/1823/130050

## 最终配置（2026-08-18 生效）

```
.env: TOKENHUB_API_KEY=sk-***（脱敏存储）
config.yaml: model.provider=tencent-tokenhub, model.default=hy3,
             model.base_url=https://tokenhub.tencentmaas.com/v1
```

- 新会话默认模型 = hy3；运行中会话不变（模型在会话启动时定格）
- 切回 deepseek：`hermes config set model.provider deepseek` + `model.default deepseek-v4-flash` + `model.base_url https://api.deepseek.com`（三个都要设，见 SKILL.md 坑 2）
