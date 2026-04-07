import Link from "next/link";
import { getForumEntryPath, getForumEntryUrl, getForumOrigin } from "@/src/lib/forum-entry";

export default function ForumsPage() {
  const forumUrl = getForumEntryUrl();
  const forumOrigin = getForumOrigin();
  const forumPath = getForumEntryPath();

  return (
    <main className="min-h-screen bg-[#050505] px-6 py-20 text-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <div className="space-y-4">
          <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#f27d26]">Forum Redirect</p>
          <h1 className="text-4xl font-black uppercase italic tracking-tight md:text-6xl">
            论坛入口已切到真实站点
          </h1>
          <p className="max-w-2xl text-base leading-7 text-white/70 md:text-lg">
            主站内的论坛入口现在统一指向真实论坛地址，不再把 /forums 当成最终落地页。
            如果你是通过历史链接进入这个页面，直接从下面按钮跳转就行。
          </p>
        </div>

        <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 md:grid-cols-3">
          <div>
            <div className="text-sm font-bold uppercase tracking-[0.25em] text-white/50">论坛域名</div>
            <div className="mt-2 break-all text-xl font-black">{forumOrigin}</div>
          </div>
          <div>
            <div className="text-sm font-bold uppercase tracking-[0.25em] text-white/50">入口路径</div>
            <div className="mt-2 text-xl font-black">{forumPath}</div>
          </div>
          <div>
            <div className="text-sm font-bold uppercase tracking-[0.25em] text-white/50">当前策略</div>
            <div className="mt-2 text-xl font-black text-[#00ff99]">直接跳转真实论坛</div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#f27d26]/30 bg-[#f27d26]/10 p-6 text-sm leading-7 text-white/80">
          <p>
            若部署环境已配置 <code className="rounded bg-black/30 px-2 py-1">NEXT_PUBLIC_FORUM_ORIGIN</code>，导航栏论坛入口、登录后默认跳转和这个兼容页会全部跟随该地址。
          </p>
          <p className="mt-3">
            当前论坛目标：<span className="font-bold text-white">{forumUrl}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-4">
          <Link
            href={forumUrl}
            className="inline-flex items-center justify-center rounded-sm bg-[#f27d26] px-6 py-3 text-sm font-bold uppercase tracking-[0.2em] text-black transition hover:bg-white"
          >
            打开真实论坛
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-sm border border-white/20 px-6 py-3 text-sm font-bold uppercase tracking-[0.2em] transition hover:border-[#f27d26] hover:text-[#f27d26]"
          >
            返回主站
          </Link>
        </div>
      </div>
    </main>
  );
}
