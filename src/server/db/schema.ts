import { pgTable, serial, text, integer, timestamp, boolean, real, jsonb, date, unique, numeric, index } from 'drizzle-orm/pg-core';

// ==================== Core Tables ====================

// ==================== App Auth (Web UI) ====================
// Minimal auth to prevent public abuse when the web UI is exposed.
export const appUsers = pgTable('app_users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  passwordSalt: text('password_salt').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const appActivationCodes = pgTable('app_activation_codes', {
  code: text('code').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  usedAt: timestamp('used_at', { withTimezone: true }),
  usedByUserId: integer('used_by_user_id').references(() => appUsers.id, { onDelete: 'set null' }),
});

export const appSessions = pgTable('app_sessions', {
  token: text('token').primaryKey(),
  userId: integer('user_id').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});


export const themes = pgTable('themes', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'),
  analytics: jsonb('analytics_json'),
  config: jsonb('config_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const keywords = pgTable('keywords', {
  id: serial('id').primaryKey(),
  themeId: integer('theme_id').references(() => themes.id, { onDelete: 'cascade' }),
  value: text('value').notNull(),
  keyword: text('keyword'),
  source: text('source').notNull().default('manual'),
  priority: integer('priority'),
  status: text('status').notNull().default('active'),
  sourceRefId: text('source_ref_id'),
  sourceMeta: jsonb('source_meta_json'),
  isEnabled: boolean('is_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const topics = pgTable('topics', {
  id: serial('id').primaryKey(),
  themeId: integer('theme_id').references(() => themes.id, { onDelete: 'cascade' }),
  keywordId: integer('keyword_id').references(() => keywords.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  source: text('source').notNull(),
  sourceId: text('source_id').notNull(),
  noteId: text('note_id'),
  xsecToken: text('xsec_token'),
  url: text('url'),
  desc: text('desc'),
  noteType: text('note_type'),
  tags: text('tags'),
  coverUrl: text('cover_url'),
  mediaUrls: text('media_urls'),
  authorId: text('author_id'),
  authorName: text('author_name'),
  authorAvatarUrl: text('author_avatar_url'),
  likeCount: integer('like_count'),
  collectCount: integer('collect_count'),
  commentCount: integer('comment_count'),
  shareCount: integer('share_count'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }),
  rawJson: jsonb('raw_json'),
  status: text('status').notNull().default('captured'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  sourceSourceIdUnique: unique().on(table.source, table.sourceId),
}));

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const llmProviders = pgTable('llm_providers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  providerType: text('provider_type').notNull().default('openai'),
  baseUrl: text('base_url'),
  apiKey: text('api_key'),
  modelName: text('model_name'),
  temperature: real('temperature').default(0.7),
  maxTokens: integer('max_tokens').default(2048),
  isDefault: boolean('is_default').default(false),
  isEnabled: boolean('is_enabled').default(true),
  icon: text('icon'),
  supportsVision: boolean('supports_vision').default(false),      // 是否支持图片输入
  supportsImageGen: boolean('supports_image_gen').default(false), // 是否支持图片生成
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const promptProfiles = pgTable('prompt_profiles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category'),
  description: text('description'),
  systemPrompt: text('system_prompt').notNull(),
  userTemplate: text('user_template').notNull(),
  model: text('model'),
  temperature: real('temperature'),
  maxTokens: integer('max_tokens'),
  isTemplate: boolean('is_template').default(false),
  tags: jsonb('tags').$type<string[]>().default([]),
  usageCount: integer('usage_count').default(0),
  successCount: integer('success_count').default(0),
  failCount: integer('fail_count').default(0),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const trendReports = pgTable('trend_reports', {
  id: serial('id').primaryKey(),
  themeId: integer('theme_id').notNull().references(() => themes.id, { onDelete: 'cascade' }),
  reportDate: date('report_date').notNull(),
  stats: jsonb('stats_json'),
  analysis: text('analysis'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  platform: text('platform').notNull(),
  xhsUserId: text('xhs_user_id'),
  nickname: text('nickname'),
  avatarUrl: text('avatar_url'),
  status: text('status').notNull().default('active'),
  authType: text('auth_type'),
  auth: jsonb('auth_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

export const extensionServices = pgTable('extension_services', {
  id: serial('id').primaryKey(),
  serviceType: text('service_type').notNull().unique(),
  name: text('name').notNull(),
  apiKey: text('api_key'),
  endpoint: text('endpoint'),
  config: jsonb('config_json'),
  isEnabled: boolean('is_enabled').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const competitors = pgTable('competitors', {
  id: serial('id').primaryKey(),
  themeId: integer('theme_id').notNull().references(() => themes.id, { onDelete: 'cascade' }),
  xhsUserId: text('xhs_user_id'),
  name: text('name'),
  lastMonitoredAt: timestamp('last_monitored_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const assets = pgTable('assets', {
  id: serial('id').primaryKey(),
  type: text('type').notNull(),
  path: text('path').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ==================== Content Tables ====================

export const creatives = pgTable('creatives', {
  id: serial('id').primaryKey(),
  themeId: integer('theme_id').references(() => themes.id, { onDelete: 'set null' }),
  sourceTopicId: integer('source_topic_id').references(() => topics.id, { onDelete: 'set null' }),
  sourceTopicIds: text('source_topic_ids'),
  title: text('title'),
  content: text('content'),
  script: text('script'),
  tags: text('tags'),
  coverStyle: text('cover_style'),
  coverPrompt: text('cover_prompt'),
  rationale: jsonb('rationale_json'),
  status: text('status').notNull().default('draft'),
  model: text('model'),
  prompt: text('prompt'),
  resultAssetId: integer('result_asset_id').references(() => assets.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const generationTasks = pgTable('generation_tasks', {
  id: serial('id').primaryKey(),
  themeId: integer('theme_id').references(() => themes.id, { onDelete: 'set null' }),
  topicId: integer('topic_id').references(() => topics.id, { onDelete: 'set null' }),
  creativeId: integer('creative_id').references(() => creatives.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('queued'),
  threadId: text('thread_id'),
  hitlStatus: text('hitl_status').notNull().default('none'),
  hitlData: jsonb('hitl_data'),
  hitlResponse: jsonb('hitl_response'),
  progress: integer('progress').notNull().default(0),
  currentAgent: text('current_agent'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  metadata: jsonb('metadata'),
  prompt: text('prompt'),
  model: text('model'),
  resultAssetId: integer('result_asset_id').references(() => assets.id, { onDelete: 'set null' }),
  result: jsonb('result_json'),
  errorMessage: text('error_message'),
  referenceImageUrl: text('reference_image_url'),
  imagePlanId: integer('image_plan_id'),
  sequence: integer('sequence'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  statusIndex: index('idx_generation_tasks_status').on(table.status),
  threadIdIndex: index('idx_generation_tasks_thread_id').on(table.threadId),
}));

export const taskEvents = pgTable('task_events', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id').notNull().references(() => generationTasks.id, { onDelete: 'cascade' }),
  eventIndex: integer('event_index').notNull(),
  eventType: text('event_type').notNull(),
  eventData: jsonb('event_data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  taskIdIndex: index('idx_task_events_task_id').on(table.taskId),
  taskIdEventIndexIndex: index('idx_task_events_lookup').on(table.taskId, table.eventIndex),
  taskIdEventIndexUnique: unique().on(table.taskId, table.eventIndex),
}));

export const publishRecords = pgTable('publish_records', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  themeId: integer('theme_id').references(() => themes.id, { onDelete: 'set null' }),
  creativeId: integer('creative_id').references(() => creatives.id, { onDelete: 'set null' }),
  noteId: text('note_id'),
  xsecToken: text('xsec_token'),
  type: text('type'),
  title: text('title'),
  content: text('content'),
  tags: text('tags'),
  mediaUrls: text('media_urls'),
  status: text('status').notNull().default('queued'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  response: jsonb('response_json'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const metrics = pgTable('metrics', {
  id: serial('id').primaryKey(),
  publishRecordId: integer('publish_record_id').references(() => publishRecords.id, { onDelete: 'cascade' }),
  metricKey: text('metric_key').notNull(),
  metricValue: real('metric_value').notNull().default(0),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export const interactionTasks = pgTable('interaction_tasks', {
  id: serial('id').primaryKey(),
  publishRecordId: integer('publish_record_id').references(() => publishRecords.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  status: text('status').notNull().default('queued'),
  content: text('content'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const formAssistRecords = pgTable('form_assist_records', {
  id: serial('id').primaryKey(),
  themeId: integer('theme_id').references(() => themes.id, { onDelete: 'set null' }),
  suggestion: jsonb('suggestion_json'),
  applied: jsonb('applied_json'),
  feedback: jsonb('feedback_json'),
  status: text('status').notNull().default('suggested'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const comments = pgTable('comments', {
  id: serial('id').primaryKey(),
  publishRecordId: integer('publish_record_id').references(() => publishRecords.id, { onDelete: 'cascade' }),
  xhsCommentId: text('xhs_comment_id'),  // 小红书评论唯一ID，用于去重
  authorId: text('author_id'),
  authorName: text('author_name'),
  authorAvatar: text('author_avatar'),
  content: text('content').notNull(),
  parentCommentId: integer('parent_comment_id'),  // 父评论ID，用于回复关系
  xhsCreatedAt: timestamp('xhs_created_at', { withTimezone: true }),
  replyStatus: text('reply_status').default('pending'), // pending/draft/sent/failed
  replyContent: text('reply_content'),
  replySentAt: timestamp('reply_sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  xhsCommentIdUnique: unique('comments_xhs_comment_id_unique').on(table.xhsCommentId),
  publishRecordIdIdx: index('comments_publish_record_id_idx').on(table.publishRecordId),
  replyStatusIdx: index('comments_reply_status_idx').on(table.replyStatus),
}));

// ==================== Scheduler Tables ====================

export const scheduledJobs = pgTable('scheduled_jobs', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  jobType: text('job_type').notNull(),
  themeId: integer('theme_id').references(() => themes.id, { onDelete: 'set null' }),
  keywordId: integer('keyword_id').references(() => keywords.id, { onDelete: 'set null' }),
  scheduleType: text('schedule_type').notNull(),
  intervalMinutes: integer('interval_minutes'),
  cronExpression: text('cron_expression'),
  params: jsonb('params_json'),
  isEnabled: boolean('is_enabled').notNull().default(true),
  priority: integer('priority').notNull().default(5),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  lastStatus: text('last_status'),
  lastError: text('last_error'),
  runCount: integer('run_count').notNull().default(0),
  successCount: integer('success_count').notNull().default(0),
  failCount: integer('fail_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const jobExecutions = pgTable('job_executions', {
  id: serial('id').primaryKey(),
  jobId: integer('job_id').notNull().references(() => scheduledJobs.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('queued'),
  triggerType: text('trigger_type').notNull().default('scheduled'),
  retryCount: integer('retry_count').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  durationMs: integer('duration_ms'),
  result: jsonb('result_json'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rateLimitState = pgTable('rate_limit_state', {
  id: serial('id').primaryKey(),
  scope: text('scope').notNull(),
  scopeId: text('scope_id'),
  requestCount: integer('request_count').notNull().default(0),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
  lastRequestAt: timestamp('last_request_at', { withTimezone: true }),
  isBlocked: boolean('is_blocked').notNull().default(false),
  blockedUntil: timestamp('blocked_until', { withTimezone: true }),
  blockReason: text('block_reason'),
});

// ==================== Image Generation Tables ====================

export const imageStyleTemplates = pgTable('image_style_templates', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  category: text('category'),
  systemPrompt: text('system_prompt').notNull(),
  promptSuffix: text('prompt_suffix'),
  defaultAspectRatio: text('default_aspect_ratio').default('3:4'),
  examplePrompts: jsonb('example_prompts'),
  isBuiltin: boolean('is_builtin').default(false),
  isEnabled: boolean('is_enabled').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const creativeAssets = pgTable('creative_assets', {
  id: serial('id').primaryKey(),
  creativeId: integer('creative_id').notNull().references(() => creatives.id, { onDelete: 'cascade' }),
  assetId: integer('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ==================== Reference Image & Image Plan Tables ====================

export const referenceImages = pgTable('reference_images', {
  id: serial('id').primaryKey(),
  themeId: integer('theme_id').references(() => themes.id, { onDelete: 'set null' }),
  name: text('name'),
  path: text('path'),
  url: text('url'),
  styleAnalysis: jsonb('style_analysis'),
  tags: text('tags').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const imagePlans = pgTable('image_plans', {
  id: serial('id').primaryKey(),
  creativeId: integer('creative_id').references(() => creatives.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  role: text('role').notNull(),
  description: text('description'),
  prompt: text('prompt'),
  referenceImageId: integer('reference_image_id').references(() => referenceImages.id, { onDelete: 'set null' }),
  assetId: integer('asset_id').references(() => assets.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('planned'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ==================== Type Exports ====================

export type Theme = typeof themes.$inferSelect;
export type NewTheme = typeof themes.$inferInsert;

export type Keyword = typeof keywords.$inferSelect;
export type NewKeyword = typeof keywords.$inferInsert;

export type Topic = typeof topics.$inferSelect;
export type NewTopic = typeof topics.$inferInsert;

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;

export type LlmProvider = typeof llmProviders.$inferSelect;
export type NewLlmProvider = typeof llmProviders.$inferInsert;

export type PromptProfile = typeof promptProfiles.$inferSelect;
export type NewPromptProfile = typeof promptProfiles.$inferInsert;

export type TrendReport = typeof trendReports.$inferSelect;
export type NewTrendReport = typeof trendReports.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type ExtensionService = typeof extensionServices.$inferSelect;
export type NewExtensionService = typeof extensionServices.$inferInsert;

export type Competitor = typeof competitors.$inferSelect;
export type NewCompetitor = typeof competitors.$inferInsert;

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;

export type Creative = typeof creatives.$inferSelect;
export type NewCreative = typeof creatives.$inferInsert;

export type GenerationTask = typeof generationTasks.$inferSelect;
export type NewGenerationTask = typeof generationTasks.$inferInsert;

export type TaskEvent = typeof taskEvents.$inferSelect;
export type NewTaskEvent = typeof taskEvents.$inferInsert;

export type PublishRecord = typeof publishRecords.$inferSelect;
export type NewPublishRecord = typeof publishRecords.$inferInsert;

export type Metric = typeof metrics.$inferSelect;
export type NewMetric = typeof metrics.$inferInsert;

export type InteractionTask = typeof interactionTasks.$inferSelect;
export type NewInteractionTask = typeof interactionTasks.$inferInsert;

export type FormAssistRecord = typeof formAssistRecords.$inferSelect;
export type NewFormAssistRecord = typeof formAssistRecords.$inferInsert;

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;

export type ScheduledJob = typeof scheduledJobs.$inferSelect;
export type NewScheduledJob = typeof scheduledJobs.$inferInsert;

export type JobExecution = typeof jobExecutions.$inferSelect;
export type NewJobExecution = typeof jobExecutions.$inferInsert;

export type RateLimitState = typeof rateLimitState.$inferSelect;
export type NewRateLimitState = typeof rateLimitState.$inferInsert;

export type ImageStyleTemplate = typeof imageStyleTemplates.$inferSelect;
export type NewImageStyleTemplate = typeof imageStyleTemplates.$inferInsert;

export type CreativeAsset = typeof creativeAssets.$inferSelect;
export type NewCreativeAsset = typeof creativeAssets.$inferInsert;

export type ReferenceImage = typeof referenceImages.$inferSelect;
export type NewReferenceImage = typeof referenceImages.$inferInsert;

export type ImagePlan = typeof imagePlans.$inferSelect;
export type NewImagePlan = typeof imagePlans.$inferInsert;

// ==================== Content Type Templates ====================

export const contentTypeTemplates = pgTable('content_type_templates', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category').notNull(), // edu/billboard/product/story
  // 结构定义 (JSON)
  structure: jsonb('structure').notNull(),
  // 封面 prompt 模板
  coverPromptTemplate: text('cover_prompt_template').notNull(),
  // 内容图 prompt 模板
  contentPromptTemplate: text('content_prompt_template').notNull(),
  // 默认比例
  defaultAspectRatio: text('default_aspect_ratio').default('3:4'),
  // 预设示例图 URL (用于 UI 展示)
  exampleImageUrls: text('example_image_urls').array(),
  // 是否内置模板
  isBuiltin: boolean('is_builtin').default(false),
  // 是否启用
  isEnabled: boolean('is_enabled').default(true),
  // 创建者 ID (用于自定义模板)
  userId: text('user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ContentTypeTemplate = typeof contentTypeTemplates.$inferSelect;
export type NewContentTypeTemplate = typeof contentTypeTemplates.$inferInsert;

// ==================== Reference Image Analysis ====================

export const referenceImageAnalyses = pgTable('reference_image_analyses', {
  id: serial('id').primaryKey(),
  referenceImageId: integer('reference_image_id').references(() => referenceImages.id, { onDelete: 'cascade' }),
  // 分析结果
  isStyleReference: boolean('is_style_reference').notNull(), // 是否风格参考
  confidence: numeric('confidence', { precision: 3, scale: 2 }).notNull(), // 置信度
  // 风格参数 (如果是风格参考)
  styleParams: jsonb('style_params'), // { colorPalette, mood, lighting, styleKeywords }
  // 素材参数 (如果是素材参考)
  materialParams: jsonb('material_params'), // { composition, elements, layout }
  // 原始分析文本
  rawAnalysis: text('raw_analysis'),
  modelUsed: text('model_used'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ReferenceImageAnalysis = typeof referenceImageAnalyses.$inferSelect;
export type NewReferenceImageAnalysis = typeof referenceImageAnalyses.$inferInsert;

// ==================== Image Download Queue ====================

export const imageDownloadQueue = pgTable('image_download_queue', {
  id: serial('id').primaryKey(),
  topicId: integer('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
  imageType: text('image_type').notNull(), // 'cover' | 'media'
  imageIndex: integer('image_index').notNull(),
  originalUrl: text('original_url').notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'processing' | 'completed' | 'failed'
  retryCount: integer('retry_count').notNull().default(0),
  storedPath: text('stored_path'),
  storedUrl: text('stored_url'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueTopicImage: unique().on(table.topicId, table.imageType, table.imageIndex),
}));

export type ImageDownloadQueue = typeof imageDownloadQueue.$inferSelect;
export type NewImageDownloadQueue = typeof imageDownloadQueue.$inferInsert;

// ==================== Conversation Tables ====================

export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  themeId: integer('theme_id').references(() => themes.id, { onDelete: 'set null' }),
  threadId: text('thread_id').notNull().unique(), // LangGraph thread ID
  title: text('title'), // 自动从首条消息提取
  status: text('status').notNull().default('active'), // active | completed | archived
  creativeId: integer('creative_id').references(() => creatives.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata'), // 存储配置（imageGenProvider 等）
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const conversationMessages = pgTable('conversation_messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id').notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // user | assistant | system
  content: text('content').notNull(),
  agent: text('agent'), // 哪个 agent 生成的
  // HITL 交互数据
  askUser: jsonb('ask_user'), // { question, options, selectionType, ... }
  askUserResponse: jsonb('ask_user_response'), // { selectedIds, selectedLabels, customInput }
  // Agent 事件（工具调用等）
  events: jsonb('events'), // AgentEvent[]
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export type ConversationMessage = typeof conversationMessages.$inferSelect;
export type NewConversationMessage = typeof conversationMessages.$inferInsert;
