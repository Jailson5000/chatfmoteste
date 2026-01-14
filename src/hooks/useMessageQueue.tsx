import { useRef, useCallback } from "react";

interface QueuedMessage {
  id: string;
  sendFn: () => Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
}

/**
 * Hook to ensure messages are sent in strict order.
 * Queues message send operations and processes them sequentially.
 */
export function useMessageQueue() {
  const queueRef = useRef<QueuedMessage[]>([]);
  const isProcessingRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current || queueRef.current.length === 0) return;
    
    isProcessingRef.current = true;
    
    while (queueRef.current.length > 0) {
      const item = queueRef.current[0];
      
      try {
        await item.sendFn();
        item.resolve();
      } catch (error) {
        item.reject(error instanceof Error ? error : new Error(String(error)));
      }
      
      // Remove processed item
      queueRef.current.shift();
    }
    
    isProcessingRef.current = false;
  }, []);

  /**
   * Enqueues a message send operation.
   * Returns a promise that resolves when the message is actually sent.
   * Messages are guaranteed to be sent in the order they were enqueued.
   */
  const enqueue = useCallback((sendFn: () => Promise<void>): Promise<void> => {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      queueRef.current.push({ id, sendFn, resolve, reject });
      
      // Start processing if not already running
      processQueue();
    });
  }, [processQueue]);

  /**
   * Clears the queue (for cleanup on unmount or conversation change)
   */
  const clearQueue = useCallback(() => {
    queueRef.current = [];
    isProcessingRef.current = false;
  }, []);

  return { enqueue, clearQueue };
}
