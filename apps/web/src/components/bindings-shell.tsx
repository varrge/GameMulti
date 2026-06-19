"use client";

import { CheckCircle2, Gamepad2, Link2, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { api, BindingSession, GameBinding, getAuthToken } from "@/src/lib/api-client";

function BindingSessionPanel(props: {
  session: BindingSession | null;
  onConfirm: () => Promise<void>;
  loading: boolean;
}) {
  if (!props.session) return null;

  const disabled = props.loading || props.session.status !== "pending" || props.session.expired;

  return (
    <section className="rounded-sm border border-[#f27d26]/25 bg-[#f27d26]/10 p-6">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#f27d26]">待确认绑定</p>
          <h2 className="mt-3 text-3xl font-black uppercase italic">{props.session.displayName || props.session.gameUserId}</h2>
          <div className="mt-4 grid gap-2 text-sm text-white/65 sm:grid-cols-2">
            <p>游戏：{props.session.game.name}</p>
            <p>服务器：{props.session.server.serverName}</p>
            <p>平台：{props.session.platform}</p>
            <p>状态：{props.session.expired ? "expired" : props.session.status}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={props.onConfirm}
          disabled={disabled}
          className="inline-flex items-center justify-center gap-2 rounded-sm bg-[#f27d26] px-6 py-4 text-sm font-black uppercase tracking-[0.2em] text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCircle2 className="h-5 w-5" />
          确认绑定
        </button>
      </div>
    </section>
  );
}

export function BindingsShell(props: { initialToken?: string }) {
  const [pairCode, setPairCode] = useState("");
  const [session, setSession] = useState<BindingSession | null>(null);
  const [bindings, setBindings] = useState<GameBinding[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoggedIn(Boolean(getAuthToken()));
    if (props.initialToken) {
      void loadByToken(props.initialToken);
    }
    if (getAuthToken()) {
      void refreshBindings();
    }
  }, [props.initialToken]);

  async function loadByToken(token: string) {
    setLoading(true);
    setMessage(null);
    try {
      setSession(await api.findBindingByToken(token));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "绑定会话不存在");
    } finally {
      setLoading(false);
    }
  }

  async function handlePairCode(event: FormEvent) {
    event.preventDefault();
    if (!pairCode.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      setSession(await api.findBindingByPairCode(pairCode));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "配对码无效");
    } finally {
      setLoading(false);
    }
  }

  async function confirmBinding() {
    if (!session) return;
    if (!getAuthToken()) {
      setMessage("请先登录账号再确认绑定");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      await api.confirmBinding(session.id);
      setMessage("绑定完成");
      setSession(null);
      await refreshBindings();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "绑定失败");
    } finally {
      setLoading(false);
    }
  }

  async function refreshBindings() {
    if (!getAuthToken()) return;
    setLoading(true);
    try {
      setBindings(await api.listGameBindings());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取绑定列表失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050505] px-6 py-20 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.25em] text-white/50 hover:text-[#f27d26]">
              <Gamepad2 className="h-4 w-4" />
              Nexus
            </Link>
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#f27d26]">Bindings</p>
            <h1 className="mt-3 text-4xl font-black uppercase italic tracking-tight md:text-6xl">游戏账号绑定</h1>
          </div>
          <Link
            href="/account"
            className="inline-flex items-center justify-center rounded-sm border border-white/15 px-5 py-3 text-sm font-bold uppercase tracking-[0.2em] transition hover:border-[#f27d26] hover:text-[#f27d26]"
          >
            账号入口
          </Link>
        </div>

        {!loggedIn && (
          <div className="rounded-sm border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/70">
            当前浏览器未登录。可以先查询绑定会话，但确认绑定需要登录。
          </div>
        )}
        {message && <div className="rounded-sm border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">{message}</div>}

        <form onSubmit={handlePairCode} className="grid gap-3 rounded-sm border border-white/10 bg-white/[0.04] p-6 sm:grid-cols-[1fr_auto]">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-white/50">游戏内配对码</span>
            <input
              value={pairCode}
              onChange={(event) => setPairCode(event.target.value)}
              placeholder="000000"
              inputMode="numeric"
              className="mt-2 w-full rounded-sm border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[#f27d26]"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-sm bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-black transition hover:bg-[#f27d26] disabled:opacity-50"
          >
            <Search className="h-4 w-4" />
            查询
          </button>
        </form>

        <BindingSessionPanel session={session} onConfirm={confirmBinding} loading={loading} />

        <section className="rounded-sm border border-white/10 bg-white/[0.04] p-6">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Link2 className="h-5 w-5 text-[#00ff99]" />
              <h2 className="text-2xl font-black uppercase italic">已绑定账号</h2>
            </div>
            <button
              type="button"
              onClick={refreshBindings}
              disabled={loading || !getAuthToken()}
              className="inline-flex items-center justify-center gap-2 rounded-sm border border-white/15 px-4 py-3 text-sm font-bold uppercase tracking-[0.18em] transition hover:border-white/40 disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              刷新
            </button>
          </div>

          {bindings.length === 0 ? (
            <p className="text-sm text-white/50">暂无绑定记录。</p>
          ) : (
            <div className="grid gap-3">
              {bindings.map((binding) => (
                <div key={binding.id} className="grid gap-3 rounded-sm border border-white/10 bg-black/25 p-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <div className="text-lg font-black uppercase italic">
                      {binding.gameAccount.displayName || binding.gameAccount.gameUserId}
                    </div>
                    <div className="mt-2 text-sm text-white/55">
                      {binding.gameAccount.game.name} · {binding.server.serverName} · {binding.gameAccount.platform}
                    </div>
                  </div>
                  <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#00ff99]">{binding.bindStatus}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
