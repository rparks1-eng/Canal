import ActivityScreen from "../../components/activity-screen";
import { useAuth } from "../../providers/auth-provider";

export default function ActivityTabScreen() {
  const { accountEpoch, sessionGeneration, user } = useAuth();

  return (
    <ActivityScreen
      key={`${user?.id ?? "signed-out"}:${accountEpoch}:${sessionGeneration ?? "session-pending"}`}
    />
  );
}
