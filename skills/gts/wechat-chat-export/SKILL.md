---
name: "wechat-chat-export"
description: "导出微信 PC 版聊天记录（按联系人昵称找 wxid → 解密 MSG 库 → UTF-8 落盘，含附件/图片提取）"
---

# 微信聊天记录导出 Skill

> 触发词：兄弟说「拿微信聊天记录」「导出微信聊天」「微信与 XX 的聊天」
> 原理：PyWxDump 从微信进程内存读密钥 → 解密本地 MSG 数据库 → SQLite 查询导出
> 不需要重启微信、不需要手机、不需要 root。仅支持兄弟自己的本机微信数据。

---

## 前置条件

1. **微信 PC 版正在运行**（密钥在内存里，必须运行中才能取）
   - 检查：`Get-Process | Where-Object { $_.ProcessName -match "WeChat" }`
   - 版本要求：3.9.x 最佳（PyWxDump 支持最稳）；4.x 新版数据结构不同，需先验证
2. **Python 环境**：本机唯一 python 是 hermes venv（`C:\Users\Administrator\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe`），**无 pip 模块**，首次要先 `python -m ensurepip`
3. 网络：安装 pywxdump 需 pip 能访问 PyPI（必要时先 Clash global）

## 一次性环境准备（装过可跳过）

```powershell
python -m ensurepip
python -m pip install pywxdump
```

CLI 入口是 `C:\Users\Administrator\AppData\Local\hermes\hermes-agent\venv\Scripts\wxdump.exe`（包名 pywxdump 没有 __main__，不能 `python -m pywxdump`）

## 流程

### Step 0: 🔴 解密前必须让微信退出（wal 增量）

微信运行中，最近的消息在 `MSG*.db-wal`（未 checkpoint 的增量）里，pywxdump 纯文件解密**不处理 wal** → 直接解密会缺最新消息（实测缺了 8/10 17:14 之后的所有消息，含今天）。

- 标准做法：**请兄弟退出微信**（托盘图标退出）→ SQLite 自动 checkpoint，wal 合并进主库（wal 文件消失、MSG db LastWriteTime 更新）→ 再解密
- 密钥不变：微信数据库 key 是固定派生的，重启后同一个 key 照样能用
- 已验证不可行的替代方案（别浪费时间）：sqlcipher3-binary/pysqlcipher3（Windows 无 wheel / 编译失败）、sqlcipher3 0.6.2（对微信魔改 SQLCipher 格式 HMAC 校验失败，即使设 cipher_plaintext_header_size=16 / compatibility=3）、realTime.exe（大库超时 ERROR -1）

### Step 1: 取密钥 + 账号信息

```powershell
& "C:\Users\Administrator\AppData\Local\hermes\hermes-agent\venv\Scripts\wxdump.exe" info
```

输出含：pid / version / account / wxid / **key** / wx_dir。
记录 key 和 wxid。

### Step 2: 确认活跃数据目录（🔴 最容易踩坑）

`info` 报的 wx_dir 来自注册表，**可能过期**。本机实测同时存在两个同名 wxid 目录：

- `D:\WeChat Files\wxid_xxx` ← 2024 年旧数据（用当前 key 解密 = Key Error）
- `D:\Users\Administrator\Documents\WeChat Files\wxid_xxx` ← 当前活跃（MSG3.db 当天仍在写入）

**判断方法**：对比各候选目录下 `Msg\Multi\MSG*.db` 的 LastWriteTime，**今天/最近在写的就是活跃目录**（微信退出后 wal 会合并，但主 db 时间仍最新）。旧目录的 MSG 库解密必 Key Error——先按此排查，别怀疑 key 错了。

**解密前流程**：先让兄弟退出微信（见 Step 0），退出后 wal 合并，再开始解密。

### Step 3: 解密

```powershell
$out = "D:\Downloads\wechat-decrypted"
& "...\wxdump.exe" decrypt -k <key> -i "<活跃目录>\Msg" -o $out
```

- 输出末尾看统计：`成功 N 个, 失败 M 个`。**只要 MSG0-3.db 是 [+] 成功即可**；-shm/-wal/bak 文件 Key Error / File Error 属正常，忽略
- 解密产物：`$out\Multi\de_MSG0~3.db`、`$out\de_MicroMsg.db`

### Step 4: 按昵称/备注查 wxid

联系人库：`$out\de_MicroMsg.db` → `Contact` 表（列：UserName, Alias, Remark, NickName）

```sql
SELECT UserName, NickName, Alias, Remark FROM Contact
WHERE NickName LIKE '%<昵称>%' OR Remark LIKE '%<昵称>%' OR Alias LIKE '%<昵称>%'
```

