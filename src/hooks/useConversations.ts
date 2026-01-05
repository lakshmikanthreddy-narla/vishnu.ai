import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface Conversation {
  id: string;
  app_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  tokens_used: number;
  created_at: string;
}

export function useConversations(appId: string | undefined) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch all conversations for this app
  const fetchConversations = useCallback(async () => {
    if (!user || !appId) return;

    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('app_id', appId)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error('[Conversations] Failed to fetch:', error);
    }
  }, [user, appId]);

  // Load conversations on mount
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Fetch messages for a conversation
  const loadConversation = useCallback(async (conversationId: string) => {
    if (!user) return;

    setIsLoading(true);
    try {
      // Get conversation details
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .single();

      if (convError) throw convError;
      setCurrentConversation(conv);

      // Get messages
      const { data: msgs, error: msgsError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (msgsError) throw msgsError;
      setMessages((msgs || []).map(m => ({
        ...m,
        role: m.role as 'user' | 'assistant'
      })));
    } catch (error) {
      console.error('[Conversations] Failed to load conversation:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Create a new conversation
  const createConversation = useCallback(async (title?: string): Promise<Conversation | null> => {
    if (!user || !appId) return null;

    try {
      const { data, error } = await supabase
        .from('conversations')
        .insert({
          app_id: appId,
          user_id: user.id,
          title: title || 'New Conversation',
        })
        .select()
        .single();

      if (error) throw error;
      
      setConversations(prev => [data, ...prev]);
      setCurrentConversation(data);
      setMessages([]);
      
      return data;
    } catch (error) {
      console.error('[Conversations] Failed to create:', error);
      return null;
    }
  }, [user, appId]);

  // Save a message to the database
  const saveMessage = useCallback(async (
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    tokens?: number
  ): Promise<ChatMessage | null> => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          role,
          content,
          tokens_used: tokens || 0,
        })
        .select()
        .single();

      if (error) throw error;

      // Update conversation's updated_at
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      const message: ChatMessage = {
        ...data,
        role: data.role as 'user' | 'assistant'
      };

      return message;
    } catch (error) {
      console.error('[Conversations] Failed to save message:', error);
      return null;
    }
  }, [user]);

  // Update conversation title
  const updateTitle = useCallback(async (conversationId: string, title: string) => {
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ title })
        .eq('id', conversationId);

      if (error) throw error;

      setConversations(prev =>
        prev.map(c => c.id === conversationId ? { ...c, title } : c)
      );

      if (currentConversation?.id === conversationId) {
        setCurrentConversation(prev => prev ? { ...prev, title } : null);
      }
    } catch (error) {
      console.error('[Conversations] Failed to update title:', error);
    }
  }, [currentConversation]);

  // Delete a conversation
  const deleteConversation = useCallback(async (conversationId: string) => {
    try {
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId);

      if (error) throw error;

      setConversations(prev => prev.filter(c => c.id !== conversationId));

      if (currentConversation?.id === conversationId) {
        setCurrentConversation(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('[Conversations] Failed to delete:', error);
    }
  }, [currentConversation]);

  // Start a new chat (clear current)
  const startNewChat = useCallback(() => {
    setCurrentConversation(null);
    setMessages([]);
  }, []);

  return {
    conversations,
    currentConversation,
    messages,
    isLoading,
    fetchConversations,
    loadConversation,
    createConversation,
    saveMessage,
    updateTitle,
    deleteConversation,
    startNewChat,
    setMessages,
  };
}
