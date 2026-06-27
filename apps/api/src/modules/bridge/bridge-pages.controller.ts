import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { BindingService } from '../binding/binding.service';
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
    if (!user) {
      response.redirect(302, this.loginUrl(token));
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
      response.redirect(302, this.loginUrl(token));
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

  private async loadSession(token: string) {
    try {
      return await this.bindingService.findByToken(token);
    } catch {
      return null;
    }
  }

  private loginUrl(token: string) {
    return `/api/auth/discourse/start?returnTo=${encodeURIComponent(`/bind/confirm?token=${token}`)}`;
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
    return this.page('确认游戏绑定', `
      <section class="panel">
        <p class="eyebrow">GameMulti Bridge</p>
        <h1>确认游戏绑定</h1>
        <dl>
          <div><dt>论坛账号</dt><dd>${this.escape(user.username)}</dd></div>
          <div><dt>游戏</dt><dd>${this.escape(session.game.name)}</dd></div>
          <div><dt>服务器</dt><dd>${this.escape(session.server.serverName)}</dd></div>
          <div><dt>平台</dt><dd>${this.escape(session.platform)}</dd></div>
          <div><dt>游戏账号</dt><dd>${this.escape(session.displayName || session.gameUserId)}</dd></div>
          <div><dt>状态</dt><dd>${this.escape(session.expired ? 'expired' : session.status)}</dd></div>
        </dl>
        <form method="post" action="/bind/confirm">
          <input type="hidden" name="token" value="${this.escape(token)}" />
          <input type="hidden" name="sessionId" value="${this.escape(session.id)}" />
          <button type="submit" ${disabled ? 'disabled' : ''}>确认绑定</button>
        </form>
        ${disabled ? '<p class="message">这个绑定会话已经不可用，请回到游戏内重新发起绑定。</p>' : ''}
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
        <p class="eyebrow">GameMulti Bridge</p>
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
        <p class="eyebrow">GameMulti Bridge</p>
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
  <title>${this.escape(title)} - GameMulti</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #050505; color: #fff; padding: 24px; }
    .panel { width: min(100%, 560px); border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.045); padding: 28px; }
    .eyebrow { margin: 0 0 12px; color: #f27d26; font-size: 12px; font-weight: 800; letter-spacing: .22em; text-transform: uppercase; }
    h1 { margin: 0 0 24px; font-size: clamp(32px, 8vw, 52px); line-height: .95; font-style: italic; text-transform: uppercase; }
    dl { display: grid; gap: 12px; margin: 0 0 24px; }
    dl div { display: grid; grid-template-columns: 110px 1fr; gap: 14px; border-top: 1px solid rgba(255,255,255,.08); padding-top: 12px; }
    dt { color: rgba(255,255,255,.48); font-size: 12px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
    dd { margin: 0; overflow-wrap: anywhere; color: rgba(255,255,255,.86); }
    button { width: 100%; border: 0; background: #f27d26; color: #000; padding: 14px 18px; font-weight: 900; letter-spacing: .16em; text-transform: uppercase; cursor: pointer; }
    button:disabled { cursor: not-allowed; opacity: .45; }
    .message { color: rgba(255,255,255,.68); line-height: 1.7; }
  </style>
</head>
<body>
${body}
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
