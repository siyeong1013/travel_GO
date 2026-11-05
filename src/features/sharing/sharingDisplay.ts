import type { ISODateTime, Trip } from '@/data/models';
import { SharingRefusedError } from '@/data/sharing/sharing';
import { NotUploadedError } from '@/features/sharing/sharingStore';
import { formatDate } from '@/lib/format';

/** The address a friend opens to join: `/join/<token>` on this site. */
export function inviteUrl(token: string, origin = window.location.origin): string {
  return `${origin}/join/${token}`;
}

/** `11월 12일까지`, in the device's time zone. */
export function inviteExpiry(expiresAt: ISODateTime): string {
  const date = new Date(expiresAt);
  return `${date.getMonth() + 1}월 ${date.getDate()}일까지`;
}

/** `오사카 · 12.1 (화) – 12.3 (목)`: what a trip is, in an invite. */
export function tripSummary(trip: Pick<Trip, 'startDate' | 'endDate'> & { city: string | null }) {
  const dates =
    trip.startDate === trip.endDate
      ? formatDate(trip.startDate)
      : `${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`;
  return trip.city ? `${trip.city} · ${dates}` : dates;
}

/** The invite as a message (share sheet, or copied): what it is, then the link. */
export function inviteMessage(trip: Pick<Trip, 'title'>, url: string): string {
  return `'${trip.title}' 여행에 초대할게요. travel GO에서 일정과 가계부를 같이 봐요.\n${url}`;
}

/** Why a sharing call didn't go through, for the screen. */
export function sharingErrorMessage(error: unknown): string {
  if (error instanceof NotUploadedError) return '인터넷에 연결되면 초대할 수 있어요.';
  if (error instanceof SharingRefusedError) {
    if (error.reason === 'gone') return '삭제된 여행이에요.';
    if (error.reason === 'forbidden') return '여행을 만든 사람만 할 수 있어요.';
    return '여행이 아직 서버에 없어요. 잠시 후 다시 시도해 주세요.';
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return '인터넷에 연결되면 다시 시도해 주세요.';
  }
  return '서버와 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
}
