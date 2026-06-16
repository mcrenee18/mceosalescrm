# Sales CRM Prototype

这是一个给销售团队使用的 CRM 网页应用原型，已经包含数据库、登录权限、团队 dashboard、客户管理、销售看板、跟进记录和 JSON 备份。

## 本地运行

在当前文件夹执行：

```powershell
python server.py
```

然后打开：

```text
http://127.0.0.1:5173
```

## 默认账号

首次启动时会自动建立这些账号：

| 用户名 | 密码 | 角色 | 负责人 |
| --- | --- | --- | --- |
| admin | admin123 | 管理员 | 全部 |
| mei | sales123 | 销售 | Mei |
| jason | sales123 | 销售 | Jason |
| alicia | sales123 | 销售 | Alicia |

上线前请用管理员登录，在“团队账号”里建立正式账号，并删除不需要的测试账号。

## 权限规则

- 管理员：可以看全部客户、全部销售机会、全部跟进记录、团队 dashboard、导入/重置 backup、管理账号。
- 销售：只能看到 `owner` 等于自己负责人名称的客户、机会和跟进记录。
- 销售新增客户时，系统会自动把负责人设成自己的负责人名称。

## 资料保存在哪里？

资料保存在当前文件夹的 `crm.sqlite3` SQLite 数据库里。

页面上也有：

- `Export Backup`：下载 JSON 备份
- `Import Backup`：管理员把 JSON 备份导回数据库

## 云端部署

这个版本已经可以部署到一台云端服务器。最简单的方式是 Render、Railway、Fly.io、VPS 或 NAS。

云端环境变量建议：

```text
CRM_HOST=0.0.0.0
PORT=5173
CRM_DB_PATH=/var/data/crm.sqlite3
CRM_COOKIE_SECURE=1
```

启动命令：

```text
python server.py
```

注意：如果部署到 Render 并继续使用 SQLite，请一定要开 Persistent Disk，并把 `CRM_DB_PATH` 指向 disk 里面，例如 `/var/data/crm.sqlite3`。Render 官方说明：没有 persistent disk 时，服务本地文件系统是临时的，重启或重新部署后写入的文件会消失。正式团队长期使用时，建议下一阶段换成 PostgreSQL 或 Supabase。
