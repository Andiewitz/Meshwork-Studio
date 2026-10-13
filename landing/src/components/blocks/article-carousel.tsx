import * as React from "react";
import { ChevronLeft, ChevronRight, ArrowRight, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

// A docs/blog article. Adapted from an offer-card paste: brand fields became
// author + reading meta, promo art became article imagery.
export interface Article {
  id: string | number;
  imageSrc: string;
  imageAlt: string;
  tag: string;
  title: string;
  description: string;
  author: string;
  meta: string;
  href: string;
}

interface ArticleCardProps {
  article: Article;
}

// One card: imagery on top, title/description/meta below. No hover lift,
// no image zoom, no spring library — color-only feedback per DESIGN.md §10.
const ArticleCard = React.forwardRef<HTMLAnchorElement, ArticleCardProps>(
  ({ article }, ref) => (
    <a
      ref={ref}
      href={article.href}
      className="relative h-[380px] w-[300px] flex-shrink-0 snap-start overflow-hidden rounded-lg bg-tool group"
    >
      {/* Article imagery */}
      <img
        src={article.imageSrc}
        alt={article.imageAlt}
        loading="lazy"
        className="absolute inset-x-0 top-0 h-2/4 w-full bg-popup object-cover"
      />
      {/* Card Content */}
      <div className="absolute bottom-0 left-0 right-0 flex h-2/4 flex-col justify-between bg-card p-5">
        <div className="space-y-2">
          {/* Tag */}
          <div className="flex items-center text-xs text-muted-foreground">
            <Tag className="mr-2 h-4 w-4 text-primary" />
            <span>{article.tag}</span>
          </div>
          {/* Title & Description */}
          <h3 className="text-[15px] font-semibold leading-tight text-card-foreground">
            {article.title}
          </h3>
          <p className="text-[13px] text-muted-foreground">
            {article.description}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border pt-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid h-8 w-8 place-items-center rounded-full bg-hover text-[12px] font-semibold text-muted"
            >
              {article.author
                .split(" ")
                .map((w) => w[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <p className="text-xs font-semibold text-card-foreground">
                {article.author}
              </p>
              <p className="text-xs text-muted-foreground">{article.meta}</p>
            </div>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors duration-300 group-hover:rotate-[-45deg] group-hover:bg-primary group-hover:text-primary-foreground">
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </div>
    </a>
  ),
);
ArticleCard.displayName = "ArticleCard";

export interface ArticleCarouselProps extends React.HTMLAttributes<HTMLDivElement> {
  articles: Article[];
}

// Horizontal snap rail with arrow controls. Scrolling is native
// (scrollBy + CSS snap) — no animation library involved.
const ArticleCarousel = React.forwardRef<HTMLDivElement, ArticleCarouselProps>(
  ({ articles, className, ...props }, ref) => {
    const scrollContainerRef = React.useRef<HTMLDivElement>(null);

    const scroll = (direction: "left" | "right") => {
      if (scrollContainerRef.current) {
        const { current } = scrollContainerRef;
        const scrollAmount = current.clientWidth * 0.8;
        current.scrollBy({
          left: direction === "left" ? -scrollAmount : scrollAmount,
          behavior: "smooth",
        });
      }
    };

    return (
      <div
        ref={ref}
        className={cn("group relative w-full", className)}
        {...props}
      >
        {/* Left Scroll Button */}
        <button
          onClick={() => scroll("left")}
          className="absolute left-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-popup text-foreground opacity-0 transition-opacity duration-300 hover:bg-hover group-hover:opacity-100"
          aria-label="Scroll Left"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        {/* Scrollable Container */}
        <div
          ref={scrollContainerRef}
          className="flex snap-x snap-mandatory space-x-4 overflow-x-auto pb-4 scrollbar-hide"
        >
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>

        {/* Right Scroll Button */}
        <button
          onClick={() => scroll("right")}
          className="absolute right-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-popup text-foreground opacity-0 transition-opacity duration-300 hover:bg-hover group-hover:opacity-100"
          aria-label="Scroll Right"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>
    );
  },
);
ArticleCarousel.displayName = "ArticleCarousel";

export { ArticleCarousel, ArticleCard };
