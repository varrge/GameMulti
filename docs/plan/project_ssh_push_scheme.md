# GameMulti 项目统一 SSH 推送方案

## 1. 目标

为 GameMulti 项目提供统一的 GitHub SSH 推送方案，避免为每个执行成员单独配置 GitHub 认证。

采用方式：

- 一个项目级 SSH key
- 统一用于 GameMulti 仓库推送
- 所有执行成员共用该推送身份
- 通过 git commit 作者名和任务系统记录区分具体执行者

---

## 2. 当前项目专用 SSH key

### 私钥路径
- `~/.ssh/gamemulti_ed25519`

### 公钥路径
- `~/.ssh/gamemulti_ed25519.pub`

### 公钥内容

```text
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBjQEXf2S2LC0PO3FcMk7o/dqi0Zqbx+fCfVhu6t8OHQ gamemulti-bot
```

### 指纹
- `SHA256:6MzMQaX2YPHeMN9sUq8l1CK1WAkYQnK+mu7/te+DEY8`

---

## 3. GitHub 侧需要做的事

将上述公钥添加到用于管理 GameMulti 项目的 GitHub 账号中：

1. 打开 GitHub
2. 进入 Settings
3. 进入 SSH and GPG keys
4. 选择 New SSH key
5. 粘贴公钥内容
6. 保存

推荐绑定到：
- 项目 bot 账号
- 或项目维护账号

不建议长期绑定到个人主账号。

---

## 4. SSH config 建议

建议在 `~/.ssh/config` 增加：

```sshconfig
Host github-gamemulti
  HostName github.com
  User git
  IdentityFile ~/.ssh/gamemulti_ed25519
  IdentitiesOnly yes
```

---

## 5. 仓库 remote 建议

将 GameMulti 仓库 remote 改成：

```bash
git remote set-url origin git@github-gamemulti:varrge/GameMulti.git
```

如果暂时不使用 Host alias，也可用：

```bash
git remote set-url origin git@github.com:varrge/GameMulti.git
```

---

## 6. 团队统一规则

从现在开始：

1. GameMulti 项目统一使用该 SSH key 推送
2. 所有实现型任务走 `develop + feature/*` 流程
3. 提交时必须设置自己的 git 作者名与邮箱
4. 交付摘要必须写明：
   - 分支名
   - commit
   - 改动路径
   - 验证方式

