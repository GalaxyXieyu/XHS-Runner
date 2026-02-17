CREATE TABLE "image_download_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"topic_id" integer NOT NULL,
	"image_type" text NOT NULL,
	"image_index" integer NOT NULL,
	"original_url" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"stored_path" text,
	"stored_url" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "image_download_queue_topic_id_image_type_image_index_unique" UNIQUE("topic_id","image_type","image_index")
);
--> statement-breakpoint
ALTER TABLE "image_download_queue" ADD CONSTRAINT "image_download_queue_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;