import { useState } from "react";
import { useAppStore, type Delivery } from "@/lib/appStore";
import { Heart } from "lucide-react";
import { format } from "date-fns";

interface PassageCardProps {
  delivery: Delivery;
  isToday?: boolean;
  userId: string;
  onFavouriteChange?: () => void;
}

export default function PassageCard({
  delivery,
  isToday = false,
  userId,
  onFavouriteChange,
}: PassageCardProps) {
  const { toggleFavourite } = useAppStore();
  const [isFav, setIsFav] = useState(delivery.isFavourite);
  const [toggling, setToggling] = useState(false);

  const passage = delivery.passage;
  if (!passage) return null;

  const dateStr = delivery.deliveredAt
    ? format(new Date(delivery.deliveredAt), "d MMMM yyyy")
    : "";

  const handleToggleFavourite = () => {
    if (toggling) return;
    setToggling(true);
    const next = !isFav;
    setIsFav(next);
    toggleFavourite(delivery.id, next);
    onFavouriteChange?.();
    setToggling(false);
  };

  return (
    <article
      data-testid={`card-passage-${delivery.id}`}
      className={`
        rounded-xl border p-6 transition-shadow
        ${
          isToday
            ? "border-primary/30 bg-card shadow-md ring-1 ring-primary/10"
            : "border-card-border bg-card shadow-sm hover:shadow-md"
        }
        animate-fade-in-up
      `}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          {isToday && (
            <p className="text-xs font-medium text-primary uppercase tracking-widest mb-1.5">
              Today's Thought
            </p>
          )}
          <h2
            data-testid={`text-passage-title-${delivery.id}`}
            className="text-base font-semibold text-foreground leading-tight"
          >
            {passage.title}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{dateStr}</p>
        </div>
        <button
          onClick={handleToggleFavourite}
          data-testid={`button-favourite-${delivery.id}`}
          aria-label={isFav ? "Remove from favourites" : "Add to favourites"}
          disabled={toggling}
          className="flex-shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-primary transition-colors"
        >
          <Heart
            className="h-5 w-5"
            fill={isFav ? "currentColor" : "none"}
            stroke={isFav ? "none" : "currentColor"}
          />
        </button>
      </div>

      {/* Passage text */}
      <div className="prose-passage text-foreground whitespace-pre-line mb-5">
        {passage.text}
      </div>

      {/* Footer — source */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-muted-foreground italic">
          <em>{passage.source}</em>
          {passage.page ? (
            <span className="not-italic">, p. {passage.page}</span>
          ) : null}
        </p>
      </div>

      {isToday && <div className="ornamental-rule mt-4" aria-hidden="true" />}
    </article>
  );
}
