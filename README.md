# Sales CRM Prototype

这是一个给销售团队使用的 CRM 网页应用，包含登录权限、团队 dashboard、客户管理、销售看板、跟进记录和 JSON backup。

本地运行默认使用 SQLite；云端设置 `DATABASE_URL` 后会自动使用 PostgreSQL。

## 本地运行

```powershell
python server.py
```

打开：

```text
http://127.0.0.1:5173
```

## 默认账号

| 用户名 | 密码 | 角色 | 负责人 |
| --- | --- | --- | --- |
| admin | admin123 | 管理员 | 全部 |
| mei | sales123 | 销售 | Mei |
| jason | sales123 | 销售 | Jason |
| alicia | sales123 | 销售 | Alicia |

上线后请建立正式账号，并删除不需要的测试销售账号。

云端管理员密码来自 Render 的 `CRM_ADMIN_PASSWORD`。修改这个环境变量并重新部署后，admin 密码会自动同步更新。

## 公司 Logo

把公司 Logo 命名为：

```text
logo.png
```

上传到 GitHub repository 根目录，也就是和 `index.html` 放在同一层。Render 重新部署后，登录页和左侧导航会自动显示这个 Logo。

## 权限

- 管理员可查看全部客户、团队 dashboard、backup 和团队账号。
- 销售只能查看 `owner` 等于自己负责人名称的资料。
- 销售新增客户时，后端会自动设为自己的负责人名称。

## Admin 客制化

管理员登录后可进入“系统设置”修改：

- CRM / 公司名称
- 副标题
- 每月销售目标
- 销售看板的阶段与顺序
- 客户状态名称与颜色
- 哪些状态需要计入“已成交”
- 跟进类型，例如电话、WhatsApp、Zoom、面谈
- 直接上传公司 Logo
- 为每位销售设置不同的每月 KPI

设置保存在数据库，重新部署后仍会保留。公司 Logo 继续使用 repository 根目录的 `logo.png`。

新版也可以在“系统设置”直接选择 PNG/JPG/WebP Logo 并保存到数据库，不再需要上传 GitHub。个人 KPI 会按销售账号的“对应负责人”计算 Dashboard 进度；没有单独设置时会使用全公司的每月目标。

客户表单不会显示机会金额。填写“跟进日期、类型、内容”并保存客户后，会自动建立一条跟进记录；再次编辑客户时可查看该客户的历史跟进。

当客户状态被 Admin 标记为“计入成交”时，客户表单才会显示销售金额。本月成交金额按成交日期统计，并用于计算每月销售目标进度；非成交状态的金额会自动归零。

业务字段显示名称：

- 来源显示为 `Batch`
- 销售阶段显示为 `Booster MDS 月份`
- 预计成交日期显示为 `Booster 日期`
- 状态名称包含“成交”时，`Sales Amount` 会自动出现，并按 Booster 日期的月份计入本月销售目标。

## 免费云端部署

推荐：

- Render Free Web Service：运行 CRM
- Neon Free PostgreSQL：保存客户、账号和跟进资料

步骤：

1. 在 Neon 创建免费 PostgreSQL project。
2. 在 Neon Project Dashboard 按 `Connect`。
3. 复制 pooled connection string。
4. 在 Render Blueprint 部署时，把 connection string 填入 `DATABASE_URL`。
5. 在 `CRM_ADMIN_PASSWORD` 输入只有你知道的管理员密码。
6. Render 自动执行 `pip install -r requirements.txt` 和 `python server.py`。

首次连接空的 PostgreSQL 数据库时，CRM 会自动建立 tables、示例资料和管理员账号。云端不会自动创建示例销售账号，请由管理员在“团队账号”页面创建。

## Backup

- `Export Backup`：下载 JSON backup。
- `Import Backup`：管理员把 JSON backup 导入数据库。
