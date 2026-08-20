---
name: "wechat-pc-export-playbook"
description: "微信 PC 聊天记录导出 — Hermes 0.19+ 跑通的标准流程（uv + venv + pywxdump），覆盖 wal/活跃目录/同音字标题/mtime 校正等踩坑。触发词：「微信聊天」「导出聊天」「与 X 的聊天」「wxdump」。"
---

# 微信 PC 聊天记录导出 — Hermes 0.19+ 实操手册

> 用途：兄弟本机微信解密 + 1-on-1 / chatroom 聊天导出到 Markdown + 附件归档
> 触发词：兄弟说「导出与 X 的微信聊天」「拿聊天记录」「最近跟 X 聊了什么」
> 实测日期：2026-08-18
> 本 skill 由 agent 在 OpenClaw→Hermes 迁移后新增（created_by=agent），可被 skill_manage 工具 patch；如需同步到人工创建的 `gts:wechat-chat-export` skill 需兄弟手跑 hermes skills 命令

---

## 一、环境准备（uv + 永久 venv）

### 1.1 装 uv（如无）

```powershell
irm https://astral.sh/uv/install.ps1 | iex
# 装到 C:\Users\Administrator\.local\bin\uv.exe
```

### 1.2 建永久 venv

```powershell
$env:Path = "C:\Users\Administrator\.local\bin;$env:Path"
uv venv "C:\Tools\wechat-venv" --python 3.11 --seed
```

### 1.3 装 pywxdump

```powershell
C:\Tools\wechat-venv\Scripts\python.exe -m pip install pywxdump
# 验证
C:\Tools\wechat-venv\Scripts\wxdump.exe --version
# 期望 PyWxDump v3.1.46
```

✅ venv ≈ 130 MB，无 Clash 也装得下。

---

## 二、整体流程（5 步）

### Step 1: 🔴 让兄弟退微信 + 等 30s

```powershell
Get-Process | Where-Object { $_.ProcessName -match "WeChat" }
# 空 = 已退
```

**为啥必须退**：
- 微信运行中,当天最新消息在 `MSG*.db-wal`(未 checkpoint 的增量)
- pywxdump 纯文件解密**不处理 wal** → 当天消息会缺
- 退出后 SQLite 自动 checkpoint 合并，wal 消失
- 密钥不变(= 固定派生的),重启后还能拿

### Step 2: 兄弟开微信 + 30s 登录 + wxdump info 拿 key

开微信 → 等 30s 登录 →

```powershell
C:\Tools\wechat-venv\Scripts\wxdump.exe info
```

输出关键字段：

```
[+]      pid: 20032
[+]  version: 3.9.12.55
[+]  account: chaogex          ← 兄弟本人
[+]     wxid: wxid_a6hq853qgvjq21
[+]      key: b192df8c...      ← 记下来！
[+]   wx_dir: D:\Users\...\WeChat Files\wxid_a6hq853qgvjq21
```

🔴 **wxdump info 必须在微信运行时**，无旁路——必须先开微信再跑。耗时 ~30s。

### Step 3: 退出微信 + 等 30s + decrypt

```powershell
# 兄弟退微信 → 等 30s 让 wal 合并

# decrypt（约 1-2 分钟，MSG0-3 库都解）
C:\Tools\wechat-venv\Scripts\wxdump.exe decrypt `
    -k <key from step 2> `
    -i "<wx_dir>\Msg" `
    -o D:\Downloads\wechat-decrypted