- 昵称在 NickName，备注在 Remark，微信号在 Alias
- ⚠️ Remark/NickName 中文读出来可能是 GBK 字节乱码（如 `浣樻垬鏂?`），这是 sqlite3 直读原始字节 + 显示层问题，**用 `text_factory = lambda b: b.decode('utf-8', errors='replace')` 或干脆按 NickName 匹配**（NickName 实测正常）。以 UserName 为权威标识

### Step 5: 导出聊天记录

聊天库：`$out\Multi\de_MSG0~3.db`（按时间分片，**必须全查**）

```sql
SELECT localId, Type, SubType, IsSender, CreateTime, StrContent, DisplayContent
FROM MSG WHERE StrTalker = '<wxid>' ORDER BY CreateTime ASC, localId ASC
```

- 也可能在 Name2ID 表有 TalkerId 映射，但直接按 StrTalker 查最稳
- 消息类型 Type：1=文本, 3=图片, 34=语音, 43=视频, 47=表情, 49=链接/文件, 10000=系统消息（含撤回标记 `<revokemsg>`）
- IsSender：1=我，0=对方
- CreateTime 是 Unix 秒 → `datetime.fromtimestamp()`
- 导出后核对 max(CreateTime)：若早于现在，说明还有增量未拿到

### Step 6: 提取附件（文件 + 图片）

> 只导文本不完整，兄弟会要求把图片/文件也提取出来。全部在微信本地 FileStorage，无需联网。

**6a. 文件（docx/doc/md 等）— 未加密，直接复制**

- 位置：`<活跃目录>\FileStorage\File\YYYY-MM\`（按接收月份分目录）
- 文件是**原始文件名、不加密**，直接 `shutil.copy2` 到目标目录
- 🔴 **归属判断**：File 目录是所有聊天共用，需与聊天消息对应——查 type=49 消息的 `CompressContent`（protobuf/XML 混合，StrContent 的 title 常为空），正则取 `<title>(.*?)</title>` 得到真实文件名
- type=49 sub=6 = 文件消息；**type=49 sub=57 = 链接分享**（appid 空，title 是描述文字），无本地文件，跳过
- 同月份其他聊天文件（如招聘 docx、mp4）不属于目标会话，不复制

**6b. 图片 — .dat 加密，XOR 解密 + md5 匹配**

- 位置：`<活跃目录>\FileStorage\MsgAttach\<会话hash>\Image\YYYY-MM\*.dat`（Thumb\ 是缩略图，找 Image\）
- 加密：单字节 XOR。**从文件头 2 字节异或图片魔数推出 key**（jpg=FFD8/png=8950/gif=4749/webp=5249/bmp=424D），实测微信 3.9 key=0xdb；整文件逐字节异或即明文
- 🔴 **匹配归属最稳方式 = md5**：图片消息 StrContent XML 里有 `md5="32位hex"` 属性；解密后 `hashlib.md5(明文).hexdigest()` 对上即命中，不怕多会话混淆
- 缩略图（*_t.dat）忽略；按 `st_mtime >= 会话开始时间` 过滤可缩小搜索
- 落盘命名建议：`YYYY-MM-DD_HH-MM_来源_描述.ext`，与聊天时间对应
- MediaMSG 库（de_MediaMSG0~3.db，表 Media: Key/Reserved0/Buf/Reserved1/Reserved2）存媒体路径索引但 Buf 是 protobuf，**不必解析**，直接扫 Image 目录更快

### Step 7: 输出

- 写 UTF-8 文件（如 `D:\Downloads\wechat-decrypted\chat_<昵称>.txt`），附件归到 `聊天记录附件/文件|图片/` 子目录
- 🔴 **PowerShell 窗口显示中文乱码（锟斤拷/浣樻垬鏂）≠ 数据坏**：管道显示层 GBK 问题。用 read 工具直读落盘文件验证内容
- 汇报格式：联系人真名/wxid/消息数/时间范围 + 附件清单（文件/图片数量）+ 对话概要（先摘要再细节），文件路径
- 在导出的 md 里附「聊天记录附件」清单表（发送方/时间/说明），图文互证

## 注意事项

- 🔴 微信 4.x（xwechat_files 目录）数据结构不同，本流程未验证；遇到先确认版本
- 🔴 取密钥需要微信运行中；若微信未运行，让兄弟先打开微信再执行 Step 1
- 解密旧目录数据（历史迁移场景）：旧目录用旧 key，但当前 key 解不开——需要旧微信版本的 key 或放弃（本机实测 D:\WeChat Files 旧库 0 成功）
- 数据敏感：只导出兄弟明确要求的人；不外传、不落盘到共享位置
- 清理：解密产物默认放 `D:\Downloads\wechat-decrypted\`，用完可删（含全部聊天明文，注意保管）
