// @refresh reset
import { useState, useMemo, useCallback, useRef, useEffect, type RefObject, type UIEvent } from "react";

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
  
  // Guards to prevent loops
  const loadingRef = useRef(false);
  const lastLoadTimeRef = useRef(0);
  const armedRef = useRef(true); // must "re-arm" by scrolling away from the threshold

  const totalCount = data.length;
  const hasMore = displayedCount < totalCount;

  // Visible data slice
  const visibleData = useMemo(() => {
    return data.slice(0, displayedCount);
  }, [data, displayedCount]);

  // Keep displayedCount consistent when data shrinks temporarily (e.g. realtime/drag moves)
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
    // Triple guard: loading flag, hasMore check, AND debounce
    if (loadingRef.current) return;
    if (displayedCount >= data.length) return;
    
    // Debounce: minimum 100ms between loads
    const now = Date.now();
    if (now - lastLoadTimeRef.current < 100) return;
    lastLoadTimeRef.current = now;

    loadingRef.current = true;
    setIsLoadingMore(true);

    // Use setTimeout to ensure state batching and prevent sync loops
    setTimeout(() => {
      setDisplayedCount((prev) => {
        const newCount = Math.min(prev + batchIncrement, data.length);
        return newCount;
      });
      setIsLoadingMore(false);
      loadingRef.current = false;
    }, 16); // One frame delay
  }, [batchIncrement, data.length, displayedCount]);

  const reset = useCallback(() => {
    setDisplayedCount(initialBatchSize);
    loadingRef.current = false;
    lastLoadTimeRef.current = 0;
    armedRef.current = true;
  }, [initialBatchSize]);

  const handleScroll = useCallback(
    (e: UIEvent<HTMLElement>) => {
      // Skip if already loading
      if (loadingRef.current || isLoadingMore) return;
      if (displayedCount >= data.length) return;
      
      const target = e.currentTarget;
      const scrollTop = target.scrollTop;
      const scrollHeight = target.scrollHeight;
      const clientHeight = target.clientHeight;
      const remaining = scrollHeight - scrollTop - clientHeight;

      // Re-arm only after user moves away from the end
      if (remaining >= threshold * 1.25) {
        armedRef.current = true;
      }

      // Only load when near bottom AND armed
      if (remaining < threshold && armedRef.current) {
        armedRef.current = false;
        loadMore();
      }
    },
    [loadMore, threshold, isLoadingMore, displayedCount, data.length]
  );

  // NOTE: We intentionally do NOT attach a ref-based scroll listener here.
  // Consumers should use `handleScroll` on the scrollable container.
  // This avoids duplicate listeners and eliminates potential refresh/runtime issues.


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
