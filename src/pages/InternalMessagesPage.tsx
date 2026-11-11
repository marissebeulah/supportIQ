import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocation } from "react-router-dom";
import { ChevronLeft, MessageSquarePlus, Plus, Search, Send, UsersRound, X } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { formatTime } from "../lib/format";
import { useApi, useRealtime, useTitle } from "../lib/hooks";
import { useAuth } from "../lib/auth";
import type { InternalChat, InternalChatMessage, InternalChatPerson } from "../lib/types";
import { Avatar, Button, ErrorNote, SkeletonRows, Spinner } from "../components/ui";

type ChatListResponse = { chats: InternalChat[] };
type PeopleResponse = { people: InternalChatPerson[] };
type ChatDetailResponse = { chat: InternalChat; messages: InternalChatMessage[] };

export default function InternalMessagesPage() {
  useTitle("Team messages");
  const { user } = useAuth();
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const handledUserId = useRef("");
  const chatsQuery = useApi<ChatListResponse>(() => api.get<ChatListResponse>("/api/internal-messages/chats"));
  const peopleQuery = useApi<PeopleResponse>(() => api.get<PeopleResponse>("/api/internal-messages/people"));
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [composer, setComposer] = useState<"direct" | "group" | null>(null);
  const [composerClosing, setComposerClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [groupTitle, setGroupTitle] = useState("");
  const [filter, setFilter] = useState("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detailQuery = useApi<ChatDetailResponse>(
    () => api.get<ChatDetailResponse>(`/api/internal-messages/chats/${selectedChatId}`),
    [selectedChatId],
    { enabled: selectedChatId !== null },
  );
  const chats = chatsQuery.data?.chats ?? [];
  const people = peopleQuery.data?.people ?? [];
  const messages = detailQuery.data?.messages ?? [];
  const activeChat = detailQuery.data?.chat ?? null;
  const filteredChats = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return chats;
    return chats.filter((chat) =>
      `${chat.title} ${chat.members.map((member) => member.name).join(" ")} ${chat.lastMessage?.body ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [chats, filter]);

  useRealtime((event) => {
    if (event.type !== "internal-message") return;
    chatsQuery.reload();
    if (event.chatId === selectedChatId) detailQuery.reload();
  });

  useEffect(() => {
    const targetId = new URLSearchParams(location.search).get("userId");
    if (!targetId || !peopleQuery.data || handledUserId.current === targetId) return;
    const person = people.find((item) => item.id === Number(targetId));
    if (!person) return;
    handledUserId.current = targetId;
    api
      .post<{ chat: InternalChat }>("/api/internal-messages/direct", { userId: person.id })
      .then(({ chat }) => {
        setSelectedChatId(chat.id);
        chatsQuery.reload();
      })
      .catch((openError) => setError(errorMessage(openError)));
  }, [location.search, people, peopleQuery.data]);

  useEffect(() => {
    if (selectedChatId === null) return;
    api
      .patch(`/api/internal-messages/chats/${selectedChatId}/read`)
      .then(() => chatsQuery.reload())
      .catch(() => undefined);
  }, [selectedChatId]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages]);

  const openComposer = (kind: "direct" | "group") => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setComposerClosing(false);
    setError(null);
    setSelectedPersonId("");
    setSelectedMemberIds([]);
    setGroupTitle("");
    setComposer(kind);
  };

  const closeComposer = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setComposer(null);
      setComposerClosing(false);
      closeTimer.current = null;
      return;
    }
    setComposerClosing(true);
    closeTimer.current = window.setTimeout(() => {
      setComposer(null);
      setComposerClosing(false);
      closeTimer.current = null;
    }, 140);
  };

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
  }, []);

  const startDirect = async () => {
    if (!selectedPersonId || creating) return;
    setCreating(true);
    setError(null);
    try {
      const { chat } = await api.post<{ chat: InternalChat }>("/api/internal-messages/direct", {
        userId: Number(selectedPersonId),
      });
      setSelectedChatId(chat.id);
      chatsQuery.reload();
      closeComposer();
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setCreating(false);
    }
  };

  const startGroup = async () => {
    if (!groupTitle.trim() || selectedMemberIds.length === 0 || creating) return;
    setCreating(true);
    setError(null);
    try {
      const { chat } = await api.post<{ chat: InternalChat }>("/api/internal-messages/groups", {
        title: groupTitle,
        memberIds: selectedMemberIds,
      });
      setSelectedChatId(chat.id);
      chatsQuery.reload();
      closeComposer();
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setCreating(false);
    }
  };

  const send = async () => {
    const body = input.trim();
    if (!body || !selectedChatId || sending) return;
    setSending(true);
    setError(null);
    try {
      await api.post(`/api/internal-messages/chats/${selectedChatId}/messages`, { body });
      setInput("");
      detailQuery.reload();
      chatsQuery.reload();
    } catch (sendError) {
      setError(errorMessage(sendError));
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  const toggleMember = (memberId: number) => {
    setSelectedMemberIds((current) =>
      current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId],
    );
  };

  return (
    <>
      {error ? <ErrorNote message={error} /> : null}

      <div className={`internal-messages ${selectedChatId !== null ? "has-selection" : ""}`}>
        <aside className={`internal-chat-list ${selectedChatId !== null ? "is-hidden-mobile" : ""}`} aria-label="Team conversations">
          <div className="internal-list-head">
            <h2>Chats</h2>
            <div className="internal-list-actions">
              <button
                type="button"
                className="internal-head-action"
                onClick={() => openComposer("direct")}
                aria-label="New message"
                title="New message"
              >
                <MessageSquarePlus size={19} />
              </button>
              <button
                type="button"
                className="internal-head-action"
                onClick={() => openComposer("group")}
                aria-label="New group"
                title="New group"
              >
                <UsersRound size={19} />
              </button>
            </div>
          </div>
          <label className="internal-search">
            <Search size={16} />
            <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search chats" aria-label="Search chats" />
          </label>

          {chatsQuery.loading && !chatsQuery.data ? <SkeletonRows rows={5} /> : null}
          {chatsQuery.error ? <ErrorNote message={chatsQuery.error} /> : null}
          <div className="internal-chat-items">
            {filteredChats.map((chat) => {
              const other = chat.type === "direct" ? chat.members.find((member) => member.id !== user?.id) : null;
              const preview = chat.lastMessage
                ? `${chat.lastMessage.sender.id === user?.id ? "You: " : ""}${chat.lastMessage.body}`
                : chat.type === "group"
                  ? `${chat.members.length} members`
                  : other?.email ?? "Start a conversation";
              return (
                <button
                  key={chat.id}
                  type="button"
                  className={`internal-chat-item ${chat.id === selectedChatId ? "is-active" : ""} ${chat.unreadCount ? "is-unread" : ""}`.trim()}
                  onClick={() => setSelectedChatId(chat.id)}
                >
                  <Avatar name={chat.title} size="lg" className="internal-item-avatar" />
                  <span className="internal-item-copy">
                    <span className="internal-item-top">
                      <span className="internal-item-title">{chat.title}</span>
                      {chat.lastMessage ? <span className="internal-item-time">{formatTime(chat.lastMessage.createdAt)}</span> : null}
                    </span>
                    <span className="internal-item-bottom">
                      <span className="internal-item-preview">{preview}</span>
                      {chat.unreadCount ? <span className="internal-unread">{chat.unreadCount}</span> : null}
                    </span>
                  </span>
                </button>
              );
            })}
            {!filteredChats.length && !chatsQuery.loading ? (
              <p className="internal-list-empty">No conversations yet. Start a private message or create a group.</p>
            ) : null}
          </div>
        </aside>

        <section className={`internal-chat-window ${selectedChatId === null ? "is-empty" : ""}`} aria-label="Message conversation">
          {selectedChatId === null ? (
            <div className="internal-empty-state">
              <span className="internal-empty-icon"><MessageSquarePlus size={20} /></span>
              <h2>Make room for a quick conversation</h2>
              <p>Message an IT teammate or start a group for the team.</p>
              <div className="internal-empty-actions">
                <Button variant="secondary" onClick={() => openComposer("direct")}><MessageSquarePlus size={15} /> New message</Button>
                <Button variant="ghost" onClick={() => openComposer("group")}><UsersRound size={15} /> New group</Button>
              </div>
            </div>
          ) : detailQuery.loading && !detailQuery.data ? (
            <Spinner label="Opening conversation…" />
          ) : detailQuery.error ? (
            <ErrorNote message={detailQuery.error} />
          ) : activeChat ? (
            <>
              <header className="internal-chat-head">
                <button type="button" className="internal-back" onClick={() => setSelectedChatId(null)} aria-label="Back to conversations">
                  <ChevronLeft size={20} />
                </button>
                <Avatar name={activeChat.title} size="md" />
                <div className="internal-chat-heading">
                  <strong>{activeChat.title}</strong>
                  <span>
                    {activeChat.type === "group"
                      ? `${activeChat.members.length} members · ${activeChat.members.map((member) => member.name).join(", ")}`
                      : "Private message"}
                  </span>
                </div>
              </header>
              <div className="internal-message-scroll" ref={scrollRef}>
                {messages.length ? messages.map((message, index) => {
                  const isOwn = message.sender.id === user?.id;
                  const previous = messages[index - 1];
                  const next = messages[index + 1];
                  const isContinued = previous?.sender.id === message.sender.id;
                  const isGroupEnd = !next || next.sender.id !== message.sender.id;
                  return (
                    <div className={`internal-message-row ${isOwn ? "is-own" : ""} ${isContinued ? "is-continued" : ""}`.trim()} key={message.id}>
                      {!isOwn ? (
                        <span className="internal-message-avatar">
                          {isGroupEnd ? <Avatar name={message.sender.name} size="sm" /> : null}
                        </span>
                      ) : null}
                      <div className="internal-message-block">
                        {!isOwn && activeChat.type === "group" && !isContinued ? <span className="internal-sender">{message.sender.name}</span> : null}
                        <div className="internal-message-bubble">{message.body}</div>
                        {isGroupEnd ? <time className="internal-message-time">{formatTime(message.createdAt)}</time> : null}
                      </div>
                    </div>
                  );
                }) : (
                  <div className="internal-first-message">
                    <strong>This is the start of your conversation.</strong>
                    <span>Send a note to keep the team in sync.</span>
                  </div>
                )}
              </div>
              <div className="internal-composer">
                <div className="internal-composer-box">
                  <textarea
                    rows={1}
                    value={input}
                    maxLength={4000}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Aa"
                    aria-label={`Message ${activeChat.title}`}
                  />
                  <button type="button" className="internal-send" onClick={() => void send()} disabled={!input.trim() || sending} aria-label="Send message">
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </section>
      </div>

      {composer ? (
        <div
          className={`internal-modal-backdrop ${composerClosing ? "is-closing" : ""}`.trim()}
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeComposer(); }}
        >
          <section className="internal-compose-modal" role="dialog" aria-modal="true" aria-labelledby="internal-compose-title">
            <header>
              <div>
                <span className="eyebrow">Internal workspace</span>
                <h2 id="internal-compose-title">{composer === "group" ? "Start a group" : "New private message"}</h2>
              </div>
              <button type="button" className="icon-btn" onClick={() => closeComposer()} aria-label="Close dialog"><X size={17} /></button>
            </header>

            {composer === "direct" ? (
              <label className="field">
                <span className="label">Teammate</span>
                <select className="select" value={selectedPersonId} onChange={(event) => setSelectedPersonId(event.target.value)}>
                  <option value="">Choose an IT or Admin teammate</option>
                  {people.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role === "admin" ? "Admin" : "IT"}</option>)}
                </select>
              </label>
            ) : (
              <>
                <label className="field">
                  <span className="label">Group name</span>
                  <input className="input" value={groupTitle} maxLength={80} onChange={(event) => setGroupTitle(event.target.value)} placeholder="e.g. Incident response" />
                </label>
                <fieldset className="internal-member-picker">
                  <legend>People</legend>
                  {people.map((person) => (
                    <label key={person.id} className="internal-member-option">
                      <input type="checkbox" checked={selectedMemberIds.includes(person.id)} onChange={() => toggleMember(person.id)} />
                      <Avatar name={person.name} size="sm" />
                      <span>{person.name}</span>
                      <small>{person.role === "admin" ? "Admin" : "IT"}</small>
                    </label>
                  ))}
                  {!people.length ? <p className="muted small">No other staff accounts are available.</p> : null}
                </fieldset>
              </>
            )}

            {error ? <ErrorNote message={error} /> : null}
            <footer>
              <Button variant="ghost" onClick={() => closeComposer()}>Cancel</Button>
              {composer === "group" ? (
                <Button onClick={() => void startGroup()} disabled={!groupTitle.trim() || selectedMemberIds.length === 0} loading={creating}>
                  <Plus size={15} /> Create group
                </Button>
              ) : (
                <Button onClick={() => void startDirect()} disabled={!selectedPersonId} loading={creating}>
                  <MessageSquarePlus size={15} /> Start chat
                </Button>
              )}
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}