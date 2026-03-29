import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

type Conversation = {
  id: number;
  name: string;
  status: string;
  badge: string;
  privacy: string;
  preview: string;
  unread: number;
};

type ChatMessage = {
  id: number;
  sender: string;
  text: string;
  time: string;
  mine?: boolean;
};

type ChatServerState = {
  conversations: Conversation[];
  messagesByConversation: Record<number, ChatMessage[]>;
};

type UiState = {
  activeConversationId: number;
  draft: string;
};

const UI_STORAGE_KEY = 'hybechat.ui-state.v2';

const conversations: Conversation[] = [
  {
    id: 1,
    name: 'ARMY Lounge',
    status: '5.2k active now',
    badge: 'Community',
    privacy: 'End-to-end encrypted',
    preview: 'Streaming party starts in 10 minutes.',
    unread: 3,
  },
  {
    id: 2,
    name: 'Bias Chat',
    status: 'Members online',
    badge: 'Private',
    privacy: 'Hidden read receipts',
    preview: 'Share your favorite stage photos here.',
    unread: 1,
  },
  {
    id: 3,
    name: 'Comeback Countdown',
    status: 'Pinned channel',
    badge: 'Secure',
    privacy: 'Forward secrecy enabled',
    preview: 'We need a final schedule for listening party.',
    unread: 0,
  },
];

const initialMessages: Record<number, ChatMessage[]> = {
  1: [
    { id: 1, sender: 'Mina', text: 'Did everyone get the reminder for tonight?', time: '09:10' },
    { id: 2, sender: 'Jae', text: 'Yes — I shared the playlist link already.', time: '09:12' },
    { id: 3, sender: 'You', text: 'I can host the countdown room and keep it locked.', time: '09:14', mine: true },
  ],
  2: [
    { id: 1, sender: 'Sora', text: 'Please keep this thread invite-only.', time: '08:45' },
    { id: 2, sender: 'You', text: 'Confirmed. Messages stay private by default.', time: '08:47', mine: true },
  ],
  3: [
    { id: 1, sender: 'Hana', text: 'Drafted the comeback reminders and schedule.', time: '10:02' },
    { id: 2, sender: 'You', text: 'Perfect — I will pin the final version tonight.', time: '10:04', mine: true },
  ],
};

function loadUiState(): UiState {
  if (typeof window === 'undefined') {
    return {
      activeConversationId: 1,
      draft: '',
    };
  }

  const storedState = window.localStorage.getItem(UI_STORAGE_KEY);

  if (!storedState) {
    return {
      activeConversationId: 1,
      draft: '',
    };
  }

  try {
    return JSON.parse(storedState) as UiState;
  } catch {
    return {
      activeConversationId: 1,
      draft: '',
    };
  }
}

