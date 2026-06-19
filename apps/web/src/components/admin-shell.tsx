"use client";

import { Activity, Database, Gamepad2, KeyRound, MessageSquare, RefreshCw, Search, Server, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AdminGameServer,
  AdminForumSummary,
  AdminPluginEvent,
  api,
  clearAdminKey,
  getStoredAdminKey,
  storeAdminKey,
} from "@/src/lib/api-client";

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function Stat(props: { label: string; value: string | number }) {
  return (
    <div className="border border-white/10 bg-black/20 p-4">
      <div className="text-2xl font-black italic">{props.value}</div>
      <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/40">{props.label}</div>
    </div>
  );
}

export function AdminShell() {
  const [adminKey, setAdminKey] = useState("");
  const [servers, setServers] = useState<AdminGameServer[]>([]);
  const [events, setEvents] = useState<AdminPluginEvent[]>([]);
  const [forumSummary, setForumSummary] = useState<AdminForumSummary | null>(null);
  const [serverCode, setServerCode] = useState("");
  const [eventType, setEventType] = useState("");
  const [player, setPlayer] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const totals = useMemo(() => ({
    servers: servers.length,
    online: servers.filter((server) => server.latestHeartbeat?.healthy).length,
    events: servers.reduce((sum, server) => sum + server.counts.pluginEvents, 0),
    bindings: servers.reduce((sum, server) => sum + server.counts.userBindings, 0),
  }), [servers]);

  useEffect(() => {
    const stored = getStoredAdminKey();
    setAdminKey(stored);
    if (stored) {
      void refresh(stored);
    }
  }, []);

  async function refresh(key = adminKey) {
    if (!key.trim()) {
      setMessage("请输入 Admin API Key");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      storeAdminKey(key);
      const [serverResult, eventResult, forumResult] = await Promise.all([
        api.adminListGameServers(key),
        api.adminListPluginEvents(key, { serverCode, eventType, player }),
        api.adminForumSummary(key),
      ]);
      setServers(serverResult);
      setEvents(eventResult);
      setForumSummary(forumResult);
      setMessage("已刷新");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取管理数据失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleFilter(event: FormEvent) {
    event.preventDefault();
    await refresh();
  }

  function forgetKey() {
    clearAdminKey();
    setAdminKey("");
    setServers([]);
    setEvents([]);
    setForumSummary(null);
    setMessage("已清除 Admin Key");
  }

  return (
    <main className="min-h-screen bg-[#050505] px-6 py-20 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.25em] text-white/50 hover:text-[#f27d26]">
              <Gamepad2 className="h-4 w-4" />
              Nexus
            </Link>
            <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#f27d26]">Admin</p>
            <h1 className="mt-3 text-4xl font-black uppercase italic tracking-tight md:text-6xl">运维后台</h1>
          </div>
          <Link
            href="/bindings"
            className="inline-flex items-center justify-center rounded-sm border border-white/15 px-5 py-3 text-sm font-bold uppercase tracking-[0.2em] transition hover:border-[#f27d26] hover:text-[#f27d26]"
          >
            绑定管理
          </Link>
        </div>

        <section className="grid gap-3 rounded-sm border border-white/10 bg-white/[0.04] p-6 md:grid-cols-[1fr_auto_auto] md:items-end">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-white/50">Admin API Key</span>
            <input
              type="password"
              value={adminKey}
              onChange={(event) => setAdminKey(event.target.value)}
              placeholder="local-dev-admin-key"
              className="mt-2 w-full rounded-sm border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[#f27d26]"
            />
          </label>
          <button
            type="button"
            onClick={() => refresh()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-sm bg-[#f27d26] px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-black transition hover:bg-white disabled:opacity-50"
          >
            <KeyRound className="h-4 w-4" />
            连接
          </button>
          <button
            type="button"
            onClick={forgetKey}
            className="inline-flex items-center justify-center rounded-sm border border-white/15 px-5 py-3 text-sm font-bold uppercase tracking-[0.2em] transition hover:border-white/40"
          >
            清除
          </button>
        </section>

        {message && <div className="rounded-sm border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">{message}</div>}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="服务器" value={totals.servers} />
          <Stat label="健康心跳" value={totals.online} />
          <Stat label="事件总数" value={totals.events} />
          <Stat label="绑定数" value={totals.bindings} />
        </section>

        <section className="rounded-sm border border-white/10 bg-white/[0.04] p-6">
          <div className="mb-6 flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-[#f27d26]" />
            <h2 className="text-2xl font-black uppercase italic">论坛联通</h2>
          </div>

          {!forumSummary ? (
            <p className="text-sm text-white/50">暂无论坛联通数据。</p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[280px_1fr_1fr]">
              <div className="grid gap-3">
                <Stat label="论坛账号" value={forumSummary.counts.accounts} />
                <Stat label="已激活" value={forumSummary.counts.activeAccounts} />
                <Stat label="同步失败" value={forumSummary.counts.failedAccounts} />
              </div>

              <div>
                <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.22em] text-white/45">最近账号</h3>
                <div className="grid gap-2">
                  {forumSummary.recentAccounts.length === 0 ? (
                    <p className="text-sm text-white/45">暂无论坛账号。</p>
                  ) : forumSummary.recentAccounts.map((account) => (
                    <div key={account.id} className="border border-white/10 bg-black/20 p-3 text-sm">
                      <div className="font-bold text-white">{account.forumUsername}</div>
                      <div className="mt-1 text-white/45">{account.user.username} · {account.syncStatus}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.22em] text-white/45">最近 SSO</h3>
                <div className="grid gap-2">
                  {forumSummary.recentTickets.length === 0 ? (
                    <p className="text-sm text-white/45">暂无 SSO ticket。</p>
                  ) : forumSummary.recentTickets.map((ticket) => (
                    <div key={ticket.id} className="border border-white/10 bg-black/20 p-3 text-sm">
                      <div className="font-bold text-white">{ticket.status}</div>
                      <div className="mt-1 text-white/45">{ticket.user.username} · {formatDate(ticket.createdAt)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-sm border border-white/10 bg-white/[0.04] p-6">
          <div className="mb-6 flex items-center gap-3">
            <Server className="h-5 w-5 text-[#00ff99]" />
            <h2 className="text-2xl font-black uppercase italic">服务器</h2>
          </div>

          {servers.length === 0 ? (
            <p className="text-sm text-white/50">暂无服务器数据。</p>
          ) : (
            <div className="grid gap-3">
              {servers.map((server) => (
                <div key={server.id} className="grid gap-4 border border-white/10 bg-black/25 p-4 lg:grid-cols-[1fr_220px_220px] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-xl font-black uppercase italic">{server.serverName}</h3>
                      <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">{server.serverCode}</span>
                    </div>
                    <p className="mt-2 text-sm text-white/55">
                      {server.game.name} · {server.status} · {server.region || "default"}
                    </p>
                    <p className="mt-2 text-xs text-white/35">
                      Client: {server.pluginClients.map((client) => `${client.clientKey}/${client.status}`).join(", ") || "-"}
                    </p>
                  </div>
                  <div className="text-sm text-white/60">
                    <div className="flex items-center gap-2 font-bold text-white">
                      <ShieldCheck className={`h-4 w-4 ${server.latestHeartbeat?.healthy ? "text-[#00ff99]" : "text-white/35"}`} />
                      {server.latestHeartbeat?.healthy ? "healthy" : "unknown"}
                    </div>
                    <div className="mt-2">最后心跳：{formatDate(server.latestHeartbeat?.sentAt)}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-white/60">
                    <div>在线：{server.latestHeartbeat?.onlineCount ?? "-"}</div>
                    <div>队列：{server.latestHeartbeat?.queueDepth ?? "-"}</div>
                    <div>事件：{server.counts.pluginEvents}</div>
                    <div>绑定：{server.counts.userBindings}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-sm border border-white/10 bg-white/[0.04] p-6">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-center gap-3">
              <Activity className="h-5 w-5 text-[#f27d26]" />
              <h2 className="text-2xl font-black uppercase italic">插件事件</h2>
            </div>
            <form onSubmit={handleFilter} className="grid gap-3 sm:grid-cols-4">
              <input
                value={serverCode}
                onChange={(event) => setServerCode(event.target.value)}
                placeholder="serverCode"
                className="rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#f27d26]"
              />
              <input
                value={eventType}
                onChange={(event) => setEventType(event.target.value)}
                placeholder="eventType"
                className="rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#f27d26]"
              />
              <input
                value={player}
                onChange={(event) => setPlayer(event.target.value)}
                placeholder="player"
                className="rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#f27d26]"
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-sm border border-white/15 px-4 py-2 text-sm font-bold uppercase tracking-[0.18em] transition hover:border-[#f27d26] disabled:opacity-50"
              >
                <Search className="h-4 w-4" />
                筛选
              </button>
            </form>
          </div>

          {events.length === 0 ? (
            <p className="text-sm text-white/50">暂无事件数据。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                <thead className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">
                  <tr className="border-b border-white/10">
                    <th className="py-3 pr-4">时间</th>
                    <th className="py-3 pr-4">事件</th>
                    <th className="py-3 pr-4">玩家</th>
                    <th className="py-3 pr-4">服务器</th>
                    <th className="py-3 pr-4">Client</th>
                    <th className="py-3 pr-4">Meta</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-b border-white/5 text-white/70">
                      <td className="py-3 pr-4 whitespace-nowrap">{formatDate(event.occurredAt)}</td>
                      <td className="py-3 pr-4 font-bold text-white">{event.eventType}</td>
                      <td className="py-3 pr-4">
                        <div>{event.displayName || "-"}</div>
                        <div className="text-xs text-white/35">{event.playerUuid}</div>
                      </td>
                      <td className="py-3 pr-4">{event.server.serverCode}</td>
                      <td className="py-3 pr-4">{event.pluginClient.clientKey}</td>
                      <td className="max-w-[240px] truncate py-3 pr-4 font-mono text-xs text-white/45">
                        {event.metadata ? JSON.stringify(event.metadata) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex items-center gap-2 text-xs text-white/35">
          <Database className="h-4 w-4" />
          数据最多显示最近 100 台服务器和 200 条事件。
          <button type="button" onClick={() => refresh()} disabled={loading} className="ml-auto inline-flex items-center gap-2 text-white/60 hover:text-[#f27d26] disabled:opacity-50">
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
        </div>
      </div>
    </main>
  );
}
