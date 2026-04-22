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

  const typeColors: Record<string, string> = {
    story: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    aphorism: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
    reflection: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
    dialogue: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
    poem: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
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

      {/* Footer — source + tags */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-muted-foreground italic">
          <em>{passage.book}</em>
          {passage.page ? (
            <span className="not-italic">, p. {passage.page}</span>
          ) : null}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
              typeColors[passage.type] ?? "bg-muted text-muted-foreground"
            }`}
          >
            {passage.type}
          </span>
          {passage.themes.slice(0, 2).map((theme) => (
            <span
              key={theme}
              className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
            >
              {theme}
            </span>
          ))}
        </div>
      </div>

      {isToday && <div className="ornamental-rule mt-4" aria-hidden="true" />}
    </article>
  );
}
