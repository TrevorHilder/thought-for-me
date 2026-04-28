import { useState } from "react";
import { useAppStore, type Delivery } from "@/lib/appStore";
import { Heart, ExternalLink } from "lucide-react";
import { format } from "date-fns";

// PDF page = printed page + offset.
// Offsets were established during passage extraction from the Google Drive PDFs.
const BOOK_OFFSETS: Record<string, number> = {
  "A Perfumed Scorpion": 12,
  "A Veiled Gazelle": 10,
  "Caravan of Dreams": 14,
  "Evenings With Idries Shah": 6,
  "Knowing How To Know": 18,
  "Learning How to Learn": 22,
  "Lectures And Letters": 6,
  "Neglected Aspects Of Sufi Study": 12,
  "Observations": 8,
  "Reflections": 8,
  "Seeker After Truth": 12,
  "Special Illumination": 8,
  "Sufi Thought And Action": 10,
  "Tales of the Dervishes": 14,
  "The Book Of The Book": 10,
  "The Commanding Self": 16,
  "The Dermis Probe": 16,
  "The Exploits Of The Incomparable Mulla Nasrudin": 14,
  "The Hundred Tales Of Wisdom": 10,
  "The Magic Monastery": 14,
  "The Pleasantries Of The Incredible Mulla Nasrudin": 16,
  "The Subtleties Of The Inimitable Mulla Nasrudin": 18,
  "The Sufis": 18,
  "The Way of the Sufi": 10,
  "The World Of Nasrudin": 22,
  "The World Of the Sufi": 12,
  "Thinkers of the East": 14,
  "Wisdom of the Idiots": 12,
};

// Two books have non-obvious slugs on the ISF site; the rest follow the
// standard pattern of lowercasing and replacing spaces with hyphens.
const ISF_SLUG_OVERRIDES: Record<string, string> = {
  "Lectures And Letters": "letters-and-lectures",
  "The World Of the Sufi": "the-world-of-the-sufis",
};

function sourceToSlug(source: string): string {
  if (ISF_SLUG_OVERRIDES[source]) return ISF_SLUG_OVERRIDES[source];
  return source
    .toLowerCase()
    .replace(/[''']/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function isfUrl(source: string, printedPage?: number): string {
  const slug = sourceToSlug(source);
  const base = `https://idriesshahfoundation.org/pdfviewer/${slug}/?auto_viewer=true`;
  if (printedPage == null || printedPage === 0) return base;
  const pdfPage = printedPage + (BOOK_OFFSETS[source] ?? 0);
  return `${base}#page=${pdfPage}`;
}

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

      {/* Passage text — reflow single line-breaks into spaces, preserve paragraph breaks */}
      <div className="prose-passage text-foreground mb-5 space-y-4">
        {passage.text
          .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
          .replace(/(?<!\n)\n(?!\n)/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .replace(/  +/g, ' ')
          .trim()
          .split('\n\n')
          .map((para, i) => <p key={i}>{para.trim()}</p>)
        }
      </div>

      {/* Footer — source + ISF link */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-muted-foreground italic">
          <em>{passage.source}</em>
          {passage.page ? (
            <span className="not-italic">, p. {passage.page}</span>
          ) : null}
        </p>
        <a
          href={isfUrl(passage.source, passage.page)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline flex-shrink-0"
          title="Read in the Idries Shah Foundation PDF viewer"
        >
          Read online
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {isToday && <div className="ornamental-rule mt-4" aria-hidden="true" />}
    </article>
  );
}