```

输出末尾统计「成功 N, 失败 M」。**只要 MSG0-3.db 是 `[+]` 即可**；-shm/-wal/bak 失败属正常。

decrypt 产物在 `D:\Downloads\wechat-decrypted\`：

```
de_MicroMsg.db          ← 联系人（查 wxid）
de_MediaMSG.db
Multi/de_MSG0.db        ← 历史
Multi/de_MSG1.db
Multi/de_MSG2.db
Multi/de_MSG3.db        ← 最新（含当天）
Multi/de_FTSMSG*.db     ← 全文索引（暂不用）
```

### Step 4: 查 wxid（4 种方法，按可靠度排）

**方法 A — 按业务上下文锁定 wxid（最稳）**：凭历史 daily、OpenClaw 时代的渠道笔记、兄弟当前任务找候选 wxid，本机常用：
- `wxid_ghy4vr5r5vzw22` = 图书编辑佘战文 / 05.9 / 微信号 S379217608
- `wxid_a6hq853qgvjq21` = 兄弟本人

**方法 B — 跨 MSG 库搜关键词（兜底）**：

```python
# find-talker.py
import sqlite3, re
OUT = r'D:\Downloads\wechat-decrypted'
talks = set()
for i in range(4):
    db = sqlite3.connect(f'{OUT}\\Multi\\de_MSG{i}.db')
    db.text_factory = lambda b: b.decode('utf-8', errors='replace')
    for kw in ['佘战文', '佘', '战文', '图书编辑', '余老师']:
        for r in db.execute(
            "SELECT DISTINCT StrTalker FROM MSG WHERE DisplayContent LIKE ? LIMIT 20",
            (f'%{kw}%',)
        ).fetchall():
            talks.add(r[0])
for t in sorted(talks): print(t)
```

**方法 C — Contact 表查**（最不可靠，对方删你就会缺）：

```python
import sqlite3
db = sqlite3.connect(r'D:\Downloads\wechat-decrypted\de_MicroMsg.db')
db.text_factory = lambda b: b.decode('utf-8', errors='replace')
for kw in ['佘战文', '05.9']:
    rows = db.execute(
        "SELECT UserName, NickName, Alias, Remark FROM Contact "
        "WHERE NickName LIKE ? OR Remark LIKE ? OR Alias LIKE ?",
        (f'%{kw}%', f'%{kw}%', f'%{kw}%')
    ).fetchall()
    print(kw, rows)
```

**方法 D — 同音字识别**：兄弟可能临时记错名字（"余战文" = "佘战文"），**别死磕 nick**，直接信 wxid。

### Step 5: 导出当天 1-on-1 消息 → Markdown

```python
# dump-today.py
import sqlite3, datetime, re

OUT = r'D:\Downloads\wechat-decrypted'
TALKER = 'wxid_ghy4vr5r5vzw22'
ts_start = int(datetime.datetime(2026, 8, 18).timestamp())
ts_end   = int(datetime.datetime(2026, 8, 19).timestamp())

def humanize(t): return datetime.datetime.fromtimestamp(t).strftime('%Y-%m-%d %H:%M:%S')

all_msgs = []
for i in range(4):
    db = sqlite3.connect(f'{OUT}\\Multi\\de_MSG{i}.db')
    db.text_factory = lambda b: b.decode('utf-8', errors='replace')
    rows = db.execute(
        "SELECT localId, StrTalker, CreateTime, IsSender, Type, SubType, StrContent, DisplayContent, CompressContent "
        "FROM MSG WHERE StrTalker=? AND CreateTime >= ? AND CreateTime < ? "
        "ORDER BY CreateTime ASC, localId ASC",
        (TALKER, ts_start, ts_end)
    ).fetchall()
    all_msgs.extend(rows)

all_msgs.sort(key=lambda r: (r[2], r[0]))
# 输出 Markdown...
```

**当天消息主要在 MSG3.db**（其他库是历史），查所有 4 个库才完整。

文件消息 type=49：`<title>` 节点常空（docx 之类），靠本地 `FileStorage` mtime+size 校正（见 Step 6）。

### Step 6 (可选): 文件附件提取

```python
# extract-files.py
import os, shutil, sqlite3, re
from collections import defaultdict

OUT = r'D:\Downloads\wechat-decrypted'
WX_DIR = r'D:\Users\Administrator\Documents\WeChat Files\wxid_a6hq853qgvjq21'

# 1. 解密产物的 type=49 msg
file_msgs = []
for i in range(4):
    db = sqlite3.connect(f'{OUT}\\Multi\\de_MSG{i}.db')
    db.text_factory = lambda b: b.decode('utf-8', errors='replace')
    for r in db.execute(
        "SELECT CreateTime, StrContent FROM MSG WHERE StrTalker=? AND Type=49",
        ('wxid_ghy4vr5r5vzw22',)
    ).fetchall():
        file_msgs.append(r)

