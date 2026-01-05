import { useState, useMemo, useCallback } from "react";

export interface PaginationState {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface UsePaginationOptions {
  initialPageSize?: number;
  pageSizeOptions?: number[];
}

export interface UsePaginationReturn<T> {
  // Paginated data
  paginatedData: T[];
  
  // Pagination state
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  
  // Navigation
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  setPageSize: (size: number) => void;
  
  // Info
  startIndex: number;
  endIndex: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  
  // Page size options
  pageSizeOptions: number[];
}

/**
 * Generic pagination hook that works with any array of data.
 * Does not modify the original data fetching - just paginates what's already loaded.
 */
export function usePagination<T>(
  data: T[],
  options: UsePaginationOptions = {}
): UsePaginationReturn<T> {
  const { 
    initialPageSize = 50, 
    pageSizeOptions = [25, 50, 100, 200] 
  } = options;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  const totalItems = data.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Reset to page 1 if current page exceeds total pages
  const currentPage = useMemo(() => {
    if (page > totalPages) {
      return 1;
    }
    return page;
  }, [page, totalPages]);

  // Calculate indices
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  // Paginated data slice
  const paginatedData = useMemo(() => {
    return data.slice(startIndex, endIndex);
  }, [data, startIndex, endIndex]);

  // Navigation functions
  const goToPage = useCallback((newPage: number) => {
    const validPage = Math.max(1, Math.min(newPage, totalPages));
    setPage(validPage);
  }, [totalPages]);

  const nextPage = useCallback(() => {
    if (currentPage < totalPages) {
      setPage(currentPage + 1);
    }
  }, [currentPage, totalPages]);

  const prevPage = useCallback(() => {
    if (currentPage > 1) {
      setPage(currentPage - 1);
    }
  }, [currentPage]);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1); // Reset to first page when changing page size
  }, []);

  return {
    paginatedData,
    page: currentPage,
    pageSize,
    totalItems,
    totalPages,
    goToPage,
    nextPage,
    prevPage,
    setPageSize,
    startIndex: startIndex + 1, // 1-indexed for display
    endIndex,
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1,
    pageSizeOptions,
  };
}
