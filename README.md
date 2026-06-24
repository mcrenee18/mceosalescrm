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

## 权限

- 管理员可查看全部客户、团队 dashboard、backup 和团队账号。
- 销售只能查看 `owner` 等于自己负责人名称的资料。
- 销售新增客户时，后端会自动设为自己的负责人名称。

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
