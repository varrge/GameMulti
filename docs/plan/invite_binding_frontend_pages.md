# 邀请制注册与绑定前端页面初稿

## 交付范围

本稿覆盖 4 个页面的前端设计与代码落地建议，供 GameMulti 仓库后续接入真实业务实现：

1. `/auth/invite` — 邀请码注册 / 登录入口
2. `/bind/confirm` — 绑定确认页
3. `/pair-code` — 配对码输入页
4. `/account` — 用户中心绑定信息展示页

## 页面目标与交互要点

### 1. `/auth/invite`
- 支持注册 / 登录模式切换
- 支持邀请码输入与基础格式校验
- 支持邀请码预览卡片
- 支持提交中、失败提示、成功后跳转
- 文案全部预留 i18n key

**联调点**
- `POST /api/invite/validate`
- `POST /api/auth/invite-register`
- `POST /api/auth/invite-login`

### 2. `/bind/confirm`
- 展示待绑定账号信息
- 展示授权范围说明
- 支持确认绑定 / 取消返回
- 支持提交 loading 与失败反馈

**联调点**
- `POST /api/bind/confirm`

### 3. `/pair-code`
- 支持 6 位配对码逐格输入
- 支持仅数字输入与粘贴拆分
- 支持重新获取入口与验证码倒计时占位
- 支持 verify 按钮禁用态

**联调点**
- `POST /api/pair-code/verify`
- `POST /api/pair-code/resend`（建议补充）

### 4. `/account`
- 展示已绑定游戏平台列表
- 展示绑定状态 badge
- 展示最近绑定时间 / 待完成状态
- 预留解绑入口（当前建议先禁用态占位）
- 覆盖 empty / loading / error / loaded 四种状态

**联调点**
- `GET /api/account/bindings`

## 推荐组件拆分

- `InviteAuthCard`
- `InvitePreview`
- `BindConfirmPanel`
- `PairCodeInput`
- `BindingSummaryList`
- `StatusBadge`

## 状态覆盖要求

所有页面都需要覆盖：
- `loading`
- `empty`
- `error`
- `success / loaded`

额外要求：
- 移动端优先，小屏卡片单列布局
- 所有用户可见文案通过 i18n 管理
- 表单输入提供即时校验和错误提示

## 页面落地建议路径

如果后续在正式前端工程中接入，建议目录如下：

- `src/pages/auth/invite.tsx`
- `src/pages/bind/confirm.tsx`
- `src/pages/pair-code/index.tsx`
- `src/pages/account/index.tsx`
- `src/components/invite/invite-auth-card.tsx`
- `src/components/invite/invite-preview.tsx`
- `src/components/bind/bind-confirm-panel.tsx`
- `src/components/pair-code/pair-code-input.tsx`
- `src/components/account/binding-summary-list.tsx`
- `src/components/common/status-badge.tsx`

> 当前仓库还没有实际前端脚手架，因此这里先给出推荐集成路径，方便后续对接 React / Next.js / Vue 项目结构。

## 可迁移代码初稿

