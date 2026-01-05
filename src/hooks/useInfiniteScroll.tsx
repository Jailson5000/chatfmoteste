import { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from "react";

export interface UseInfiniteScrollOptions {
  initialBatchSize?: number;
  batchIncrement?: number;
  threshold?: number; // pixels from bottom to trigger load
}

export interface UseInfiniteScrollReturn<T> {
  // Visible data (limited by current batch)
  visibleData: T[];
  
  // State
  displayedCount: number;
  totalCount: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  
  // Actions
  loadMore: () => void;
  reset: () => void;
  
  // Scroll handler to attach to container
  handleScroll: (e: React.UIEvent<HTMLElement>) => void;
  
  // Ref-based scroll detection (alternative)
  scrollContainerRef: React.RefObject<HTMLElement>;
}

/**
 * Hook for infinite scroll with batch loading.
 * Works with already-loaded data, progressively revealing more items as user scrolls.
 */
export function useInfiniteScroll<T>(
  data: T[],
  options: UseInfiniteScrollOptions = {}
): UseInfiniteScrollReturn<T> {
  const {
    initialBatchSize = 30,
    batchIncrement = 20,
    threshold = 200,
  } = options;

  const [displayedCount, setDisplayedCount] = useState(initialBatchSize);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const loadingRef = useRef(false);

  // Preserve user's current viewport position when incrementally revealing more items
  const pendingScrollContainerRef = useRef<HTMLElement | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);

  const totalCount = data.length;
  const hasMore = displayedCount < totalCount;

  // Visible data slice
  const visibleData = useMemo(() => {
    return data.slice(0, displayedCount);
  }, [data, displayedCount]);

  // Reset when data changes significantly (e.g., filter applied)
  useEffect(() => {
    if (displayedCount > data.length + batchIncrement) {
      setDisplayedCount(Math.min(initialBatchSize, data.length));
    }
  }, [data.length, displayedCount, initialBatchSize, batchIncrement]);

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMore) return;

    loadingRef.current = true;
    setIsLoadingMore(true);

    // Small delay to show loading state and prevent rapid-fire loads
    requestAnimationFrame(() => {
      setDisplayedCount((prev) => Math.min(prev + batchIncrement, totalCount));
      setIsLoadingMore(false);
      loadingRef.current = false;
    });
  }, [hasMore, batchIncrement, totalCount]);

  // Restore scrollTop after list grows (keeps same item visible)
  useLayoutEffect(() => {
    const container = pendingScrollContainerRef.current;
    const top = pendingScrollTopRef.current;
    if (!container || top === null) return;

    container.scrollTop = top;

    pendingScrollContainerRef.current = null;
    pendingScrollTopRef.current = null;
  }, [displayedCount]);

  const reset = useCallback(() => {
    setDisplayedCount(initialBatchSize);
  }, [initialBatchSize]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLElement>) => {
      const target = e.currentTarget;
      const scrollTop = target.scrollTop;
      const scrollHeight = target.scrollHeight;
      const clientHeight = target.clientHeight;

      // Check if scrolled near bottom
      if (scrollHeight - scrollTop - clientHeight < threshold) {
        // Save current position to avoid jumps after incremental render
        pendingScrollContainerRef.current = target;
        pendingScrollTopRef.current = scrollTop;
        loadMore();
      }
    },
    [loadMore, threshold]
  );

  // Alternative: Intersection Observer for ref-based detection
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleContainerScroll = () => {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;

      if (scrollHeight - scrollTop - clientHeight < threshold) {
        pendingScrollContainerRef.current = container;
        pendingScrollTopRef.current = scrollTop;
        loadMore();
      }
    };

    container.addEventListener("scroll", handleContainerScroll);
    return () => container.removeEventListener("scroll", handleContainerScroll);
  }, [loadMore, threshold]);

  return {
    visibleData,
    displayedCount,
    totalCount,
    hasMore,
    isLoadingMore,
    loadMore,
    reset,
    handleScroll,
    scrollContainerRef: scrollContainerRef as React.RefObject<HTMLElement>,
  };
}
