CREATE TABLE "task_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"event_index" integer NOT NULL,
	"event_type" text NOT NULL,
	"event_data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_events_task_id_event_index_unique" UNIQUE("task_id","event_index")
);
--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "thread_id" text;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "hitl_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "hitl_data" jsonb;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "hitl_response" jsonb;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "progress" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "current_agent" text;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_generation_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."generation_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_task_events_task_id" ON "task_events" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_task_events_lookup" ON "task_events" USING btree ("task_id","event_index");--> statement-breakpoint
CREATE INDEX "idx_generation_tasks_status" ON "generation_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_generation_tasks_thread_id" ON "generation_tasks" USING btree ("thread_id");