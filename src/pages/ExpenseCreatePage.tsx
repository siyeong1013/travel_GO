import { useParams } from 'react-router';
import { ExpenseForm } from '@/features/expenses/ExpenseForm';
import { lastRates, newExpenseValues } from '@/features/expenses/expenseForm';
import { ExpensePageShell } from '@/features/expenses/ExpensePageShell';
import { useExpenseStore } from '@/features/expenses/expenseStore';
import { toLocalDate } from '@/lib/dates';
import { useGoBack } from '@/lib/useGoBack';

export function ExpenseCreatePage() {
  const { tripId } = useParams();
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
              companions,
              expenses,
              today: toLocalDate(),
              rates,
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
