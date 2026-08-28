import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { BindingService } from '../binding/binding.service';
import { requiresBindingAuthentication } from './binding-confirm-access';
import { BridgeAuthService, BridgeCurrentUser } from './bridge-auth.service';

@Controller('bind')
export class BridgePagesController {
  constructor(
    private readonly bridgeAuth: BridgeAuthService,
    private readonly bindingService: BindingService,
  ) {}

  @Get('confirm')
  async confirmPage(
    @Req() request: Request,
    @Res() response: Response,
    @Query('token') token?: string,
  ) {
    response.type('html');

    if (!token) {
      response.status(200).send(this.renderMessage('绑定链接无效', '缺少绑定 token。'));
      return;
    }

    const session = await this.loadSession(token);
    if (!session) {
      response.status(200).send(this.renderMessage('绑定链接无效', '绑定会话不存在，可能已经过期或被清理。'));
      return;
    }

    const user = await this.bridgeAuth.currentUser(request);
    if (!user || requiresBindingAuthentication({
      hasCurrentUser: true,
      nextAction: session.nextAction,
    })) {
      response.redirect(302, this.loginUrl(`/bind/confirm?token=${token}`));
      return;
    }

    response.status(200).send(this.renderConfirm(token, session, user));
  }

  @Post('confirm')
  async submitConfirm(
    @Req() request: Request,
    @Res() response: Response,
    @Body('token') token?: string,
    @Body('sessionId') sessionId?: string,
  ) {
    response.type('html');

    if (!token || !sessionId) {
      response.status(400).send(this.renderMessage('绑定失败', '提交参数不完整。'));
      return;
    }

    const user = await this.bridgeAuth.currentUser(request);
    if (!user) {
      response.redirect(302, this.loginUrl(`/bind/confirm?token=${token}`));
      return;
    }

    const session = await this.loadSession(token);
    if (!session || session.id !== sessionId) {
      response.status(400).send(this.renderMessage('绑定失败', '绑定会话不匹配。'));
      return;
    }

    try {
      const binding = await this.bindingService.confirmBindingForDiscourseUser(user, sessionId);
      response.status(200).send(this.renderSuccess(binding, user));
    } catch (error) {
      response.status(400).send(this.renderMessage('绑定失败', error instanceof Error ? error.message : '绑定确认失败。'));
    }
  }

  @Get('account')
  async accountPage(@Req() request: Request, @Res() response: Response) {
    response.type('html');

    const user = await this.bridgeAuth.currentUser(request);
    if (!user) {
      response.redirect(302, this.loginUrl('/bind/account'));
      return;
    }

    const bindings = await this.bindingService.listDiscourseUserBindings(user.discourseUserId);
    response.status(200).send(this.renderAccount(user, bindings));
  }

  private async loadSession(token: string) {
    try {
      return await this.bindingService.findByToken(token);
    } catch {
      return null;
    }
  }

  private loginUrl(returnTo: string) {
    return `/api/auth/discourse/start?returnTo=${encodeURIComponent(returnTo)}`;
  }

  private statusLabel(status: string, expired?: boolean): string {
    if (expired) return '已过期';
    const s = String(status || '').toLowerCase();
    const map: Record<string, string> = {
      pending: '待确认',
      bound: '已绑定',
      expired: '已过期',
      cancelled: '已取消',
      conflict: '存在冲突',
      revoked: '已撤销',
      denied: '已拒绝',
      unavailable: '不可用',
      active: '已绑定',
      unbinding: '解绑中',
      unbound: '已解绑',
      blocked: '已停用',
    };
    return map[s] || '未知状态';
  }

  private renderAccount(
    user: BridgeCurrentUser,
    bindings: Array<{
      bindStatus: string;
      verifiedAt: Date | null;
      gameAccount: {
        gameUserId: string;
        displayName: string | null;
        platform: string;
        game: { name: string };
      };
      server: { serverName: string } | null;
    }>,
  ) {
    const items = bindings.length
      ? bindings.map((binding) => `
        <div class="item">
          <strong>${this.escape(binding.gameAccount.displayName || binding.gameAccount.gameUserId)}</strong>
          <span>${this.escape(binding.gameAccount.game.name)} · ${this.escape(binding.server?.serverName || '-')}</span>
          <span>平台：${this.escape(binding.gameAccount.platform)} · 状态：${this.escape(this.statusLabel(binding.bindStatus))}</span>
        </div>
      `).join('')
      : '<p class="message">当前论坛账号还没有绑定游戏账号。</p>';

    return this.page('我的游戏绑定', `
      <section class="panel">
        <h1>我的游戏绑定</h1>
        <p class="message">当前论坛账号：<strong>${this.escape(user.username)}</strong></p>
        <div class="list">${items}</div>
      </section>
    `);
  }

