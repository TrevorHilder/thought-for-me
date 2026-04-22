import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useAppStore, type Delivery } from "@/lib/appStore";
import Layout from "@/components/Layout";
import PassageCard from "@/components/PassageCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart } from "lucide-react";

export default function Favourites() {
  const { user } = useAuth();
  const { getFavourites, passagesLoaded } = useAppStore();

  const [favourites, setFavourites] = useState<Delivery[]>([]);

  useEffect(() => {
    if (!user) return;
    setFavourites(getFavourites(user.id));
  }, [user, getFavourites]);

  if (!user) return null;

  const handleFavouriteChange = () => {
    setFavourites(getFavourites(user.id));
  };

  return (
    <Layout>
      <div className="mb-8">
        <h1
          className="text-foreground mb-1"
          style={{ fontFamily: "Lora, Georgia, serif", fontSize: "1.5rem", fontWeight: 500 }}
          data-testid="text-page-title-favourites"
        >
          Favourites
        </h1>
        <p className="text-muted-foreground text-sm">
          {!passagesLoaded
            ? "Loading…"
            : `${favourites.length} saved passage${favourites.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      {!passagesLoaded ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-card-border bg-card p-6">
              <Skeleton className="h-5 w-40 mb-3" />
              <Skeleton className="h-3 w-full mb-2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      ) : favourites.length === 0 ? (
        <div className="text-center py-20 flex flex-col items-center gap-3">
          <Heart className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">
            No favourites yet. Tap the heart on any passage to save it here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {favourites.map((d) => (
            <PassageCard
              key={d.id}
              delivery={d}
              userId={user.id}
              onFavouriteChange={handleFavouriteChange}
            />
          ))}
        </div>
      )}
    </Layout>
  );
}