function App() {
  const persistedUiState = loadUiState();
  const [activeConversationId, setActiveConversationId] = useState(persistedUiState.activeConversationId);
  const [draft, setDraft] = useState(persistedUiState.draft);
  const [messagesByConversation, setMessagesByConversation] = useState(initialMessages);
  const [syncStatus, setSyncStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const messageStreamRef = useRef<HTMLElement | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0],
    [activeConversationId],
  );

  const activeMessages = messagesByConversation[activeConversationId] ?? [];

  useEffect(() => {
    window.localStorage.setItem(
      UI_STORAGE_KEY,
      JSON.stringify({
        activeConversationId,
        draft,
      }),
    );
  }, [activeConversationId, draft]);

  useEffect(() => {
    let isMounted = true;

    const loadChatState = async () => {
      try {
        const response = await fetch('/api/chat-state');

        if (!response.ok) {
          throw new Error('Failed to load chat state');
        }

        const data = (await response.json()) as ChatServerState;

        if (!isMounted) {
          return;
        }

        setMessagesByConversation(data.messagesByConversation);
        setSyncStatus('online');
      } catch {
        if (!isMounted) {
          return;
        }

        setMessagesByConversation(initialMessages);
        setSyncStatus('offline');
      }
    };

    void loadChatState();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const messageStream = messageStreamRef.current;

    if (messageStream) {
      messageStream.scrollTop = messageStream.scrollHeight;
    }
  }, [activeConversationId, activeMessages.length]);

  const handleResetLocalData = async () => {
    window.localStorage.removeItem(UI_STORAGE_KEY);
    setActiveConversationId(1);
    setDraft('');

    try {
      const response = await fetch('/api/chat-reset', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to reset server state');
      }

      const data = (await response.json()) as ChatServerState;
      setMessagesByConversation(data.messagesByConversation);
      setSyncStatus('online');
    } catch {
      setMessagesByConversation(initialMessages);
      setSyncStatus('offline');
    }
  };

  const handleSendMessage = async () => {
    const trimmedDraft = draft.trim();

    if (!trimmedDraft) {
      return;
    }

    try {
      const response = await fetch('/api/chat-messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: activeConversationId,
          text: trimmedDraft,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = (await response.json()) as ChatServerState;
      setMessagesByConversation(data.messagesByConversation);
      setSyncStatus('online');
    } catch {
      const nextMessage: ChatMessage = {
        id: activeMessages.length + 1,
        sender: 'You',
        text: trimmedDraft,
        time: 'Now',
        mine: true,
      };

      setMessagesByConversation((currentMessages) => ({
        ...currentMessages,
        [activeConversationId]: [...(currentMessages[activeConversationId] ?? []), nextMessage],
      }));
      setSyncStatus('offline');
    }

    setDraft('');
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void handleSendMessage();
    }
  };

  const statusLabel = syncStatus === 'online' ? 'Live sync' : syncStatus === 'offline' ? 'Offline fallback' : 'Connecting...';

  return (
    <div className="app-shell">
      <aside className="sidebar-panel">
        <div className="sidebar-header">
          <div>
            <p className="eyebrow">HYBECHAT</p>
            <h1 className="app-title">Private fan messaging</h1>
          </div>
          <span className="status-pill">{statusLabel}</span>
        </div>

        <button type="button" className="reset-button" onClick={handleResetLocalData}>
          Reset local demo
        </button>

        <div className="profile-card">
          <div>
            <p className="profile-label">Secure profile</p>
            <h2 className="profile-name">ARMY Seokjin</h2>
          </div>
          <p className="profile-copy">Messages are protected with end-to-end encryption and hidden receipts.</p>
        </div>

        <div className="conversation-list">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              className={`conversation-item ${conversation.id === activeConversationId ? 'is-active' : ''}`}
              onClick={() => setActiveConversationId(conversation.id)}
            >
              <div className="conversation-avatar">{conversation.name.slice(0, 2).toUpperCase()}</div>
              <div className="conversation-copy">
                <div className="conversation-row">
                  <h3 className="conversation-name">{conversation.name}</h3>
                  <span className="conversation-badge">{conversation.badge}</span>
                </div>
                <p className="conversation-preview">{conversation.preview}</p>
                <div className="conversation-meta">
                  <span>{conversation.status}</span>
                  <span>{conversation.privacy}</span>
                </div>
              </div>
              {conversation.unread > 0 ? <span className="unread-count">{conversation.unread}</span> : null}
            </button>
          ))}
        </div>
      </aside>

      <main className="chat-panel">
        <header className="chat-header">
          <div>
            <p className="chat-label">Current room</p>
            <h2 className="chat-room-name">{activeConversation.name}</h2>
          </div>
          <div className="chat-header-meta">
            <span className="privacy-chip">{activeConversation.privacy}</span>
            <span className="privacy-chip muted">Hidden metadata</span>
          </div>
        </header>

        <section className="message-stream" aria-label="Messages" ref={messageStreamRef}>
          {activeMessages.map((message) => (
            <article key={message.id} className={`message-bubble ${message.mine ? 'mine' : 'theirs'}`}>
              <div className="message-topline">
                <strong>{message.sender}</strong>
                <span>{message.time}</span>
              </div>
              <p>{message.text}</p>
            </article>
          ))}
        </section>

        <footer className="composer-bar">
          <label className="composer-field" htmlFor="message-input">
            <span className="composer-label">Send a secure message</span>
            <textarea
              id="message-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Type a message to the room..."
              rows={3}
            />
            <span className="composer-hint">Press Ctrl/⌘ + Enter to send</span>
          </label>
          <button type="button" className="send-button" onClick={() => void handleSendMessage()} disabled={!draft.trim()}>
            Send
          </button>
        </footer>
      </main>

      <aside className="insights-panel">
        <section className="security-card">
          <p className="eyebrow">Privacy</p>
          <h3>Protection first</h3>
          <ul className="security-list">
            <li>End-to-end encrypted messages</li>
            <li>Hidden read status by default</li>
            <li>Invite-only fan rooms</li>
            <li>Metadata-minimizing chat design</li>
          </ul>
        </section>

        <section className="security-card highlight-card">
          <p className="eyebrow">ARMY spaces</p>
          <h3>Built for fan communities</h3>
          <p>
            Organize comeback chats, private bias groups, and shared watch parties without exposing your conversation history.
          </p>
        </section>
      </aside>
    </div>
  );
}

export default App;
