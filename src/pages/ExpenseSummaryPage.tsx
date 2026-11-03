import { useParams } from 'react-router';
import { ExpensePageShell } from '@/features/expenses/ExpensePageShell';
import { ExpenseSummary } from '@/features/expenses/ExpenseSummary';

export function ExpenseSummaryPage() {
  const { tripId } = useParams();

  return (
    <ExpensePageShell tripId={tripId} title="지출 요약">
      {({ trip, companions, expenses, settlements }) => (
        <ExpenseSummary
          trip={trip}
          companions={companions}
          expenses={expenses}
          settlements={settlements}
        />
      )}
    </ExpensePageShell>
  );
}
