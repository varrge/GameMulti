"use client";

import { ExternalLink, Gamepad2, LogIn, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ForumAccountStatus, getAuthToken } from "@/src/lib/api-client";

export function ForumsShell() {
  const [status, setStatus] = useState<ForumAccountStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const loggedIn = Boolean(getAuthToken());

  useEffect(() => {
    if (getAuthToken()) {
      void refresh();
    }
  }, []);

  async function refresh() {
    setLoading(true);
    setMessage(null);
    try {
      setStatus(await api.getForumEntry());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "论坛入口状态读取失败");
    } finally {
      setLoading(false);
    }
  }

  async function enterForum() {
    if (!getAuthToken()) {
      setMessage("请先登录账号再进入论坛");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const result = await api.startForumSso("/");
      window.location.href = result.forumSsoUrl;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "论坛 SSO 地址生成失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050505] px-6 py-20 text-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <div>
          <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.25em] text-white/50 hover:text-[#f27d26]">
            <Gamepad2 className="h-4 w-4" />
            Nexus
          </Link>
          <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#f27d26]">Forum Entry</p>
          <h1 className="mt-3 text-4xl font-black uppercase italic tracking-tight md:text-6xl">论坛入口</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/65">
            论坛入口现在由 GameMulti 生成 SSO 请求。登录后进入论坛会自动创建或同步论坛账号映射。
          </p>
        </div>

        {message && <div className="rounded-sm border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">{message}</div>}

        <section className="grid gap-6 rounded-sm border border-white/10 bg-white/[0.04] p-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-[#f27d26]" />
              <h2 className="text-2xl font-black uppercase italic">
                {loggedIn ? "已登录主站" : "需要登录主站"}
              </h2>
            </div>
            <p className="mt-3 text-sm text-white/55">
              {status?.account
                ? `${status.account.forumUsername} · ${status.account.syncStatus}`
                : loggedIn
                  ? "点击进入论坛会生成 SSO ticket。"
                  : "请先登录或注册 GameMulti 账号。"}
            </p>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-white/35">
              {status?.forumOrigin || "forum pending"}
            </p>
          </div>

          {loggedIn ? (
            <button
              type="button"
              onClick={enterForum}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-sm bg-[#f27d26] px-6 py-4 text-sm font-black uppercase tracking-[0.2em] text-black transition hover:bg-white disabled:opacity-50"
            >
              <ExternalLink className="h-5 w-5" />
              进入论坛
            </button>
          ) : (
            <Link
              href="/account"
              className="inline-flex items-center justify-center gap-2 rounded-sm bg-white px-6 py-4 text-sm font-black uppercase tracking-[0.2em] text-black transition hover:bg-[#f27d26]"
            >
              <LogIn className="h-5 w-5" />
              登录
            </Link>
          )}
        </section>
      </div>
    </main>
  );
}
