"use client";

import { useState } from "react";

type Step = "lookup" | "login" | "register";

export default function SignUpLoginView() {
  const [step, setStep] = useState<Step>("lookup");
  const [studentId, setStudentId] = useState("");
  const [universityName, setUniversityName] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupPending, setLookupPending] = useState(false);

  /**
   * Returns whether the user is already registered (`User` row exists).
   * On HTTP/network failure, sets `lookupError` and throws so the step stays on lookup.
   */
  async function verifyUser(): Promise<boolean> {
    setLookupError(null);
    setLookupPending(true);
    try {
      const res = await fetch("/api/users/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, universityName }),
      });
      let data: { exists?: boolean } = {};
      try {
        data = (await res.json()) as { exists?: boolean };
      } catch {
        /* ignore invalid JSON */
      }
      if (!res.ok) {
        setLookupError("확인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        throw new Error("VERIFY_FAILED");
      }
      return data.exists === true;
    } catch (e) {
      if (e instanceof Error && e.message === "VERIFY_FAILED") {
        throw e;
      }
      setLookupError("네트워크 오류가 발생했습니다.");
      throw new Error("VERIFY_FAILED");
    } finally {
      setLookupPending(false);
    }
  }

  async function handleNext(e: React.FormEvent) {
    e.preventDefault();
    try {
      const exists = await verifyUser();
      setStep(exists ? "login" : "register");
    } catch {
      /* `lookupError` already set in verifyUser */
    }
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-col items-center justify-center gap-6">
        <h1 className="text-5xl font-bold tracking-tight text-black dark:text-zinc-50">
          FlashTalk
        </h1>

        {step === "lookup" && (
          <>
            <p className="text-base text-zinc-900 dark:text-zinc-50">
              본인의 학번을 입력하여 주세요.
            </p>

            <form
              onSubmit={handleNext}
              className="flex flex-col items-stretch gap-4 w-full max-w-sm"
            >
              <input
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                inputMode="numeric"
                autoComplete="username"
                placeholder="ex) 20260001"
                className="h-11 w-full rounded-md border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                required
              />

              <p className="text-base text-zinc-900 dark:text-zinc-50">
                학교 이름을 입력하여 주세요.
              </p>

              <input
                value={universityName}
                onChange={(e) => setUniversityName(e.target.value)}
                autoComplete="organization"
                placeholder="ex) 한국대"
                className="h-11 w-full rounded-md border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                required
              />

              {lookupError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {lookupError}
                </p>
              )}

              <button
                type="submit"
                disabled={lookupPending}
                className="flex h-12 w-full items-center justify-center rounded-full bg-foreground px-8 text-base font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
              >
                {lookupPending ? "확인 중…" : "가입 확인"}
              </button>
            </form>
          </>
        )}

        {step === "login" && (
          <form
            className="flex flex-col items-stretch gap-4 w-full max-w-sm"
            onSubmit={(e) => e.preventDefault()}
          >
            <p className="text-base text-zinc-900 dark:text-zinc-50">
              로그인 — 학번과 비밀번호를 입력해 주세요.
            </p>
            <input
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              inputMode="numeric"
              autoComplete="username"
              placeholder="학번"
              className="h-11 w-full rounded-md border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              required
            />
            <input
              type="password"
              autoComplete="current-password"
              placeholder="비밀번호"
              className="h-11 w-full rounded-md border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              required
            />
            <button
              type="button"
              className="text-sm text-zinc-600 underline dark:text-zinc-400"
              onClick={() => setStep("lookup")}
            >
              이전
            </button>
          </form>
        )}

        {step === "register" && (
          <form
            className="flex flex-col items-stretch gap-4 w-full max-w-sm"
            onSubmit={(e) => e.preventDefault()}
          >
            <p className="text-base text-zinc-900 dark:text-zinc-50">
              회원가입 — 정보를 입력해 주세요.
            </p>
            <input
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              inputMode="numeric"
              autoComplete="username"
              placeholder="학번"
              className="h-11 w-full rounded-md border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              required
            />
            <input
              autoComplete="name"
              placeholder="이름"
              className="h-11 w-full rounded-md border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              required
            />
            <input
              value={universityName}
              onChange={(e) => setUniversityName(e.target.value)}
              autoComplete="organization"
              placeholder="학교 명 ex) 한국대"
              className="h-11 w-full rounded-md border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              required
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder="비밀번호"
              className="h-11 w-full rounded-md border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              required
            />
            <button
              type="button"
              className="text-sm text-zinc-600 underline dark:text-zinc-400"
              onClick={() => setStep("lookup")}
            >
              이전
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