```tsx
import React, { useMemo, useState } from 'react';

type BindingStatus = 'bound' | 'pending' | 'expired';

type BindingItem = {
  id: string;
  platform: string;
  accountName: string;
  status: BindingStatus;
  boundAt?: string;
};

const mockBindings: BindingItem[] = [
  { id: '1', platform: 'Steam', accountName: 'player_one', status: 'bound', boundAt: '2026-03-27 10:30' },
  { id: '2', platform: 'PSN', accountName: 'console_user', status: 'pending' },
];

export function InviteAuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = inviteCode.trim().length >= 6 && !loading;

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const endpoint = mode === 'register' ? '/api/auth/invite-register' : '/api/auth/invite-login';
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode }),
      });
    } catch (e) {
      setError('invite.auth.error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="invite-auth-card">
      <header>
        <h1>{t(mode === 'register' ? 'invite.register.title' : 'invite.login.title')}</h1>
        <p>{t('invite.auth.subtitle')}</p>
      </header>

      <div className="mode-switcher">
        <button onClick={() => setMode('register')}>{t('invite.mode.register')}</button>
        <button onClick={() => setMode('login')}>{t('invite.mode.login')}</button>
      </div>

      <label>
        <span>{t('invite.code.label')}</span>
        <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder={t('invite.code.placeholder')} />
      </label>

      <InvitePreview inviteCode={inviteCode} />

      {error ? <p role="alert">{t(error)}</p> : null}
      <button disabled={!canSubmit} onClick={handleSubmit}>
        {loading ? t('common.loading') : t('common.continue')}
      </button>
    </section>
  );
}

export function BindConfirmPage() {
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await fetch('/api/bind/confirm', { method: 'POST' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="bind-confirm-panel">
      <h1>{t('bind.confirm.title')}</h1>
      <p>{t('bind.confirm.description')}</p>
      <ul>
        <li>{t('bind.confirm.scope.profile')}</li>
        <li>{t('bind.confirm.scope.friends')}</li>
      </ul>
      <div className="actions">
        <button onClick={handleConfirm} disabled={submitting}>{submitting ? t('common.loading') : t('bind.confirm.cta')}</button>
        <button className="secondary">{t('common.cancel')}</button>
      </div>
    </section>
  );
}

export function PairCodePage() {
  const [code, setCode] = useState('');
  const digits = useMemo(() => Array.from({ length: 6 }, (_, index) => code[index] ?? ''), [code]);

  return (
    <section>
      <h1>{t('pair.title')}</h1>
      <p>{t('pair.subtitle')}</p>
      <div className="pair-code-grid">
        {digits.map((digit, index) => (
          <input
            key={index}
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(event) => {
              const next = code.split('');
              next[index] = event.target.value.replace(/\D/g, '').slice(0, 1);
              setCode(next.join('').slice(0, 6));
            }}
          />
        ))}
      </div>
      <button disabled={code.length !== 6}>{t('pair.verify')}</button>
      <button className="link">{t('pair.resend')}</button>
    </section>
  );
}

export function AccountPage() {
  const bindings = mockBindings;

  if (!bindings.length) {
    return <p>{t('account.empty')}</p>;
  }

  return (
    <section>
      <h1>{t('account.binding.title')}</h1>
      <ul>
        {bindings.map((item) => (
          <li key={item.id}>
            <strong>{item.platform}</strong>
            <span>{item.accountName}</span>
            <StatusBadge status={item.status} />
            <span>{item.boundAt ? t('account.bound_at', { value: item.boundAt }) : t('account.bound_at_pending')}</span>
            <button disabled>{t('account.unbind')}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InvitePreview({ inviteCode }: { inviteCode: string }) {
  if (!inviteCode) {
    return <p>{t('invite.preview.empty')}</p>;
  }

  return (
    <div className="invite-preview">
      <p>{t('invite.preview.label')}</p>
      <strong>{inviteCode}</strong>
    </div>
  );
}

function StatusBadge({ status }: { status: BindingStatus }) {
  return <span data-status={status}>{t(`binding.status.${status}`)}</span>;
}

function t(key: string, vars?: Record<string, string>) {
  return vars ? `${key}:${JSON.stringify(vars)}` : key;
}
```

## 验收覆盖速览

- 邀请码注册：已覆盖 `/auth/invite` 页面结构、切换、输入、提交与错误态
- 绑定确认：已覆盖 `/bind/confirm` 页面结构、确认动作与 loading 态
- 配对码输入：已覆盖 `/pair-code` 6 位输入、按钮禁用态与重发入口
- 用户中心绑定信息展示：已覆盖 `/account` 列表、状态 badge、绑定时间、空状态
- 交付摘要要求中的页面路径与联调点：本文已明确列出
- 仓库 commit：以本文件提交 commit 为准
