"use client";

import { Loader2, LogIn } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, getAuthToken } from "@/src/lib/api-client";

export default function DiscourseConnectPage() {
  const [message, setMessage] = useState("正在连接论坛");
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const sso = searchParams.get("sso");
    const sig = searchParams.get("sig");

    if (!sso || !sig) {
      setMessage("缺少论坛登录参数");
      return;
    }

    if (!getAuthToken()) {
      setNeedsLogin(true);
      setMessage("请先登录 GameMulti，再进入论坛");
      return;
    }

    api.authorizeForumSso(sso, sig)
      .then((result) => {
        window.location.href = result.redirectUrl;
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "论坛登录授权失败");
      });
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-white">
      <section className="w-full max-w-md border border-white/10 bg-white/[0.04] p-6">
        <div className="flex items-center gap-3">
          {needsLogin ? (
            <LogIn className="h-5 w-5 text-[#f27d26]" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-[#f27d26]" />
          )}
          <h1 className="text-xl font-black uppercase italic">论坛登录</h1>
        </div>
        <p className="mt-4 text-sm leading-6 text-white/65">{message}</p>
        {needsLogin && (
          <Link
            href="/account"
            className="mt-6 inline-flex items-center justify-center gap-2 bg-[#f27d26] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-black transition hover:bg-white"
          >
            <LogIn className="h-4 w-4" />
            登录
          </Link>
        )}
      </section>
    </main>
  );
}
