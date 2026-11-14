export type Role = "customer" | "it" | "admin";
export type Priority = "low" | "normal" | "high" | "urgent";
export type Status = "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";
export type Channel = "portal" | "assistant";
export type MessageRole = "customer" | "it" | "admin" | "bot" | "system";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  company: string | null;
  title: string | null;
}

export interface Attachment {
  id: number;
  filename: string;
  mime: string;
  size: number;
  createdAt: string;
  url: string;
}

export interface TicketPerson {
  id: number;
  name: string;
  company?: string | null;
  title?: string | null;
  email?: string;
}

export interface MessageSender {
  id: number;
  name: string;
  role: Role;
}

export interface TicketMessage {
  id: number;
  body: string;
  isInternal: boolean;
  isFlagged: boolean;
  flagReason: string | null;
  flagDetails: {
    phoneNumbers?: string[];
    emails?: string[];
    outsideChatLinks?: string[];
  } | null;
  createdAt: string;
  senderRole: MessageRole;
  sender: MessageSender | null;
  attachments: Attachment[];
}

export interface TicketActivity {
  id: number;
  type: string;
  from: string | null;
  to: string | null;
  note: string | null;
  actorName: string | null;
  createdAt: string;
  label: string;
}

export interface TicketSummary {
  id: number;
  ref: string;
  subject: string;
  category: string;
  priority: Priority;
  status: Status;
  channel: Channel;
  createdAt: string;
  updatedAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  adminHelpRequestedAt: string | null;
  adminHelpReason: string | null;
  responseDueAt: string;
  resolveDueAt: string;
  rating: number | null;
  reopenedCount: number;
  customer: TicketPerson;
  product: { id: number; name: string } | null;
  assignee: TicketPerson | null;
  lastMessage: { body: string; senderRole: MessageRole; createdAt: string } | null;
  unreadCount: number;
  isLate: boolean;
  lateReason: "first_response" | "resolution" | null;
  isFlagged: boolean;
  flaggedCount: number;
  viewerRole: Role;
}

export interface TicketPermissions {
  canReply: boolean;
  canSetInternal: boolean;
  canChangeStatus: boolean;
  canAssign: boolean;
  canReassign: boolean;
  canRate: boolean;
  canApprove: boolean;
  canReject: boolean;
  canRequestAdminHelp: boolean;
  canChangeProduct: boolean;
}

export interface TicketDetail extends TicketSummary {
  description: string;
  resolutionSummary: string | null;
  ratingComment: string | null;
  ratedAt: string | null;
  customer: TicketPerson & { email: string };
  assignee: TicketPerson | null;
  messages: TicketMessage[];
  activity: TicketActivity[];
  attachments: Attachment[];
  customerContext: { total: number; open: number } | null;
  permissions: TicketPermissions;
}

