// Main export - re-exports the existing Conversations component
// This maintains backward compatibility with existing imports

// NOTE: This is the first step of the modular refactoring.
// The full Conversations.tsx will be gradually split into:
// - ConversationsSidebar.tsx (conversation list)
// - ConversationsChat.tsx (message area)
// - ConversationsHeader.tsx (header with filters)
// - dialogs/ (Archive, Summary, EditName, InstanceChange)
// - hooks/ (useConversationsState, useConversationsFilters, useConversationsHandlers)
//
// For now, we export the original component to maintain functionality
// and gradually migrate pieces to the new modular structure.

export { default } from '../Conversations';
