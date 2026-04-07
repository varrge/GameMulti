"use client";

import { motion, AnimatePresence, useScroll } from "motion/react";
import { 
  Gamepad2, 
  Users, 
  Zap, 
  Shield, 
  Globe, 
  MessageSquare, 
  Trophy, 
  ChevronRight,
  Menu,
  X,
  Play
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { cn } from "@/src/lib/utils";
import { getDefaultPostLoginRedirect, getForumEntryUrl, getNavbarForumHref } from "@/src/lib/forum-entry";

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const forumHref = getNavbarForumHref();
  const loginRedirect = getDefaultPostLoginRedirect();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav className={cn(
      "fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-6 py-4",
      isScrolled ? "bg-black/80 backdrop-blur-md border-b border-white/10" : "bg-transparent"
    )}>
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-[#f27d26] rounded-lg flex items-center justify-center neon-glow">
            <Gamepad2 className="text-black w-6 h-6" />
          </div>
          <span className="text-2xl font-bold tracking-tighter uppercase italic">Nexus</span>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm font-medium uppercase tracking-widest text-white/70">
          <Link href="/" className="hover:text-[#f27d26] transition-colors">主页</Link>
          <Link href={forumHref} className="hover:text-[#f27d26] transition-colors">论坛</Link>
        </div>

        <div className="hidden md:flex items-center gap-4">
          <Link href={loginRedirect} className="px-4 py-2 text-sm font-bold uppercase tracking-widest hover:text-[#f27d26] transition-colors">登录</Link>
          <Link href={forumHref} className="px-6 py-2 bg-white text-black text-sm font-bold uppercase tracking-widest hover:bg-[#f27d26] hover:text-white transition-all rounded-sm">立即加入</Link>
        </div>

        <button className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="absolute top-full left-0 right-0 bg-black border-b border-white/10 p-6 flex flex-col gap-4 md:hidden animate-in fade-in slide-in-from-top-4">
          <Link href="/" className="text-lg font-bold uppercase tracking-widest">主页</Link>
          <Link href={forumHref} className="text-lg font-bold uppercase tracking-widest">论坛</Link>
          <hr className="border-white/10" />
          <Link href={loginRedirect} className="w-full py-3 text-white font-bold uppercase tracking-widest text-left">登录</Link>
          <Link href={forumHref} className="w-full py-3 bg-white text-black font-bold uppercase tracking-widest">立即加入</Link>
        </div>
      )}
    </nav>
  );
};

