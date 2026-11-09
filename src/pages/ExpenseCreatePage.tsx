import { useParams, useSearchParams } from 'react-router';
import { ExpenseForm } from '@/features/expenses/ExpenseForm';
import { lastRates, newExpenseValues } from '@/features/expenses/expenseForm';
import { ExpensePageShell } from '@/features/expenses/ExpensePageShell';
import { useExpenseStore } from '@/features/expenses/expenseStore';
import { toLocalDate } from '@/lib/dates';
import { useGoBack } from '@/lib/useGoBack';

export function ExpenseCreatePage() {
  const { tripId } = useParams();
  const [params] = useSearchParams();
  const addExpense = useExpenseStore((state) => state.addExpense);
  const goBack = useGoBack(`/trips/${tripId}?tab=expenses`);

  return (
    <ExpensePageShell tripId={tripId} title="지출 추가">
      {({ trip, companions, expenses, scheduleItems, usedRates }) => {
        const rates = lastRates(expenses, trip.settlementCurrency, usedRates);
        return (
          <ExpenseForm
            trip={trip}
            companions={companions}
            scheduleItems={scheduleItems}
            rates={rates}
            initialValues={newExpenseValues({
              trip,
              expenses,
              today: toLocalDate(),
              rates,
              // `?item=`: added from a schedule item's sheet, so linked to it (and on its day).
              scheduleItem: scheduleItems.find((item) => item.id === params.get('item')),
            })}
            fetchRateOnOpen
            onSubmit={async (input) => {
              await addExpense({ tripId: trip.id, ...input });
              goBack();
            }}
          />
        );
      }}
    </ExpensePageShell>
  );
}
