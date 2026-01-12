/**
 * Human-like delay utilities for WhatsApp message sending
 * 
 * Implements random jitter between 7-15 seconds to:
 * - Simulate human typing behavior
 * - Reduce burst sending patterns
 * - Avoid WhatsApp rate limiting and spam detection
 */

/**
 * Generates a random delay between min and max milliseconds
 * @param minMs Minimum delay in milliseconds (default: 7000ms = 7s)
 * @param maxMs Maximum delay in milliseconds (default: 15000ms = 15s)
 * @returns Random delay in milliseconds
 */
export function getRandomJitter(minMs = 7000, maxMs = 15000): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/**
 * Waits for a random human-like delay
 * @param minMs Minimum delay in milliseconds (default: 7000ms = 7s)
 * @param maxMs Maximum delay in milliseconds (default: 15000ms = 15s)
 * @param logPrefix Optional prefix for logging
 * @returns Promise that resolves after the random delay
 */
export async function humanDelay(
  minMs = 7000, 
  maxMs = 15000, 
  logPrefix = '[HumanDelay]'
): Promise<number> {
  const delay = getRandomJitter(minMs, maxMs);
  console.log(`${logPrefix} Waiting ${(delay / 1000).toFixed(1)}s (human-like jitter)`);
  await new Promise((resolve) => setTimeout(resolve, delay));
  return delay;
}

/**
 * Calculates typing simulation delay based on message length
 * Shorter messages = shorter delay, longer messages = longer delay
 * Combined with base jitter for realistic behavior
 * 
 * @param messageLength Length of the message in characters
 * @param includeBaseJitter Whether to include the base 7-15s jitter (default: true)
 * @returns Total delay in milliseconds
 */
export function getTypingDelay(messageLength: number, includeBaseJitter = true): number {
  // ~30ms per character for typing simulation (average human types ~40 WPM)
  // Capped at 3 seconds for very long messages
  const typingTime = Math.min(messageLength * 30, 3000);
  
  if (includeBaseJitter) {
    return typingTime + getRandomJitter();
  }
  
  return typingTime;
}

/**
 * Waits with typing simulation delay
 * @param messageLength Length of the message
 * @param includeBaseJitter Whether to include base jitter
 * @param logPrefix Optional log prefix
 */
export async function typingDelay(
  messageLength: number,
  includeBaseJitter = true,
  logPrefix = '[TypingDelay]'
): Promise<number> {
  const delay = getTypingDelay(messageLength, includeBaseJitter);
  console.log(`${logPrefix} Simulating typing for ${(delay / 1000).toFixed(1)}s (${messageLength} chars)`);
  await new Promise((resolve) => setTimeout(resolve, delay));
  return delay;
}

/**
 * Delay between multiple message parts in a split response
 * Shorter than full jitter since messages are part of the same response
 * @param partIndex Which part number (0-indexed)
 * @param totalParts Total number of parts
 */
export async function messageSplitDelay(
  partIndex: number, 
  totalParts: number,
  logPrefix = '[MessageSplit]'
): Promise<number> {
  // First message has no delay
  if (partIndex === 0) return 0;
  
  // Subsequent parts get 3-7 second delay (shorter than full jitter)
  const delay = getRandomJitter(3000, 7000);
  console.log(`${logPrefix} Part ${partIndex + 1}/${totalParts} - waiting ${(delay / 1000).toFixed(1)}s`);
  await new Promise((resolve) => setTimeout(resolve, delay));
  return delay;
}

/**
 * Configuration for different sending scenarios
 */
export const DELAY_CONFIG = {
  // Human operator sending manual messages - minimal delay
  MANUAL_SEND: { min: 0, max: 0 },
  
  // AI/automation responses - full human-like jitter
  AI_RESPONSE: { min: 7000, max: 15000 },
  
  // Follow-up messages - moderate delay
  FOLLOW_UP: { min: 5000, max: 12000 },
  
  // Birthday/promotional messages - longer delay to avoid spam detection
  PROMOTIONAL: { min: 10000, max: 20000 },
  
  // Appointment reminders - moderate delay
  REMINDER: { min: 5000, max: 10000 },
  
  // Between parts of a split message - shorter delay
  SPLIT_MESSAGE: { min: 3000, max: 7000 },
  
  // Audio chunks - short pacing
  AUDIO_CHUNK: { min: 800, max: 1500 },
} as const;

/**
 * Generic delay with predefined configuration
 */
export async function delayWithConfig(
  config: { min: number; max: number },
  logPrefix = '[Delay]'
): Promise<number> {
  if (config.min === 0 && config.max === 0) return 0;
  return humanDelay(config.min, config.max, logPrefix);
}
