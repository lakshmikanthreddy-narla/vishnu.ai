import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { 
  Loader2, 
  ArrowLeft, 
  Send, 
  Settings, 
  Trash2,
  Bot,
  User,
  Copy,
  Check,
  Paperclip,
  PanelLeftClose,
  PanelLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlaygroundModeSelector, PlaygroundMode } from '@/components/playground/PlaygroundModeSelector';
import { ImagePlayground } from '@/components/playground/ImagePlayground';
import { VideoPlayground } from '@/components/playground/VideoPlayground';
import { FileUploader } from '@/components/playground/FileUploader';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ConversationSidebar } from '@/components/playground/ConversationSidebar';
import { useConversations } from '@/hooks/useConversations';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tokens?: number;
  attachments?: { url: string; name: string }[];
}

interface AIApp {
  id: string;
  name: string;
  model: string;
  system_prompt: string;
  temperature: number;
  max_tokens: number;
}

const Playground = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [app, setApp] = useState<AIApp | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [mode, setMode] = useState<PlaygroundMode>('chat');
  const [attachedFiles, setAttachedFiles] = useState<{ url: string; name: string }[]>([]);
  const [showAttachPopover, setShowAttachPopover] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Conversation management
  const {
    conversations,
    currentConversation,
    messages: savedMessages,
    isLoading: isLoadingConversation,
    loadConversation,
    createConversation,
    saveMessage,
    updateTitle,
    deleteConversation,
    startNewChat,
    setMessages: setSavedMessages,
  } = useConversations(id);

  // Convert saved messages to UI format
  const [localMessages, setLocalMessages] = useState<Message[]>([]);

  useEffect(() => {
    setLocalMessages(
      savedMessages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
      }))
    );
  }, [savedMessages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [localMessages]);

  useEffect(() => {
    const fetchApp = async () => {
      if (!id || !user) return;

      try {
        const { data, error } = await supabase
          .from('ai_apps')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          toast({
            variant: 'destructive',
            title: 'App not found',
          });
          return;
        }

        setApp({
          id: data.id,
          name: data.name,
          model: data.model,
          system_prompt: data.system_prompt || '',
          temperature: Number(data.temperature) || 0.7,
          max_tokens: data.max_tokens || 2048,
        });
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Error loading app',
          description: error.message,
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchApp();
  }, [id, user, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !app || isStreaming) return;

    const userContent = input.trim();
    setInput('');
    setIsStreaming(true);

    // Create conversation if this is first message
    let conversationId = currentConversation?.id;
    if (!conversationId) {
      const newConv = await createConversation(userContent.slice(0, 50));
      if (!newConv) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to create conversation',
        });
        setIsStreaming(false);
        return;
      }
      conversationId = newConv.id;
    }

    // Add user message to UI immediately
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userContent,
      attachments: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
    };
    setLocalMessages((prev) => [...prev, userMessage]);
    setAttachedFiles([]);

    // Save user message to database
    await saveMessage(conversationId, 'user', userContent);

    // Add placeholder for assistant
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
    };
    setLocalMessages((prev) => [...prev, assistantMessage]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Please log in to use the chat');
      }

      // Build message content with attachments
      const messageContent = userMessage.attachments?.length
        ? [
            { type: 'text', text: userMessage.content },
            ...userMessage.attachments.map((att) => ({
              type: 'image_url',
              image_url: { url: att.url },
            })),
          ]
        : userMessage.content;

      // Get all messages for context (excluding the current placeholder)
      const contextMessages = localMessages
        .filter((m) => m.id !== assistantMessage.id)
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            appId: app.id,
            messages: [...contextMessages, { role: 'user', content: messageContent }],
            model: app.model,
            systemPrompt: app.system_prompt,
            temperature: app.temperature,
            maxTokens: app.max_tokens,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        }
        if (response.status === 402) {
          throw new Error('Payment required. Please check your API usage.');
        }
        throw new Error(errorData.error || 'Failed to get response');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let content = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                content += delta;
                setLocalMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id ? { ...m, content } : m
                  )
                );
              }
            } catch {
              // Ignore JSON parse errors for partial chunks
            }
          }
        }
      }

      // Save assistant message to database
      if (content) {
        await saveMessage(conversationId, 'assistant', content);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
      setLocalMessages((prev) => prev.filter((m) => m.id !== assistantMessage.id));
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const clearChat = () => {
    startNewChat();
    setLocalMessages([]);
  };

  const copyMessage = async (content: string, id: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleFilesAttached = (files: { id: string; url: string; name: string }[]) => {
    setAttachedFiles((prev) => [...prev, ...files.map((f) => ({ url: f.url, name: f.name }))]);
    setShowAttachPopover(false);
  };

  const removeAttachment = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSelectConversation = (convId: string) => {
    loadConversation(convId);
  };

  const handleNewConversation = () => {
    startNewChat();
    setLocalMessages([]);
  };

  const handleDeleteConversation = async (convId: string) => {
    await deleteConversation(convId);
    toast({
      title: 'Conversation deleted',
    });
  };

  const handleRenameConversation = async (convId: string, title: string) => {
    await updateTitle(convId, title);
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!app) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground mb-4">App not found</p>
          <Button asChild>
            <Link to="/dashboard">Go to Dashboard</Link>
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen">
        {/* Conversation Sidebar */}
        {mode === 'chat' && showSidebar && (
          <div className="w-64 flex-shrink-0 hidden md:block">
            <ConversationSidebar
              conversations={conversations}
              currentConversationId={currentConversation?.id || null}
              onSelectConversation={handleSelectConversation}
              onNewConversation={handleNewConversation}
              onDeleteConversation={handleDeleteConversation}
              onRenameConversation={handleRenameConversation}
            />
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="border-b border-border p-4 flex items-center justify-between bg-card">
            <div className="flex items-center gap-4">
              {mode === 'chat' && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowSidebar(!showSidebar)}
                  className="hidden md:flex"
                >
                  {showSidebar ? (
                    <PanelLeftClose className="h-5 w-5" />
                  ) : (
                    <PanelLeft className="h-5 w-5" />
                  )}
                </Button>
              )}
              <Link
                to="/dashboard"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="font-semibold">{app.name}</h1>
                <p className="text-xs text-muted-foreground">
                  {currentConversation ? currentConversation.title : app.model}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <PlaygroundModeSelector mode={mode} onModeChange={setMode} />
              
              {mode === 'chat' && (
                <Button variant="outline" size="sm" onClick={clearChat} disabled={localMessages.length === 0}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              )}
              <Button variant="outline" size="sm" asChild>
                <Link to={`/apps/${id}/settings`}>
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Link>
              </Button>
            </div>
          </div>

          {/* Content based on mode */}
          {mode === 'chat' && (
            <>
              {/* Messages */}
              <ScrollArea className="flex-1">
                <div className="max-w-3xl mx-auto py-6 px-4">
                  {isLoadingConversation ? (
                    <div className="flex items-center justify-center py-20">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : localMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <div className="h-16 w-16 rounded-2xl gradient-primary flex items-center justify-center mb-6">
                        <Bot className="h-8 w-8 text-primary-foreground" />
                      </div>
                      <h2 className="text-xl font-semibold mb-2">Start a conversation</h2>
                      <p className="text-muted-foreground max-w-md">
                        Send a message to test your AI app. Your chat history will be saved automatically.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {localMessages.map((message) => (
                        <div
                          key={message.id}
                          className={cn(
                            'flex gap-4 animate-fade-in',
                            message.role === 'user' ? 'justify-end' : 'justify-start'
                          )}
                        >
                          {message.role === 'assistant' && (
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <Bot className="h-4 w-4 text-primary" />
                            </div>
                          )}
                          <div
                            className={cn(
                              'group relative max-w-[85%] rounded-2xl px-4 py-3',
                              message.role === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                            )}
                          >
                            {/* Attachments */}
                            {message.attachments && message.attachments.length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-2">
                                {message.attachments.map((att, idx) => (
                                  <img
                                    key={idx}
                                    src={att.url}
                                    alt={att.name}
                                    className="w-20 h-20 object-cover rounded-lg"
                                  />
                                ))}
                              </div>
                            )}
                            <div className="whitespace-pre-wrap text-sm">{message.content}</div>
                            {message.content && (
                              <button
                                onClick={() => copyMessage(message.content, message.id)}
                                className={cn(
                                  'absolute -bottom-8 right-0 opacity-0 group-hover:opacity-100 transition-opacity',
                                  'text-xs text-muted-foreground hover:text-foreground flex items-center gap-1'
                                )}
                              >
                                {copiedId === message.id ? (
                                  <>
                                    <Check className="h-3 w-3" /> Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3" /> Copy
                                  </>
                                )}
                              </button>
                            )}
                            {message.role === 'assistant' && !message.content && isStreaming && (
                              <div className="flex gap-1">
                                <span className="h-2 w-2 rounded-full bg-primary animate-pulse-soft" />
                                <span className="h-2 w-2 rounded-full bg-primary animate-pulse-soft [animation-delay:0.2s]" />
                                <span className="h-2 w-2 rounded-full bg-primary animate-pulse-soft [animation-delay:0.4s]" />
                              </div>
                            )}
                          </div>
                          {message.role === 'user' && (
                            <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                              <User className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Input */}
              <div className="border-t border-border p-4 bg-card">
                <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
                  {/* Attached files preview */}
                  {attachedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {attachedFiles.map((file, idx) => (
                        <div key={idx} className="relative group">
                          <img
                            src={file.url}
                            alt={file.name}
                            className="w-16 h-16 object-cover rounded-lg border border-border"
                          />
                          <button
                            type="button"
                            onClick={() => removeAttachment(idx)}
                            className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="relative flex items-end gap-2">
                    <Popover open={showAttachPopover} onOpenChange={setShowAttachPopover}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="flex-shrink-0"
                          disabled={isStreaming}
                        >
                          <Paperclip className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80" align="start">
                        <FileUploader
                          onFilesUploaded={handleFilesAttached}
                          maxFiles={4}
                        />
                      </PopoverContent>
                    </Popover>

                    <div className="flex-1 relative">
                      <Textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Send a message..."
                        className="min-h-[52px] max-h-32 pr-12 resize-none"
                        disabled={isStreaming}
                      />
                      <Button
                        type="submit"
                        size="icon"
                        className="absolute right-2 bottom-2 h-8 w-8"
                        disabled={!input.trim() || isStreaming}
                      >
                        {isStreaming ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </form>
              </div>
            </>
          )}

          {mode === 'image' && (
            <ImagePlayground appId={app.id} />
          )}

          {mode === 'video' && (
            <VideoPlayground appId={app.id} />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Playground;
