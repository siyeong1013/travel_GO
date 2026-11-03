import { useState } from 'react';
import { useParams } from 'react-router';
import { EmptyState } from '@/components/ui/EmptyState';
import { ExpenseForm } from '@/features/expenses/ExpenseForm';
import { lastRates, toFormValues } from '@/features/expenses/expenseForm';
import { ExpensePageShell } from '@/features/expenses/ExpensePageShell';
import { useExpenseStore } from '@/features/expenses/expenseStore';
import { useGoBack } from '@/lib/useGoBack';

export function ExpenseEditPage() {
  const { tripId, expenseId } = useParams();
  const updateExpense = useExpenseStore((state) => state.updateExpense);
  const removeExpense = useExpenseStore((state) => state.removeExpense);
  const goBack = useGoBack(`/trips/${tripId}?tab=expenses`);
  const [deleting, setDeleting] = useState(false);

  return (
    <ExpensePageShell tripId={tripId} title="지출 수정">
      {({ trip, companions, expenses, scheduleItems, usedRates }) => {
        const expense = expenses.find((e) => e.id === expenseId);
        if (!expense) {
          // Right after deleting, until the navigation lands.
          if (deleting) return null;
          return <EmptyState title="지출을 찾을 수 없어요" description="이미 삭제되었을 수 있어요." />;
        }
        const settlement = trip.settlementCurrency;
        const needsRate =
          expense.currency !== settlement && expense.exchangeRate.quote !== settlement;
        const rates = lastRates(expenses, settlement, usedRates);
        return (
          <ExpenseForm
            trip={trip}
            companions={companions}
            scheduleItems={scheduleItems}
            rates={rates}
            initialValues={toFormValues(expense, settlement, scheduleItems, rates)}
            // The stored rate stays unless it can't be used.
            fetchRateOnOpen={needsRate}
            notice={
              needsRate
                ? `이 지출의 환율은 ${expense.exchangeRate.quote} 기준이에요. 정산 통화인 ${settlement} 기준으로 다시 입력해 주세요.`
                : undefined
            }
            onSubmit={async (input) => {
              await updateExpense(expense.id, input);
              goBack();
            }}
            onDelete={async () => {
              setDeleting(true);
              try {
                await removeExpense(expense.id);
              } catch (error) {
                setDeleting(false);
                throw error;
              }
              goBack();
            }}
          />
        );
      }}
    </ExpensePageShell>
  );
}
