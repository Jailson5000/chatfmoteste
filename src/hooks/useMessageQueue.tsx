import { useRef, useCallback } from "react";

interface QueuedMessage {
  id: string;
  sendFn: () => Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
}

interface ConversationQueue {
  queue: QueuedMessage[];
  isProcessing: boolean;
}

/**
 * Hook to ensure messages are sent in strict order PER CONVERSATION.
 * Each conversation has its own independent queue, allowing parallel
 * message sending across different conversations while maintaining
 * sequential order within each conversation.
 * 
 * This supports multi-tenant, multi-agent scenarios where multiple
 * operators can send messages to different clients simultaneously.
 */
export function useMessageQueue() {
  // Map of conversation ID -> queue state
  const queuesRef = useRef<Map<string, ConversationQueue>>(new Map());

  const getOrCreateQueue = useCallback((conversationId: string): ConversationQueue => {
    let queue = queuesRef.current.get(conversationId);
    if (!queue) {
      queue = { queue: [], isProcessing: false };
      queuesRef.current.set(conversationId, queue);
    }
    return queue;
  }, []);

  const processQueue = useCallback(async (conversationId: string) => {
    const queueState = queuesRef.current.get(conversationId);
    if (!queueState || queueState.isProcessing || queueState.queue.length === 0) return;
    
    queueState.isProcessing = true;
    
    while (queueState.queue.length > 0) {
      const item = queueState.queue[0];
      
      try {
        await item.sendFn();
        item.resolve();
      } catch (error) {
        item.reject(error instanceof Error ? error : new Error(String(error)));
      }
      
      // Remove processed item
      queueState.queue.shift();
    }
    
    queueState.isProcessing = false;
    
    // Clean up empty queues to prevent memory leaks
    if (queueState.queue.length === 0) {
      queuesRef.current.delete(conversationId);
    }
  }, []);

  /**
   * Enqueues a message send operation for a specific conversation.
   * Returns a promise that resolves when the message is actually sent.
   * Messages within the SAME conversation are guaranteed to be sent in order.
   * Messages to DIFFERENT conversations can be sent in parallel.
   */
  const enqueue = useCallback((conversationId: string, sendFn: () => Promise<void>): Promise<void> => {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const queueState = getOrCreateQueue(conversationId);
      
      queueState.queue.push({ id, sendFn, resolve, reject });
      
      // Start processing if not already running for this conversation
      processQueue(conversationId);
    });
  }, [getOrCreateQueue, processQueue]);

  /**
   * Clears the queue for a specific conversation
   */
  const clearQueue = useCallback((conversationId: string) => {
    queuesRef.current.delete(conversationId);
  }, []);

  /**
   * Clears all queues (for cleanup on unmount)
   */
  const clearAllQueues = useCallback(() => {
    queuesRef.current.clear();
  }, []);

  return { enqueue, clearQueue, clearAllQueues };
}
