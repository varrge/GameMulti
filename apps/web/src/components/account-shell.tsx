"use client";

import { CheckCircle2, Gamepad2, LogIn, LogOut, RefreshCw, Ticket, UserPlus } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { api, ApiUser, clearAuth, getAuthToken, getStoredUser, storeAuth } from "@/src/lib/api-client";

function Field(props: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-[0.25em] text-white/50">{props.label}</span>
      <input
        type={props.type || "text"}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        className="mt-2 w-full rounded-sm border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[#f27d26]"
      />
    </label>
  );
}

export function AccountShell() {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [login, setLogin] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setUser(getStoredUser());
    if (getAuthToken()) {
      void refreshMe();
    }
  }, []);

  async function refreshMe() {
    setLoading(true);
    setMessage(null);
    try {
      const result = await api.me();
      setUser(result.user);
      storeAuth({ user: result.user, token: getAuthToken() || "" });
    } catch (error) {
      clearAuth();
      setUser(null);
      setMessage(error instanceof Error ? error.message : "登录状态已失效");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const result = await api.login({ login, password: loginPassword });
      storeAuth(result);
      setUser(result.user);
      setMessage("已登录");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const result = await api.register({ username, email, password: registerPassword, inviteCode });
      storeAuth(result);
      setUser(result.user);
      setMessage("注册完成，已自动登录");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "注册失败");
    } finally {
      setLoading(false);
    }
  }

  async function validateInvite() {
    if (!inviteCode.trim()) return;
    setInviteStatus("校验中");
    try {
      const result = await api.validateInvitation(inviteCode);
      setInviteStatus(result.valid ? `邀请码可用，剩余 ${result.remainingUses ?? "-"} 次` : result.message || result.codeStatus);
    } catch (error) {
      setInviteStatus(error instanceof Error ? error.message : "邀请码校验失败");
    }
  }

  function handleLogout() {
    clearAuth();
    setUser(null);
    setMessage("已退出");
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
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#f27d26]">Account</p>
            <h1 className="mt-3 text-4xl font-black uppercase italic tracking-tight md:text-6xl">账号入口</h1>
          </div>
          <Link
            href="/bindings"
            className="inline-flex items-center justify-center rounded-sm border border-white/15 px-5 py-3 text-sm font-bold uppercase tracking-[0.2em] transition hover:border-[#f27d26] hover:text-[#f27d26]"
          >
            绑定管理
          </Link>
        </div>

        {message && <div className="rounded-sm border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">{message}</div>}

        {user ? (
          <section className="grid gap-6 rounded-sm border border-white/10 bg-white/[0.04] p-6 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-[#00ff99]" />
                <h2 className="text-2xl font-black uppercase italic">{user.username}</h2>
              </div>
              <p className="mt-3 text-sm text-white/55">{user.email}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-white/35">状态：{user.status}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={refreshMe}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-sm border border-white/15 px-4 py-3 text-sm font-bold uppercase tracking-[0.18em] transition hover:border-white/40 disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />
                刷新
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-sm bg-white px-4 py-3 text-sm font-bold uppercase tracking-[0.18em] text-black transition hover:bg-[#f27d26]"
              >
                <LogOut className="h-4 w-4" />
                退出
              </button>
            </div>
          </section>
        ) : (
          <section className="grid gap-6 lg:grid-cols-2">
            <form onSubmit={handleLogin} className="rounded-sm border border-white/10 bg-white/[0.04] p-6">
              <div className="mb-6 flex items-center gap-3">
                <LogIn className="h-5 w-5 text-[#f27d26]" />
                <h2 className="text-2xl font-black uppercase italic">登录</h2>
              </div>
              <div className="space-y-4">
                <Field label="用户名或邮箱" value={login} onChange={setLogin} />
                <Field label="密码" type="password" value={loginPassword} onChange={setLoginPassword} />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="mt-6 w-full rounded-sm bg-[#f27d26] px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-black transition hover:bg-white disabled:opacity-50"
              >
                登录
              </button>
            </form>

            <form onSubmit={handleRegister} className="rounded-sm border border-white/10 bg-white/[0.04] p-6">
              <div className="mb-6 flex items-center gap-3">
                <UserPlus className="h-5 w-5 text-[#00ff99]" />
                <h2 className="text-2xl font-black uppercase italic">邀请码注册</h2>
              </div>
              <div className="space-y-4">
                <Field label="用户名" value={username} onChange={setUsername} />
                <Field label="邮箱" type="email" value={email} onChange={setEmail} />
                <Field label="密码" type="password" value={registerPassword} onChange={setRegisterPassword} />
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <Field label="邀请码" value={inviteCode} onChange={setInviteCode} placeholder="ABCD1234" />
                  <button
                    type="button"
                    onClick={validateInvite}
                    className="mt-6 inline-flex items-center justify-center gap-2 rounded-sm border border-white/15 px-4 py-3 text-sm font-bold uppercase tracking-[0.18em] transition hover:border-[#f27d26]"
                  >
                    <Ticket className="h-4 w-4" />
                    校验
                  </button>
                </div>
                {inviteStatus && <p className="text-sm text-white/55">{inviteStatus}</p>}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="mt-6 w-full rounded-sm bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-black transition hover:bg-[#f27d26] disabled:opacity-50"
              >
                注册并登录
              </button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