const Hero = () => {
  const forumHref = getForumEntryUrl();

  return (
    <section className="relative min-h-screen flex items-center justify-center pt-20 overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#f27d26]/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#00ff00]/10 rounded-full blur-[120px] animate-pulse delay-1000" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
      </div>

      <div className="max-w-7xl mx-auto px-6 relative z-10 grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="relative z-20 pr-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full mb-6">
            <span className="w-2 h-2 bg-[#00ff00] rounded-full animate-ping" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">在线: 120万 玩家在线</span>
          </div>
          
          <h1 className="text-6xl md:text-8xl font-black uppercase italic leading-[0.9] tracking-tighter mb-6">
            下一代 <br />
            <span className="text-[#f27d26] drop-shadow-[0_0_15px_rgba(242,125,38,0.5)]">游戏论坛</span>
          </h1>
          
          <p className="text-lg text-white/60 max-w-xl mb-8 leading-relaxed">
            连接、竞争、协作。Nexus 是多游戏社区在高性能生态系统中蓬勃发展的终极论坛。
          </p>

          <div className="flex flex-wrap gap-4">
            <Link href={forumHref} className="group relative px-8 py-4 bg-[#f27d26] text-black font-black uppercase tracking-widest overflow-hidden transition-all hover:scale-105 active:scale-95">
              <span className="relative z-10 flex items-center gap-2">
                开始体验 <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
              <div className="absolute inset-0 bg-white translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            </Link>
            
            <button className="px-8 py-4 border border-white/20 hover:border-white/50 transition-colors font-black uppercase tracking-widest flex items-center gap-2">
              <Play className="w-5 h-5 fill-white" /> 观看预告
            </button>
          </div>

          <div className="mt-12 grid grid-cols-3 gap-8 border-t border-white/10 pt-8">
            <div>
              <div className="text-2xl font-black italic tracking-tighter">500+</div>
              <div className="text-[10px] uppercase tracking-widest text-white/40">支持的游戏</div>
            </div>
            <div>
              <div className="text-2xl font-black italic tracking-tighter">1200万+</div>
              <div className="text-[10px] uppercase tracking-widest text-white/40">活跃用户</div>
            </div>
            <div>
              <div className="text-2xl font-black italic tracking-tighter">24/7</div>
              <div className="text-[10px] uppercase tracking-widest text-white/40">全球运行时间</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.8, rotate: 5 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="relative hidden lg:block w-full max-w-[440px] ml-auto"
        >
          <div className="relative z-10 glass p-3 rounded-2xl border-white/20 shadow-2xl">
            <img 
              src="https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=800&h=600" 
              alt="Gaming Forum Community" 
              className="rounded-xl grayscale hover:grayscale-0 transition-all duration-700 w-full h-auto"
              referrerPolicy="no-referrer"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
};

const Features = () => {
  const features = [
    {
      icon: <Zap className="w-8 h-8 text-[#f27d26]" />,
      title: "深度讨论",
      description: "针对各种游戏的高质量技术讨论与攻略分享，沉淀有价值的内容。"
    },
    {
      icon: <Shield className="w-8 h-8 text-[#00ff00]" />,
      title: "社区治理",
      description: "玩家驱动的版块管理与声望系统，构建公平、友善的讨论环境。"
    },
    {
      icon: <Globe className="w-8 h-8 text-blue-400" />,
      title: "多维分类",
      description: "按游戏、类型、地区精准划分的讨论区，快速找到您的兴趣所在。"
    },
    {
      icon: <MessageSquare className="w-8 h-8 text-purple-400" />,
      title: "实时互动",
      description: "毫秒级响应的即时聊天与动态更新，不错过任何精彩瞬间。"
    },
    {
      icon: <Trophy className="w-8 h-8 text-yellow-400" />,
      title: "成就系统",
      description: "记录您的社区贡献，解锁专属勋章与特权，彰显您的身份。"
    },
    {
      icon: <Users className="w-8 h-8 text-pink-400" />,
      title: "开发者直通",
      description: "与游戏开发者直接对话，反馈建议与 Bug，共同塑造游戏未来。"
    }
  ];

  return (
    <section className="py-24 px-6 bg-white/[0.02] border-y border-white/5">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-sm font-bold uppercase tracking-[0.4em] text-[#f27d26] mb-4">论坛特色</h2>
          <h3 className="text-4xl md:text-6xl font-black uppercase italic tracking-tighter">为深度交流而生</h3>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((f, i) => (
            <motion.div
              key={i}
              whileHover={{ y: -10 }}
              className="p-8 glass rounded-2xl border-white/10 hover:border-[#f27d26]/50 transition-all group"
            >
              <div className="mb-6 group-hover:scale-110 transition-transform duration-300">{f.icon}</div>
              <h4 className="text-xl font-bold uppercase italic mb-4">{f.title}</h4>
              <p className="text-white/50 text-sm leading-relaxed">{f.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

const ScreenshotsSection = () => {
  const screenshots = [
    { name: "赛博竞技场", genre: "第一人称射击", img: "https://picsum.photos/seed/fps/1200/800" },
    { name: "Nexus 传奇", genre: "多人在线竞技", img: "https://picsum.photos/seed/moba/1200/800" },
    { name: "星际漂移", genre: "竞速", img: "https://picsum.photos/seed/racing/1200/800" },
    { name: "虚空猎手", genre: "角色扮演", img: "https://picsum.photos/seed/rpg/1200/800" },
  ];

  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  // Calculate which screenshot to show based on scroll progress
  const [currentIndex, setCurrentIndex] = useState(0);
  
  useEffect(() => {
    return scrollYProgress.on("change", (latest) => {
      const index = Math.min(
        Math.floor(latest * screenshots.length),
        screenshots.length - 1
      );
      setCurrentIndex(index);
    });
  }, [scrollYProgress, screenshots.length]);

  return (
    <section ref={containerRef} className="relative h-[400vh]">
      <div className="sticky top-0 h-screen flex flex-col justify-center overflow-hidden px-6">
        <div className="max-w-7xl mx-auto w-full">
          <div className="mb-12">
            <h2 className="text-sm font-bold uppercase tracking-[0.4em] text-[#00ff00] mb-4">视觉盛宴</h2>
            <h3 className="text-4xl md:text-6xl font-black uppercase italic tracking-tighter">游戏截图</h3>
            <p className="mt-4 text-white/40 font-medium uppercase tracking-widest text-xs">向下滚动探索更多</p>
          </div>

          <div className="relative aspect-video w-full rounded-2xl border border-white/10 overflow-hidden bg-black">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIndex}
                initial={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 w-full h-full"
              >
                <img 
                  src={screenshots[currentIndex].img} 
                  alt={screenshots[currentIndex].name} 
                  className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-1000"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                
                <div className="absolute bottom-0 left-0 p-8 md:p-12">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <div className="text-xs md:text-sm font-bold uppercase tracking-[0.3em] text-[#f27d26] mb-2">
                      {screenshots[currentIndex].genre}
                    </div>
                    <div className="text-3xl md:text-5xl font-black uppercase italic tracking-tighter">
                      {screenshots[currentIndex].name}
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Progress Bar */}
            <div className="absolute bottom-0 left-0 h-1 bg-[#f27d26] z-20" style={{ width: `${(currentIndex + 1) / screenshots.length * 100}%`, transition: 'width 0.5s ease-out' }} />
          </div>

          {/* Indicators */}
          <div className="mt-12 flex justify-center gap-4">
            {screenshots.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1 transition-all duration-500 rounded-full",
                  currentIndex === i ? "w-16 bg-[#f27d26]" : "w-4 bg-white/10"
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

const CTA = () => {
  const forumHref = getForumEntryUrl();

  return (
    <section className="py-24 px-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[#f27d26] translate-y-[80%] skew-y-[-5deg] opacity-20" />
      
      <div className="max-w-4xl mx-auto text-center relative z-10">
        <h2 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter mb-8">
          准备好 <br /> <span className="text-[#f27d26]">升级了吗？</span>
        </h2>
        <p className="text-xl text-white/60 mb-12 max-w-2xl mx-auto">
          加入全球增长最快的游戏讨论社区。您的小队在等着您。
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <Link href={forumHref} className="w-full sm:w-auto px-12 py-5 bg-white text-black font-black uppercase tracking-[0.2em] hover:bg-[#f27d26] hover:text-white transition-all text-center">
            加入 Nexus
          </Link>
          <button className="w-full sm:w-auto px-12 py-5 border border-white/20 font-black uppercase tracking-[0.2em] hover:bg-white/5 transition-all">
            了解更多
          </button>
        </div>
      </div>
    </section>
  );
};

const Footer = () => {
  return (
    <footer className="py-12 px-6 border-t border-white/10 bg-black">
      <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-12">
        <div className="col-span-2">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 bg-[#f27d26] rounded flex items-center justify-center">
              <Gamepad2 className="text-black w-5 h-5" />
            </div>
            <span className="text-xl font-bold tracking-tighter uppercase italic">Nexus</span>
          </div>
          <p className="text-white/40 text-sm max-w-sm leading-relaxed">
            现代玩家的终极论坛。由玩家打造，为玩家服务。加入多游戏社区管理和竞技交流的革命。
          </p>
        </div>
        
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/60 mb-6">导航</h4>
          <ul className="space-y-4 text-sm text-white/40 font-medium uppercase tracking-widest">
            <li><a href="#" className="hover:text-white transition-colors">主页</a></li>
            <li><a href="#" className="hover:text-white transition-colors">社区</a></li>
          </ul>
        </div>

        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/60 mb-6">支持</h4>
          <ul className="space-y-4 text-sm text-white/40 font-medium uppercase tracking-widest">
            <li><a href="#" className="hover:text-white transition-colors">帮助中心</a></li>
            <li><a href="#" className="hover:text-white transition-colors">服务条款</a></li>
            <li><a href="#" className="hover:text-white transition-colors">隐私政策</a></li>
          </ul>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto mt-12 pt-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="text-[10px] uppercase tracking-widest text-white/20">
          © 2026 Nexus 游戏论坛。保留所有权利。
        </div>
        <div className="flex gap-6">
          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#f27d26] transition-colors cursor-pointer">
            <Globe className="w-4 h-4" />
          </div>
          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#f27d26] transition-colors cursor-pointer">
            <Users className="w-4 h-4" />
          </div>
          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#f27d26] transition-colors cursor-pointer">
            <MessageSquare className="w-4 h-4" />
          </div>
        </div>
      </div>
    </footer>
  );
};

export default function LandingPage() {
  return (
    <main className="bg-[#050505] min-h-screen selection:bg-[#f27d26] selection:text-black">
      <Navbar />
      <Hero />
      <Features />
      <ScreenshotsSection />
      <CTA />
      <Footer />
    </main>
  );
}
