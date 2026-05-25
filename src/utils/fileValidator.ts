export interface ValidationResult {
    isValid: boolean;
    errorMessage: string | null;
}

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_EXTENSIONS = [
    'pdf','hwp', 'hwpx', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'csv', // 문서
    'jpg', 'jpeg', 'png', 'gif', 'webp','svg',                                      // 이미지
    'zip', 'tar', 'gz'                                                              // 압축
];

export const validateFile = (file: File): ValidationResult => {
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
        return {
            isValid: false,
            errorMessage: `지원하지 않는 파일 형식입니다. (첨부 가능: pdf, 문서, 이미지, zip 등)`
        };
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
        return {
            isValid: false,
            errorMessage: `파일 용량이 너무 큽니다. (최대 ${MAX_FILE_SIZE_MB}MB까지 첨부 가능)`
        };
    }

    return {
        isValid: true,
        errorMessage: null
    };
};

/** @deprecated Use validateFile */
export const isValidFile = validateFile;