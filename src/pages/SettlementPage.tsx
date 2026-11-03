import { useParams } from 'react-router';
import { ExpensePageShell } from '@/features/expenses/ExpensePageShell';
import { SettlementView } from '@/features/settlement/SettlementView';

export function SettlementPage() {
  const { tripId } = useParams();

  return (
    <ExpensePageShell tripId={tripId} title="정산">
      {({ trip, companions, expenses, settlements }) => (
        <SettlementView
          trip={trip}
          companions={companions}
          expenses={expenses}
          settlements={settlements}
        />
      )}
    </ExpensePageShell>
  );
}
