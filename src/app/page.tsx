import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-col items-center justify-center gap-8">
        <h1 className="text-5xl font-bold tracking-tight text-black dark:text-zinc-50">
        FlashTalk
        </h1>
        <Link
          href="/login"
          className="flex h-12 items-center justify-center rounded-full bg-foreground px-8 text-base font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          시작하기
        </Link>
      </main>
    </div>
  );
}
