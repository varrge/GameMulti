import Link from "next/link";

export default function ForumsPage() {
  return (
    <main className="min-h-screen bg-[#050505] px-6 py-20 text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="space-y-4">
          <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#f27d26]">Forums Entry</p>
          <h1 className="text-4xl font-black uppercase italic tracking-tight md:text-6xl">
            游戏论坛入口已切到 /forums
          </h1>
          <p className="max-w-2xl text-base leading-7 text-white/70 md:text-lg">
            这里是主站统一论坛入口占位页。导航栏论坛按钮、登录成功默认跳转、后续 SSO 串联都会先收敛到这个地址，避免把真实论坛地址散落到多个前端跳转点。
          </p>
        </div>

        <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 md:grid-cols-3">
          <div>
            <div className="text-sm font-bold uppercase tracking-[0.25em] text-white/50">入口地址</div>
            <div className="mt-2 text-2xl font-black">/forums</div>
          </div>
          <div>
            <div className="text-sm font-bold uppercase tracking-[0.25em] text-white/50">当前状态</div>
            <div className="mt-2 text-2xl font-black text-[#00ff99]">Ready</div>
          </div>
          <div>
            <div className="text-sm font-bold uppercase tracking-[0.25em] text-white/50">下一步</div>
            <div className="mt-2 text-2xl font-black">接入真实论坛</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-sm border border-white/20 px-6 py-3 text-sm font-bold uppercase tracking-[0.2em] transition hover:border-[#f27d26] hover:text-[#f27d26]"
          >
            返回主站
          </Link>
          <Link
            href="/forums"
            className="inline-flex items-center justify-center rounded-sm bg-[#f27d26] px-6 py-3 text-sm font-bold uppercase tracking-[0.2em] text-black transition hover:bg-white"
          >
            刷新论坛入口
          </Link>
        </div>
      </div>
    </main>
  );
}
