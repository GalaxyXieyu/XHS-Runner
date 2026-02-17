CREATE TABLE "comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"publish_record_id" integer,
	"xhs_comment_id" text,
	"author_id" text,
	"author_name" text,
	"author_avatar" text,
	"content" text NOT NULL,
	"parent_comment_id" integer,
	"xhs_created_at" timestamp with time zone,
	"reply_status" text DEFAULT 'pending',
	"reply_content" text,
	"reply_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_publish_record_id_publish_records_id_fk" FOREIGN KEY ("publish_record_id") REFERENCES "public"."publish_records"("id") ON DELETE cascade ON UPDATE no action;