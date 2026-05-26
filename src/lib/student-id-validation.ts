const STUDENT_ID_MIN_LENGTH = 7;
const STUDENT_ID_NUMERIC = /^\d+$/;

/** 학번 입력값에서 모든 공백을 제거합니다. */
export function normalizeStudentId(raw: string): string {
  return raw.replace(/\s/g, "");
}

export function validateStudentId(raw: string): string | null {
  const sid = normalizeStudentId(raw);

  if (!sid) {
    return "학번을 입력해 주세요.";
  }
  if (!STUDENT_ID_NUMERIC.test(sid)) {
    return "학번은 숫자만 입력 가능합니다.";
  }
  if (sid.length < STUDENT_ID_MIN_LENGTH) {
    return "학번은 7자리 이상 입력해주세요";
  }
  return null;
}
