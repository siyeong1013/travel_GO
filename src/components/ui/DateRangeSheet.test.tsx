/** @vitest-environment happy-dom */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DateRangeSheet } from '@/components/ui/DateRangeSheet';

afterEach(cleanup);

function open(start: string | null = null, end: string | null = null) {
  const onDone = vi.fn();
  render(
    <DateRangeSheet
      open
      title="여행 기간"
      start={start}
      end={end}
      today="2026-11-05"
      onClose={() => {}}
      onDone={onDone}
    />,
  );
  return { onDone, user: userEvent.setup(), sheet: screen.getByRole('dialog', { name: '여행 기간' }) };
}

describe('DateRangeSheet', () => {
  it('takes a start and an end, and says how long it is', async () => {
    const { onDone, user, sheet } = open();
    await user.click(within(sheet).getByLabelText('2026년 12월 1일 화요일'));
    expect(within(sheet).getByText('12.1 (화) – 종료일을 골라 주세요.')).toBeInTheDocument();
    await user.click(within(sheet).getByLabelText('2026년 12월 3일 목요일'));
    expect(within(sheet).getByText('12.1 (화) – 12.3 (목) · 2박 3일')).toBeInTheDocument();
    expect(within(sheet).getByLabelText('2026년 12월 1일 화요일')).toHaveAttribute('aria-pressed', 'true');
    expect(within(sheet).getByLabelText('2026년 12월 2일 수요일')).toHaveAttribute('aria-pressed', 'false');

    await user.click(within(sheet).getByRole('button', { name: '선택' }));
    expect(onDone).toHaveBeenCalledWith('2026-12-01', '2026-12-03');
  });

  it('takes a start alone as a day trip, and asks for a date when there is none', async () => {
    const { onDone, user, sheet } = open();
    await user.click(within(sheet).getByRole('button', { name: '선택' }));
    expect(within(sheet).getByRole('alert')).toHaveTextContent('날짜를 눌러 기간을 골라 주세요.');
    expect(onDone).not.toHaveBeenCalled();

    await user.click(within(sheet).getByLabelText('2026년 11월 20일 금요일'));
    await user.click(within(sheet).getByRole('button', { name: '선택' }));
    expect(onDone).toHaveBeenCalledWith('2026-11-20', '2026-11-20');
  });

  it('shows from two months before, and earlier months on asking', async () => {
    const { user, sheet } = open();
    expect(within(sheet).getByRole('region', { name: '2026년 9월' })).toBeInTheDocument();
    expect(within(sheet).queryByRole('region', { name: '2026년 8월' })).toBeNull();
    expect(within(sheet).getByRole('region', { name: '2028년 11월' })).toBeInTheDocument();
    expect(within(sheet).getByLabelText('2026년 11월 5일 목요일')).toHaveAttribute('aria-current', 'date');

    await user.click(within(sheet).getByRole('button', { name: '이전 달 더 보기' }));
    expect(within(sheet).getByRole('region', { name: '2025년 9월' })).toBeInTheDocument();
  });

  it("opens with a trip's dates picked, from before its month", () => {
    const { sheet } = open('2025-03-02', '2025-03-04');
    expect(within(sheet).getByRole('region', { name: '2025년 1월' })).toBeInTheDocument();
    expect(within(sheet).getByText('2025.3.2 (일) – 3.4 (화) · 2박 3일')).toBeInTheDocument();
    expect(within(sheet).getByLabelText('2025년 3월 4일 화요일')).toHaveAttribute('aria-pressed', 'true');
  });
});
