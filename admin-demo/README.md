# GameMulti Admin Demo

这个目录提供一个纯前端静态演示页，用来快速串起后台最小管理闭环。

## 本次补充

新增了 **论坛联动最小闭环** 页面，覆盖：

- forum account 映射列表
- forum account 详情查看
- sync status 展示
- 最近失败原因展示
- 最近 ticket 状态列表
- 最近 sync job 状态列表
- 最小人工操作：对 `sync_profile` 任务执行“重试资料同步”模拟

同时保留原有：

- 玩家查询
- 邀请码管理
- 封禁入口

## 文件路径

- `admin-demo/index.html`
- `admin-demo/assets/app.js`
- `admin-demo/assets/styles.css`

## 本地运行

任选一种：

```bash
cd admin-demo
python3 -m http.server 4173
```

然后打开：

```text
http://localhost:4173
```

也可以直接双击 `index.html` 用浏览器打开。

## 演示说明

### 论坛联动视图

默认会选中一个 `sync_failed` 的 forum account，方便直接看到：

- forum account 映射信息
- 最近失败代码 / 失败原因
- 最近 ticket
- 最近 sync jobs

### 重试资料同步

在“最近 Sync Jobs”里点击“带入重试”，或者直接填写失败任务 ID（例如 `job_3`），再点击“模拟重试 profile sync”，页面会：

1. 校验任务是否存在
2. 校验任务类型是否为 `sync_profile`
3. 校验任务状态是否允许重试（`failed` / `succeeded` / `cancelled`）
4. 生成一条新的 pending job
5. 将 account 的 `syncStatus` 切为 `syncing`
6. 清空最近失败原因，模拟后端接受重试请求后的状态变化

这和契约里的：

- `GET /api/admin/forum/accounts`
- `GET /api/admin/forum/accounts/{forumAccountId}`
- `GET /api/admin/forum/tickets`
- `GET /api/admin/forum/sync-jobs`
- `POST /api/admin/forum/sync-jobs/{jobId}/retry-profile`

是一一对应的。

## 边界

这是静态 demo，不会真的请求后端，也不会持久化数据。主要用途是：

- 给后台页面结构打样
- 对齐接口字段和展示方式
- 提前验证运营排障视角够不够用