  private renderConfirm(
    token: string,
    session: {
      id: string;
      game: { name: string };
      server: { serverName: string };
      platform: string;
      gameUserId: string;
      displayName: string | null;
      status: string;
      expired: boolean;
    },
    user: BridgeCurrentUser,
  ) {
    const disabled = session.status !== 'pending' || session.expired;
    const statusText = this.statusLabel(session.status, session.expired);
    return this.page('确认游戏绑定', `
      <section class="panel">
        <h1>确认游戏绑定</h1>
        <div class="steps">
          <div><strong>1. 游戏发起</strong>获取绑定链接</div>
          <div><strong>2. 核对信息</strong>确认角色服务器</div>
          <div><strong>3. 确认授权</strong>完成社区关联</div>
        </div>
        <div class="notice">
          <strong>安全提示：</strong>请仅确认由您本人在对应游戏服务器中发起的绑定。
        </div>
        <dl>
          <div><dt>论坛账号</dt><dd>${this.escape(user.username)}</dd></div>
          <div><dt>游戏</dt><dd>${this.escape(session.game.name)}</dd></div>
          <div><dt>服务器</dt><dd>${this.escape(session.server.serverName)}</dd></div>
          <div><dt>平台</dt><dd>${this.escape(session.platform)}</dd></div>
          <div><dt>游戏账号</dt><dd>${this.escape(session.displayName || session.gameUserId)}</dd></div>
          <div><dt>状态</dt><dd>${this.escape(statusText)}</dd></div>
        </dl>
        <form method="post" action="/bind/confirm">
          <input type="hidden" name="token" value="${this.escape(token)}" />
          <input type="hidden" name="sessionId" value="${this.escape(session.id)}" />
          <button type="submit" ${disabled ? 'disabled' : ''}>确认绑定</button>
        </form>
        ${disabled ? '<p class="message" style="margin-top:14px;color:#FCA5A5;">这个绑定会话已经不可用，请回到游戏内重新发起绑定。</p>' : ''}
      </section>
    `);
  }

  private renderSuccess(
    binding: {
      gameAccount: {
        gameUserId: string;
        displayName: string | null;
        platform: string;
        game: { name: string };
      };
      server: { serverName: string } | null;
    },
    user: BridgeCurrentUser,
  ) {
    return this.page('绑定完成', `
      <section class="panel">
        <h1>绑定完成</h1>
        <p class="message">${this.escape(user.username)} 已绑定 ${this.escape(binding.gameAccount.displayName || binding.gameAccount.gameUserId)}。</p>
        <dl>
          <div><dt>游戏</dt><dd>${this.escape(binding.gameAccount.game.name)}</dd></div>
          <div><dt>服务器</dt><dd>${this.escape(binding.server?.serverName || '-')}</dd></div>
          <div><dt>平台</dt><dd>${this.escape(binding.gameAccount.platform)}</dd></div>
        </dl>
      </section>
    `);
  }

  private renderMessage(title: string, message: string) {
    return this.page(title, `
      <section class="panel">
        <h1>${this.escape(title)}</h1>
        <p class="message">${this.escape(message)}</p>
      </section>
    `);
  }

  private page(title: string, body: string) {
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${this.escape(title)} - GameMulti 游戏联机社区</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0F172A; color: #F8FAFC; padding: 24px; }
    .shell { width: min(100%, 540px); }
    .panel { border: 1px solid #334155; background: #1E293B; border-radius: 12px; padding: 28px; box-shadow: 0 10px 25px -5px rgba(0,0,0,.4); }
    .brand { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; }
    .brand-name { font-size: 16px; font-weight: 700; color: #F8FAFC; letter-spacing: -0.02em; }
    .brand-tag { font-size: 11px; font-weight: 600; color: #22D3EE; background: rgba(55,48,163,.4); border: 1px solid rgba(34,211,238,.3); padding: 2px 6px; border-radius: 4px; }
    h1 { margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #F8FAFC; }
    .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 0 0 18px; padding: 10px; background: #0F172A; border: 1px solid #334155; border-radius: 8px; font-size: 11px; color: #CBD5E1; }
    .steps div { line-height: 1.4; }
    .steps strong { display: block; color: #22D3EE; margin-bottom: 2px; }
    .notice { margin: 0 0 18px; padding: 10px 12px; background: rgba(55,48,163,.2); border-left: 3px solid #22D3EE; border-radius: 4px; font-size: 12px; color: #CBD5E1; line-height: 1.5; }
    .notice strong { color: #F8FAFC; }
    dl { display: grid; gap: 10px; margin: 0 0 20px; }
    dl div { display: grid; grid-template-columns: 90px 1fr; gap: 12px; border-top: 1px solid #334155; padding-top: 10px; font-size: 13px; }
    dt { color: #94A3B8; font-weight: 600; }
    dd { margin: 0; overflow-wrap: anywhere; color: #F8FAFC; font-weight: 500; }
    button { width: 100%; border: 0; border-radius: 8px; background: #3730A3; color: #F8FAFC; padding: 12px 18px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background .15s ease; }
    button:hover:not(:disabled) { background: #4338CA; }
    button:focus-visible { outline: 2px solid #22D3EE; outline-offset: 2px; }
    button:disabled { cursor: not-allowed; opacity: .45; }
    .message { color: #CBD5E1; line-height: 1.6; font-size: 14px; margin: 0 0 16px; }
    .list { display: grid; gap: 10px; margin-top: 16px; }
    .item { display: grid; gap: 4px; border: 1px solid #334155; background: #0F172A; border-radius: 8px; padding: 12px 14px; }
    .item strong { font-size: 15px; color: #F8FAFC; }
    .item span { font-size: 12px; color: #CBD5E1; overflow-wrap: anywhere; }
  </style>
</head>
<body>
<div class="shell">
  <div class="brand">
    <svg width="24" height="24" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;flex-shrink:0;" aria-hidden="true" focusable="false">
      <rect x="64" y="64" width="896" height="896" rx="224" fill="#3730A3"/>
      <path d="M478 300C438 260 388 240 330 240C196 240 126 352 126 512C126 672 210 784 350 784C410 784 462 764 508 724V542H360" stroke="#F8FAFC" stroke-width="96" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M562 748V300L702 520L842 300V748" stroke="#F8FAFC" stroke-width="96" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M508 542H562" stroke="#22D3EE" stroke-width="64" stroke-linecap="round"/>
      <circle cx="562" cy="542" r="36" fill="#22D3EE"/>
    </svg>
    <span class="brand-name">GameMulti</span>
    <span class="brand-tag">游戏联机社区</span>
  </div>
  ${body}
</div>
</body>
</html>`;
  }

  private escape(value: string) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
