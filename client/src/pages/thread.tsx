import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useAppStore, type Delivery } from "@/lib/appStore";
import Layout from "@/components/Layout";
import PassageCard from "@/components/PassageCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles } from "lucide-react";

export default function Thread() {
  const { user } = useAuth();
  const { getDeliveries, deliverToday, getStats, passagesLoaded } = useAppStore();

  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [delivering, setDelivering] = useState(false);
  const [deliverError, setDeliverError] = useState<string | null>(null);

  // Sync from store whenever it might have changed
  useEffect(() => {
    if (!user) return;
    setDeliveries(getDeliveries(user.id));
  }, [user, getDeliveries]);

  if (!user) return null;

  const stats = getStats(user.id);

  const today = deliveries.find((d) => {
    const dt = new Date(d.deliveredAt);
    return dt.toDateString() === new Date().toDateString();
  });

  const historical = today
    ? deliveries.filter((d) => d.id !== today.id)
    : deliveries;

  const handleDeliver = () => {
    setDelivering(true);
    setDeliverError(null);
    try {
      const delivery = deliverToday(user.id);
      setDeliveries(getDeliveries(user.id));
      // Delivery already committed to store via deliverToday
      void delivery;
    } catch (e: any) {
      setDeliverError(e?.message ?? "Could not deliver passage.");
    } finally {
      setDelivering(false);
    }
  };

  const handleFavouriteChange = () => {
    // Re-sync from store after a favourite toggle
    setDeliveries(getDeliveries(user.id));
  };

  return (
    <Layout>
      {/* ── Header ── */}
      <div className="mb-8">
        <h1
          className="text-foreground mb-1"
          style={{ fontFamily: "Lora, Georgia, serif", fontSize: "1.5rem", fontWeight: 500 }}
          data-testid="text-page-title"
        >
          Your Thread
        </h1>
        <p className="text-muted-foreground text-sm">
          {passagesLoaded
            ? `${stats.delivered} passage${stats.delivered !== 1 ? "s" : ""} received · ${stats.remaining} remaining`
            : "A daily passage from the works of Idries Shah"}
        </p>
      </div>

      {/* ── Today's thought / deliver prompt ── */}
      {!passagesLoaded ? (
        <TodaySkeleton />
      ) : !today ? (
        <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-8 text-center mb-8">
          <p className="text-sm text-muted-foreground mb-4">
            Your thought for today is waiting.
          </p>
          {deliverError && (
            <p className="text-sm text-destructive mb-3">{deliverError}</p>
          )}
          <Button
            onClick={handleDeliver}
            disabled={delivering}
            data-testid="button-receive-today"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {delivering ? "Receiving…" : "Receive Today's Thought"}
          </Button>
        </div>
      ) : (
        <div className="mb-8">
          <PassageCard
            delivery={today}
            isToday
            userId={user.id}
            onFavouriteChange={handleFavouriteChange}
          />
        </div>
      )}

      {/* ── Historical thread ── */}
      {historical.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-4 font-medium">
            Previous Thoughts
          </h2>
          <div className="flex flex-col gap-4">
            {historical.map((d) => (
              <PassageCard
                key={d.id}
                delivery={d}
                userId={user.id}
                onFavouriteChange={handleFavouriteChange}
              />
            ))}
          </div>
        </section>
      )}

      {deliveries.length === 0 && passagesLoaded && (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-sm">
            No thoughts yet — receive your first one above.
          </p>
        </div>
      )}
    </Layout>
  );
}

function TodaySkeleton() {
  return (
    <div className="rounded-xl border border-card-border bg-card p-6 mb-8">
      <Skeleton className="h-4 w-24 mb-3" />
      <Skeleton className="h-5 w-48 mb-4" />
      <Skeleton className="h-3 w-full mb-2" />
      <Skeleton className="h-3 w-full mb-2" />
      <Skeleton className="h-3 w-2/3 mb-6" />
      <Skeleton className="h-3 w-40" />
    </div>
  );
}