# 2. 本地 FileStorage 当年所有文件
file_dir = os.path.join(WX_DIR, 'FileStorage', 'File', '2026-08')
files = [(os.path.getmtime(p), os.path.getsize(p), p)
         for f in os.listdir(file_dir) for p in [os.path.join(file_dir, f)]]

# 3. mtime 阈值匹配（300s = 5min）+ 校验文件大小
# 同 mtime 用 size 进一步区分（编辑可能连发 2 个文件）
# ...详见上方 make-md.py 逻辑

# 4. 复制正本到 D:\Downloads\wechat-decrypted\聊天记录附件\文件\
target = os.path.join(OUT, '聊天记录附件', '文件')
os.makedirs(target, exist_ok=True)
for mtime, size, src in matched:
    ts_str = datetime.datetime.fromtimestamp(mtime).strftime('%Y%m%d_%H%M%S')
    shutil.copy2(src, os.path.join(target, f'{ts_str}_{os.path.basename(src)}'))
```

**🔴 文件归属判定（mtime+size）**：
- 文件消息时间 ± 5min 内匹配
- 同 mtime 用文件大小去重（碰撞概率低但要防）
- 同 5min 内编辑连发 2 个文件的情况用 `<title>` 内容辅助判

---

## 三、踏过的坑(踩坑清单)

### 0. 🔴 图片（type=3）提取方法：pywxdump dat2img（2026-08-18 实测 7/7 成功）

兄弟问「图片拿到了吗」时，别只标 `[Image]` 就完事——编辑发的**批注截图**是写书重要素材，必须提取本体。方法：

1. **盘点图片消息**：查 MSG 表 `Type=3` 的消息（当天 + 该联系人），拿到时间/发送方
2. **定位 .dat**：图片在 `FileStorage\MsgAttach\<hash>\Image\YYYY-MM\*.dat`，按 mtime 对应消息时间（15:38 消息 → 15:38 的 .dat）
3. **解密（关键）**：用 pywxdump 自带函数，**不用手动猜 AES/XOR**：
   ```python
   from pywxdump.db.utils import dat2img
   ok, fmt, md5, data = dat2img(dat_path)   # XOR 异或 + 自动识别 jpg/png/gif
   with open(out_path, 'wb') as f: f.write(data.tobytes())
   ```
   - `wxdump wxdecrypt` CLI **不存在**（3.1.46 报 invalid choice），别浪费时间
   - `dat2img` 遍历常见格式魔数自动 XOR 解密，实测本批全是 PNG
4. **落盘**：素材整理 `2026-08-18-编辑批注附件\` + 备份 `聊天记录附件\图片\`
5. **图片内容识别（批注截图文字）**：装 `rapidocr-onnxruntime`（`wechat-venv\Scripts\python.exe -m pip install rapidocr-onnxruntime`，纯 pip 免系统依赖，中文好），用法：
   ```python
   from rapidocr_onnxruntime import RapidOCR
   engine = RapidOCR()
   result, _ = engine(img_path)   # [[box, text, score], ...]
   ```
   识别结果整理成 md 表格（每张图内容要点），比调度 M3/OpenCode 省钱省时（2026-08-18 实测 7 张一次跑完）。

> ❌ 不要自己试 AES-ECB/CBC/XOR 穷举（浪费大量 token）——**先搜记忆/skill 再动手**（兄弟 2026-08-18 拍板「搜索记忆啊，以前处理过」）。

### 1. venv 路径已漂移

❌ 老 skill 路径 `C:\Users\Administrator\AppData\Local\hermes\hermes-agent\venv\Scripts\wxdump.exe` —— OpenClaw→Hermes 迁移后**已被清理**

✅ 新路径：`C:\Tools\wechat-venv\Scripts\wxdump.exe` —— 永久目录，跨 Hermes 升级不受影响

### 2. PowerShell `&` 调用符被 Hermes terminal 误判

`& "C:\Tools\wechat-venv\Scripts\wxdump.exe" info` → 报 "Foreground command uses '&' backgrounding. Use terminal(background=true)..."

✅ 直接用绝对路径不加 `&`；或 `powershell -NoProfile -ExecutionPolicy Bypass -File "..."` 包一层

### 3. Python `-c "..."` 嵌套引号/中文/通配符必炸

`python -c "import sqlite3; db.execute('SELECT ... LIKE \"%...%\"')"` —— PS 5.1 不吃

✅ 统一写 `.py` 脚本到 `C:\Tools\wechat-venv\<step>.py`，用 `& "C:\Tools\wechat-venv\Scripts\python.exe" "C:\Tools\wechat-venv\<step>.py"` 跑

### 4. type=49 文件消息 title 节点常空

docx 文件消息的 `StrContent` 里 `<title>` 是空字符串：

```xml
<msg><appmsg><title></title><appname>...</appname></appmsg></msg>
```

✅ 不能信 XML 提取文件名——直接读本地 `FileStorage\File\YYYY-MM\` + mtime 校正

> 🔴 **2026-08-18 加严：可能整条 StrContent 都是空**（6 条 type=49 全空，连 `<msg>` 都没有，`<title>` 正则 0 命中 → `(无标题)`）。此时**只能靠 mtime+size 硬编码映射**，不能靠 XML。做法：列出 FileStorage\File\YYYY-MM 全部文件（mtime+size），按消息时间 ±5min 窗口内语义确认（如「兄弟 14:55 发资料」→ 匹配 mtime 14:26 的《资料融合修订版》目录.docx）。

### 4b. 🔴 同 mtime 文件混淆 + 发送文件 mtime 早于消息时间

- **同 mtime**：编辑连发 2 个文件（如 11:25 目录.docx 和【选题审查意见表】.docx 都是 11:25:32），5 分钟窗口匹配会全部命中第一个 → 复制错文件。**必须用 size 进一步区分 + 语义确认**。
- **发送文件 mtime 早于消息时间**：兄弟 14:55/14:56 发的文件，FileStorage mtime 是 14:26/14:46（微信发送时预复制/保留原始修改时间），**5 分钟窗口匹配会漏**。判定「兄弟发的是什么」靠业务语义（如聊天里说「资料发给您了」→ 那两条就是当天的目录修订版+选题表填写稿），不能纯靠时间窗。
- 建议：**写精确映射脚本**（消息时间 → 文件名+size 硬编码），逐个 copy 并校验 size，不依赖时间窗口模糊匹配。

### 4c. 🔴 copy2 复制 FileStorage 文件带 ReadOnly 属性

`shutil.copy2` 会保留源文件属性，从 FileStorage 复制出的附件常是 ReadOnly → `Remove-Item` 报「没有足够权限」但文件实际没删。处理：

```python
import os
p = r"...\xxx.docx"
os.chmod(p, 0o644)   # 去掉只读
os.remove(p)
# 或 PowerShell: Set-ItemProperty -LiteralPath $p -Name IsReadOnly -Value $false; Remove-Item -LiteralPath $p -Force
```

### 5. 同音字备注 / 兄弟临时记错人名

兄弟说"余战文"=实际是"佘战文"（同音字，wxid 一致）。在 Contact 表按"余战文"**完全 0 命中**

✅ **wxid 优先**；凭业务上下文锁定 wxid 别死磕 nick；UserName 是唯一权威标识

### 6. FileStorage 多聊天混合

`FileStorage\File\2026-08\` 是所有聊天的文件混合目录

✅ mtime 校正 + 跟当前聊天时间窗口对（避免把招聘文件/截图/MP4 误拉到目标聊天）

### 7. type=49 文件 vs 链接分享

- type=49 sub=6 = **文件消息**（有本地 FileStorage 文件）
- type=49 sub=57 = **链接分享**（无本地文件，title 是描述文字，跳过）

✅ 用 `SubType` 区分

### 8. MSG0-2 老库 vs MSG3 当天新库

微信分片存储：MSG0-2 是历史（最近一次写是 8/11），**MSG3 是当前活跃**（LastWriteTime 是当天）

✅ 查当天消息**主查 MSG3**，但完整导出要 4 个库都查（避免漏跨片时段）

### 9. 🔴 增量补抓（当天第二次/后续抓取）

兄弟说「再抓一次今天的」时，**不要只看现有解密库**——用户可能在你上次导出后**重开过微信**收发消息又退出（checkpoint 已合并进 MSG3.db），即使**当前微信未运行**也可能有新增。2026-08-18 实况：第一次抓到 15:56 共 48 条，几小时后兄弟要求再抓，发现 16:00-17:54 又新增 28 条（含「样章定第10章」「数字空两格规范」「Dify 格式参考」等关键决策）。

**判定有无增量**：
```powershell
# 对比源库 vs 解密产物 LastWriteTime，源更新 = 有增量
Get-Item "D:\...\WeChat Files\wxid_...\Msg\Multi\MSG3.db" | Select LastWriteTime
Get-Item "D:\Downloads\wechat-decrypted-*\Multi\de_MSG3.db" | Select LastWriteTime
```

**补抓流程**：
1. **微信未运行也能解**——key 是固定派生密钥，直接 `wxdump decrypt -k <旧key>`，无需再跑 wxdump info / 无需兄弟开微信
2. **解密到新目录**（如 `wechat-decrypted-YYYYMMDDb`），避免覆盖已导出的旧库和附件
3. 增量查询：`WHERE StrTalker=? AND CreateTime > <上次截止时间戳>`（如上次到 15:56，就查 > 15:56 的），同样 4 个库都查
4. 更新 `make-md.py` 的 OUT 指向新库 + 补附件映射 + 摘要追加新时段，重新生成覆盖素材整理 md（旧版含上次内容，新生成是超集）

**🔴 注意**：兄弟要的「下午记录」常指**新增时段**（上次截止后到现在的增量），重点解析新消息里的决策/规范，别只重跑旧逻辑。

---

## 四、标准脚本清单

固化在 `C:\Tools\wechat-venv\` 下,以后复用：

| 脚本 | 用途 |
|------|------|
| `query-contact.py` | 按关键字搜 Contact 表（兜底用）+ 跨 MSG 库搜 DisplayContent |
| `run-decrypt.py` | subprocess 调 wxdump.exe decrypt，捕获 stdout |
| `dump-today.py` | 当天 1-on-1 + chatroom 按时间输出 Markdown |
| `find-wxid.py` | 反向辅助：跨 MSG 库搜关键词找 talker |
| `make-md.py` | Step 7：转 Markdown + 落盘附件清单 + 决策摘要 |
| `extract-files.py` | mtime 阈值匹配 + size 校正把 FileStorage 文件归到聊天 |
| `cleanup.py` | 修正坏副本（mtime 误匹配时多余文件清理） |
| `fix-files.py` | chmod + remove + shutil.copy2 容错复制（PS Remove-Item 锁时用） |

---

## 五、写入写书笔记的固定动作

导出到 `D:\Downloads\wechat-decrypted\` 后,**额外复制**到 `D:\Github\VibeCodingBook\笔记\素材整理\微信聊天记录-与<人名>-<日期>.md` —— 这是兄弟的写书素材区,VibeCodingBook 仓库唯一 markdown owner。

附件正本复制到 `D:\Github\VibeCodingBook\笔记\素材整理\<原名>_<日期>_<人名><描述>.docx`。

---

## 六、常用 wxid 速查（兄弟+编辑）

| wxid | 真名/昵称 | 备注/角色 |
|------|-----------|----------|
| `wxid_ghy4vr5r5vzw22` | 佘战文 / 05.9 / S379217608 | 图书编辑（成都艾瑞达，写书项目长期对接） |
| `wxid_a6hq853qgvjq21` | chaogex / gex / 13668214304 | 兄弟本人账号 |
| `qqmail` | QQMail 通知 | 系统消息 |
| `weixin` | 微信团队 | 系统消息 |