export interface CannedReply {
  id: number;
  title: string;
  body: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TicketDetailResponse {
  ticket: TicketDetail;
  agents: TicketPerson[];
  cannedReplies: CannedReply[];
  products: { id: number; name: string }[];
}

export interface TicketListResponse {
  tickets: TicketSummary[];
}

export interface BotMessage {
  id: number;
  role: "customer" | "bot";
  body: string;
  createdAt: string;
}

export interface BotConversation {
  conversationId: number;
  createdAt: string;
  updatedAt: string;
  messages: BotMessage[];
  enabled: boolean;
  suggestions: string[];
  recommendTicket: boolean;
  firstName: string;
  guidedQuestionsEnabled?: boolean;
  product: { id: number; name: string } | null;
  needsProduct: boolean;
}

export interface BotReplyResponse {
  conversationId: number;
  messages: BotMessage[];
  suggestions: string[];
  recommendTicket: boolean;
  intent: string;
  enabled: boolean;
  product: { id: number; name: string } | null;
  needsProduct: boolean;
  productDetected: boolean;
}

export interface AdminStats {
  totalTickets: number;
  openTickets: number;
  unassigned: number;
  resolved: number;
  closed: number;
  lateTickets: number;
  avgFirstResponseMinutes: number | null;
  firstResponseSample: number;
  avgResolutionHours: number | null;
  resolutionSample: number;
  csatAvg: number | null;
  csatCount: number;
  csatPositive: number;
  responseSlaPct: number | null;
  responseSlaTotal: number;
  botConversations: number;
  botEscalated: number;
}

export interface AdminAgent {
  id: number;
  name: string;
  email: string;
  title: string | null;
  openAssigned: number;
  resolved30d: number;
  avgFirstResponseMinutes: number | null;
  avgCsat: number | null;
  lateAssigned: number;
}

export interface AdminCustomerAccount {
  id: number;
  name: string;
  email: string;
  company: string | null;
  active: boolean;
  createdAt: string;
  ticketCount: number;
  openCount: number;
  resolvedCount: number;
  conversationCount: number;
  lastActivityAt: string | null;
}

export interface AdminCustomerTicket {
  id: number;
  ref: string;
  subject: string;
  status: Status;
  priority: Priority;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCustomerDetail extends AdminCustomerAccount {
  tickets: AdminCustomerTicket[];
}

export interface InternalChatPerson {
  id: number;
  name: string;
  email: string;
  role: "it" | "admin";
  title: string | null;
}

export interface InternalChatMessage {
  id: number;
  body: string;
  createdAt: string;
  sender: { id: number; name: string; role: "it" | "admin" };
}

export interface InternalChat {
  id: number;
  type: "direct" | "group";
  title: string;
  createdAt: string;
  updatedAt: string;
  members: InternalChatPerson[];
  unreadCount: number;
  lastMessage: InternalChatMessage | null;
}

export interface VolumePoint {
  date: string;
  created: number;
  resolved: number;
}

export interface AdminActivityItem {
  id: number;
  type: string;
  label: string;
  actorName: string | null;
  ticket: { id: number; ref: string; subject: string };
  createdAt: string;
}

export interface ProductConcernSummary {
  id: number | null;
  name: string;
  total: number;
  open: number;
  resolved: number;
  late: number;
  csatAvg: number | null;
}

export interface AdminOverview {
  scope?: string;
  role?: string;
  stats: AdminStats;
  volume: VolumePoint[];
  statusBreakdown: Partial<Record<Status, number>>;
  categories: { category: string; count: number }[];
  products: ProductConcernSummary[];
  csatDistribution: Record<string, number>;
  agents: AdminAgent[];
  lateTickets: TicketSummary[];
  recentActivity: AdminActivityItem[];
}

export interface AgentPerformanceStats {
  totalAssigned: number;
  openAssigned: number;
  openCount: number;
  inProgressCount: number;
  waitingCustomerCount: number;
  resolved30d: number;
  resolvedAllTime: number;
  lateAssigned: number;
  avgFirstResponseMinutes: number | null;
  firstResponseSample: number;
  avgResolutionHours: number | null;
  resolutionSample: number;
  csatAvg: number | null;
  csatCount: number;
  csatPositive: number;
  responseSlaPct: number | null;
  responseSlaTotal: number;
}

export interface AgentCustomerFeedback {
  ticketId: number;
  ref: string;
  subject: string;
  rating: number;
  comment: string | null;
  ratedAt: string;
  customerName: string;
}

export interface AgentPerformanceReport {
  scope?: "own_performance" | "agent_performance";
  role?: "it" | "admin";
  agent: {
    id: number;
    name: string;
    email: string;
    title: string | null;
    role: "it" | "admin";
  };
  stats: AgentPerformanceStats;
  volume: VolumePoint[];
  statusBreakdown: Partial<Record<Status, number>>;
  categories: { category: string; count: number }[];
  products: ProductConcernSummary[];
  csatDistribution: Record<string, number>;
  feedback: AgentCustomerFeedback[];
  lateTickets: TicketSummary[];
  recentActivity: AdminActivityItem[];
}

export interface AdminConversationSummary {
  id: number;
  customer: { id: number; name: string; company: string | null; email: string };
  product: { id: number; name: string } | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  customerMessageCount: number;
  lastMessage: { body: string; role: "customer" | "bot" } | null;
  escalatedTicketId: number | null;
  ticketRef: string | null;
}

export interface AdminConversationDetail {
  conversation: {
    id: number;
    customer: { id: number; name: string; company: string | null; email: string };
    product: { id: number; name: string } | null;
    createdAt: string;
    updatedAt: string;
    escalatedTicketId: number | null;
    ticketRef: string | null;
  };
  messages: BotMessage[];
}

export interface SlaTarget {
  response_hours: number;
  resolve_hours: number;
}

export type SlaMap = Record<Priority, SlaTarget>;

export interface AutomationSettings {
  bot_enabled: boolean;
  bot_greeting: string;
  bot_fallback: string;
  bot_escalation: string;
  bot_guardrail: string;
  auto_ack: string;
  auto_ack_alt?: string;
  bot_welcome_buttons?: string[];
  bot_guided_questions_enabled?: boolean;
  support_schedule_message?: string;
}

export interface KbEntry {
  id: number;
  question: string;
  answer: string;
  keywords: string;
  category: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: number;
  name: string;
  enabled: boolean;
}

export interface Tag {
  id: number;
  name: string;
  type: string;
}

export interface BotButton {
  id: number;
  label: string;
  action: string;
  sort_order: number;
  enabled: boolean;
}

export interface BotCondition {
  id: number;
  name: string;
  trigger_type: string;
  trigger_value: string;
  action_type: string;
  action_value: string;
  priority: number;
  enabled: boolean;
}

export interface SupportSchedule {
  enabled: boolean;
  schedule: any;
  message: string;
}

export interface AutomationPayload {
  settings: AutomationSettings;
  sla: SlaMap;
  kb: KbEntry[];
  cannedReplies: CannedReply[];
  products?: Product[];
  tags?: Tag[];
  botButtons?: BotButton[];
  botConditions?: BotCondition[];
  supportSchedule?: SupportSchedule;
}

export type CallKind = "video" | "audio";
export type CallStatus = "ringing" | "active" | "ended" | "declined" | "missed" | "cancelled";

export interface CallPerson {
  id: number;
  name: string;
  role: Role;
}

export interface CallRecord {
  id: number;
  ticketId: number;
  ticketRef: string | null;
  kind: CallKind;
  status: CallStatus;
  caller: CallPerson;
  callee: CallPerson;
  createdAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
}

export type RemoteSessionStatus =
  | "requested"
  | "ready"
  | "active"
  | "ended"
  | "declined"
  | "expired";

export interface RemoteAgentDevice {
  id: number;
  name: string;
  platform: string;
  agentVersion: string | null;
  unattendedEnabled: boolean;
  unattendedUpdatedAt: string | null;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface RemoteFrameMeta {
  width: number;
  height: number;
  updatedAt: string;
}

export interface AgentServerInfo {
  serverUrl: string;
  fallbackServerUrl: string | null;
  version: string;
  downloadAvailable: boolean;
}

export interface DiagnosticsDevice {
  id: number;
  name: string;
  platform: string;
  agentVersion: string | null;
  unattendedEnabled: boolean;
  lastSeenAt: string | null;
  owner: { id: number; name: string; email: string | null } | null;
}

export interface DiagnosticsSummary {
  server: {
    time: string;
    uptimeSeconds: number;
    hostname: string;
    port: number;
    node: string;
    realtimeClients: number;
    role: string;
  };
  persistence: { ok: boolean; tickets: number; devices: number; error?: string };
  agent: {
    version: string;
    serverUrl: string;
    fallbackServerUrl: string | null;
    downloadAvailable: boolean;
    installPath: string | null;
  };
  devices: DiagnosticsDevice[];
}

export interface RemoteSession {
  id: number;
  ticketId: number;
  ticketRef: string | null;
  status: RemoteSessionStatus;
  requestedBy: CallPerson;
  customer: CallPerson;
  agent: { id: number; name: string } | null;
  customerPaired: boolean;
  createdAt: string;
  readyAt: string | null;
  approvedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  endedReason: string | null;
  startedWith: "consent" | "password" | null;
  privacyMode: boolean;
  expiresAt: string;
  frame: RemoteFrameMeta | null;
}

export interface RealtimeEvent {
  type: string;
  ticketId?: number;
  chatId?: number;
  decision?: "approved" | "rejected";
  ref?: string;
  subject?: string;
  customerName?: string;
  agentName?: string;
  reason?: string | null;
  callId?: number;
  call?: CallRecord;
  sessionId?: number;
  remoteSession?: RemoteSession;
  fromUserId?: number;
  signalType?: "offer" | "answer" | "ice" | "state";
  payload?: unknown;
  at: string;
}

export type PasswordResetRequest = {
  id: number;
  user_id: number;
  name: string;
  email: string;
  role: string;
  created_at: string;
  used_at: string | null;
};
