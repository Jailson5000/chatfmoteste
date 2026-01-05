import { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect, type RefObject, type UIEvent } from "react";

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
  handleScroll: (e: UIEvent<HTMLElement>) => void;
  
  // Ref-based scroll detection (alternative)
  scrollContainerRef: RefObject<HTMLElement>;
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

  // Prevent load-more loops: only trigger again after user scrolls away and back
  const nearEndArmedRef = useRef(true);

  // Preserve user's current viewport position when incrementally revealing more items
  const pendingScrollContainerRef = useRef<HTMLElement | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);

  const totalCount = data.length;
  const hasMore = displayedCount < totalCount;

  // Visible data slice
  const visibleData = useMemo(() => {
    return data.slice(0, displayedCount);
  }, [data, displayedCount]);

  // Keep displayedCount consistent when data shrinks temporarily (e.g. realtime/drag moves)
  // so we don't end up "stuck" showing only 1 item.
  useEffect(() => {
    const minCount = Math.min(initialBatchSize, data.length);

    if (displayedCount < minCount) {
      setDisplayedCount(minCount);
      return;
    }

    if (displayedCount > data.length + batchIncrement) {
      setDisplayedCount(minCount);
    }
  }, [data.length, displayedCount, initialBatchSize, batchIncrement]);

  const loadMore = useCallback(() => {
    if (loadingRef.current) return;
    if (displayedCount >= data.length) return;

    loadingRef.current = true;
    setIsLoadingMore(true);

    // Small delay to show loading state and prevent rapid-fire loads
    requestAnimationFrame(() => {
      setDisplayedCount((prev) => Math.min(prev + batchIncrement, data.length));
      setIsLoadingMore(false);
      loadingRef.current = false;
    });
  }, [batchIncrement, data.length, displayedCount]);

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
    (e: UIEvent<HTMLElement>) => {
      const target = e.currentTarget;
      const scrollTop = target.scrollTop;
      const scrollHeight = target.scrollHeight;
      const clientHeight = target.clientHeight;
      const remaining = scrollHeight - scrollTop - clientHeight;

      // Rearm once the user moves away from the threshold
      if (remaining > threshold) {
        nearEndArmedRef.current = true;
      }

      // Trigger only once per "crossing" into the threshold zone
      if (remaining < threshold && nearEndArmedRef.current) {
        nearEndArmedRef.current = false;

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
      const remaining = scrollHeight - scrollTop - clientHeight;

      if (remaining > threshold) {
        nearEndArmedRef.current = true;
      }

      if (remaining < threshold && nearEndArmedRef.current) {
        nearEndArmedRef.current = false;
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
    scrollContainerRef: scrollContainerRef as RefObject<HTMLElement>,
  };
}
