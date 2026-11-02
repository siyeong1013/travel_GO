import { RepositoryError, type RepositoryErrorCode } from '@/data/repositories';

const MESSAGES: Record<RepositoryErrorCode, string> = {
  not_found: '찾을 수 없어요. 이미 삭제되었을 수 있어요.',
  validation: '입력한 내용을 다시 확인해 주세요.',
  out_of_range_items: '여행 기간 밖에 있는 일정이 있어요.',
  companion_in_use: '이 동행자가 들어간 지출이나 송금 기록이 있어서 삭제할 수 없어요.',
  currency_locked: '지출이나 송금 기록이 있으면 정산 통화를 바꿀 수 없어요.',
  invalid_split: '나눠 낼 금액을 다시 확인해 주세요.',
  backup_invalid: '올바른 travel GO 백업 파일이 아니에요.',
  backup_unsupported_version: '더 새로운 버전의 앱에서 만든 백업 파일이에요. 앱을 업데이트해 주세요.',
};

/** User-facing (Korean) message for an error thrown by the data layer. */
export function errorMessage(error: unknown): string {
  if (error instanceof RepositoryError) return MESSAGES[error.code];
  return '문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
}
