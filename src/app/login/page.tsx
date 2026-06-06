"use client";

import type { SessionUserDTO } from "@/entities/User";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Step = "lookup" | "login" | "register";

import { CLIENT_JWT_KEY, CLIENT_USER_KEY } from "@/lib/session";
import { resetBrowserRealtimeAuth } from "@/lib/supabase-realtime-auth";
import {
  normalizeStudentId,
  validateStudentId,
} from "@/lib/student-id-validation";

const NAME_HAS_DIGIT = /\d/;
const PASSWORD_HAS_SPECIAL = /[^A-Za-z0-9]/;

function mapLoginErrorMessage(error: string): string {
  if (error === "Invalid password") {
    return "잘못된 비밀번호 입니다";
  }
  return error;
}

/** '한국대'처럼 마지막 글자가 '대'이고 그 앞에 한 글자 이상 있어야 합니다. */
function validateUniversityName(raw: string): string | null {
  const uni = raw.trim();

  if (!uni) {
    return "학교 이름을 입력해 주세요.";
  }
  if (!/.+대$/.test(uni)) {
    return "학교 명은 '한국대'와 같은 형식으로 입력해주세요";
  }
  return null;
}

export default function SignUpLoginView() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("lookup");
  const [studentId, setStudentId] = useState("");
  const [universityName, setUniversityName] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupPending, setLookupPending] = useState(false);

  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginPending, setLoginPending] = useState(false);

  const [registerName, setRegisterName] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [signUpError, setSignUpError] = useState<string | null>(null);
  const [signUpPending, setSignUpPending] = useState(false);

  const [registerConfirmOpen, setRegisterConfirmOpen] = useState(false);
  const [pendingRegisterSid, setPendingRegisterSid] = useState("");
  const [pendingRegisterUni, setPendingRegisterUni] = useState("");

  /**
   * Returns whether the user is already registered (`User` row exists).
   * On HTTP/network failure, sets `lookupError` and throws so the step stays on lookup.
   */
  async function verifyUser(sid: string, uni: string): Promise<boolean> {
    setLookupError(null);
    setLookupPending(true);
    try {
      const res = await fetch("/api/users/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: sid, universityName: uni }),
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
    setLookupError(null);

    const sid = normalizeStudentId(studentId);
    const uni = universityName.trim();

    const studentIdError = validateStudentId(studentId);
    if (studentIdError) {
      setLookupError(studentIdError);
      return;
    }
    const universityNameError = validateUniversityName(universityName);
    if (universityNameError) {
      setLookupError(universityNameError);
      return;
    }

    setStudentId(sid);

    try {
      const exists = await verifyUser(sid, uni);
      if (exists) {
        setStep("login");
      } else {
        setPendingRegisterSid(sid);
        setPendingRegisterUni(uni);
        setUniversityName(uni);
        setRegisterConfirmOpen(true);
      }
    } catch {
      /* `lookupError` already set in verifyUser */
    }
  }

  function confirmRegisterStep(): void {
    setStudentId(pendingRegisterSid);
    setUniversityName(pendingRegisterUni);
    setRegisterConfirmOpen(false);
    setStep("register");
  }

  /**
   * 회원가입 폼 검증 후 `POST /api/users/signup` → 서버에서 `UserController.signUp` → `UserRepository.save`.
   * 비밀번호는 TLS로 전송되며, **서버**(`signup/route`)에서 scrypt로 해시한 뒤 DB에만 저장됩니다.
   * 성공 시 `step === "login"`으로 전환합니다.
   */
  async function requestSignUp(): Promise<void> {
    setSignUpError(null);

    const sid = normalizeStudentId(studentId);
    const uni = universityName.trim();
    const nm = registerName.trim();
    const pw = registerPassword;

    const studentIdError = validateStudentId(studentId);
    if (studentIdError) {
      setSignUpError(studentIdError);
      return;
    }
    if (!nm) {
      setSignUpError("이름을 입력해 주세요.");
      return;
    }
    const universityNameError = validateUniversityName(universityName);
    if (universityNameError) {
      setSignUpError(universityNameError);
      return;
    }
    if (NAME_HAS_DIGIT.test(nm)) {
      setSignUpError("이름에 숫자는 입력할 수 없습니다");
      return;
    }
    if (pw.length < 8) {
      setSignUpError("비밀번호는 8자 이상 입력해 주세요.");
      return;
    }
    if (!PASSWORD_HAS_SPECIAL.test(pw)) {
      setSignUpError("비밀번호에 특수문자를 하나 이상 포함해야 합니다.");
      return;
    }

    setStudentId(sid);
    setSignUpPending(true);
    try {
      const res = await fetch("/api/users/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: sid,
          name: nm,
          universityName: uni,
          password: pw,
        }),
      });

      let data: { ok?: boolean; error?: string } = {};
      try {
        data = (await res.json()) as { ok?: boolean; error?: string };
      } catch {
        /* ignore */
      }

      if (!res.ok || !data.ok) {
        setSignUpError(
          typeof data.error === "string"
            ? data.error
            : "회원가입에 실패했습니다. 이미 가입된 정보인지 확인해 주세요."
        );
        return;
      }

      setRegisterPassword("");
      setStep("login");
    } catch {
      setSignUpError("네트워크 오류가 발생했습니다.");
    } finally {
      setSignUpPending(false);
    }
  }

  async function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    await requestSignUp();
  }

  /**
   * 로그인: `POST /api/users/login` → `UserController.login` → JWT 발급.
   * `token`과 `user`는 `sessionStorage`에 저장합니다. `user.role`이 `USER`이면 `/main`, `ADMIN`이면 `/admin`으로 이동합니다.
   */
  function requestLogin(): void {
    setLoginError(null);

    const sid = normalizeStudentId(studentId);
    const uni = universityName.trim();
    const pw = loginPassword;

    const studentIdError = validateStudentId(studentId);
    if (studentIdError) {
      setLoginError(studentIdError);
      return;
    }
    const universityNameError = validateUniversityName(universityName);
    if (universityNameError) {
      setLoginError(universityNameError);
      return;
    }
    if (!pw) {
      setLoginError("비밀번호를 입력해 주세요.");
      return;
    }

    setStudentId(sid);
    setLoginPending(true);
    void (async () => {
      try {
        const res = await fetch("/api/users/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: sid,
            universityName: uni,
            password: pw,
          }),
        });

        let data: {
          ok?: boolean;
          user?: SessionUserDTO;
          token?: string;
          error?: string;
        } = {};
        try {
          data = (await res.json()) as {
            ok?: boolean;
            user?: SessionUserDTO;
            token?: string;
            error?: string;
          };
        } catch {
          /* ignore */
        }

        if (
          !res.ok ||
          !data.ok ||
          !data.user ||
          typeof data.token !== "string" ||
          !data.token
        ) {
          setLoginError(
            typeof data.error === "string"
              ? mapLoginErrorMessage(data.error)
              : "로그인에 실패했습니다. 정보를 확인해 주세요."
          );
          return;
        }

        try {
          sessionStorage.setItem(CLIENT_JWT_KEY, data.token);
          sessionStorage.setItem(CLIENT_USER_KEY, JSON.stringify(data.user));
          resetBrowserRealtimeAuth();
        } catch {
          /* private mode / disabled storage */
        }

        if (data.user.role === "ADMIN") {
          router.push("/admin");
        } else {
          router.push("/main");
        }
      } catch {
        setLoginError("네트워크 오류가 발생했습니다.");
      } finally {
        setLoginPending(false);
      }
    })();
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
            onSubmit={(e) => {
              e.preventDefault();
              requestLogin();
            }}
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
              value={universityName}
              onChange={(e) => setUniversityName(e.target.value)}
              autoComplete="organization"
              placeholder="학교 이름"
              className="h-11 w-full rounded-md border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              required
            />
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="비밀번호"
              className="h-11 w-full rounded-md border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              required
            />
            {loginError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {loginError}
              </p>
            )}
            <button
              type="submit"
              disabled={loginPending}
              className="flex h-12 w-full items-center justify-center rounded-full bg-foreground px-8 text-base font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
            >
              {loginPending ? "로그인 중…" : "로그인"}
            </button>
            <button
              type="button"
              className="text-sm text-zinc-600 underline dark:text-zinc-400"
              onClick={() => {
                setLoginError(null);
                setLoginPassword("");
                setStep("lookup");
              }}
            >
              이전
            </button>
          </form>
        )}

        {step === "register" && (
          <form
            className="flex flex-col items-stretch gap-4 w-full max-w-sm"
            onSubmit={handleRegisterSubmit}
          >
            <p className="text-base text-zinc-900 dark:text-zinc-50">
              회원가입 — 정보를 입력해 주세요.
            </p>
            <input
              value={studentId}
              readOnly
              inputMode="numeric"
              autoComplete="username"
              placeholder="학번"
              aria-readonly="true"
              className="h-11 w-full rounded-md border border-zinc-200 bg-zinc-100 px-4 text-sm text-zinc-900 outline-none cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              required
            />
            <input
              value={registerName}
              onChange={(e) => setRegisterName(e.target.value)}
              autoComplete="name"
              placeholder="이름"
              className="h-11 w-full rounded-md border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              required
            />
            <input
              value={universityName}
              readOnly
              autoComplete="organization"
              placeholder="학교 명 ex) 한국대"
              aria-readonly="true"
              className="h-11 w-full rounded-md border border-zinc-200 bg-zinc-100 px-4 text-sm text-zinc-900 outline-none cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              required
            />
            <input
              type="password"
              value={registerPassword}
              onChange={(e) => setRegisterPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="비밀번호"
              className="h-11 w-full rounded-md border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              required
            />
            {signUpError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {signUpError}
              </p>
            )}
            <button
              type="submit"
              disabled={signUpPending}
              className="flex h-12 w-full items-center justify-center rounded-full bg-foreground px-8 text-base font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
            >
              {signUpPending ? "처리 중…" : "회원가입"}
            </button>
            <button
              type="button"
              className="text-sm text-zinc-600 underline dark:text-zinc-400"
              onClick={() => {
                setSignUpError(null);
                setRegisterConfirmOpen(false);
                setStep("lookup");
              }}
            >
              이전
            </button>
          </form>
        )}
      </main>

      {registerConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="register-confirm-title"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg dark:bg-zinc-950">
            <h2
              id="register-confirm-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              입력하신 학번/학교명을 확인해 주세요.
            </h2>
            <div className="mt-4 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
              <p>
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  학번:
                </span>{" "}
                {pendingRegisterSid}
              </p>
              <p>
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  학교명:
                </span>{" "}
                {pendingRegisterUni}
              </p>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRegisterConfirmOpen(false)}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-950"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmRegisterStep}
                className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
              >
                네
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
