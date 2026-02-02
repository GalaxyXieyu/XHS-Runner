CREATE TABLE "content_type_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"structure" jsonb NOT NULL,
	"cover_prompt_template" text NOT NULL,
	"content_prompt_template" text NOT NULL,
	"default_aspect_ratio" text DEFAULT '3:4',
	"example_image_urls" text[],
	"is_builtin" boolean DEFAULT false,
	"is_enabled" boolean DEFAULT true,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_type_templates_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "image_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"creative_id" integer,
	"sequence" integer NOT NULL,
	"role" text NOT NULL,
	"description" text,
	"prompt" text,
	"reference_image_id" integer,
	"asset_id" integer,
	"status" text DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_image_analyses" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference_image_id" integer,
	"is_style_reference" boolean NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"style_params" jsonb,
	"material_params" jsonb,
	"raw_analysis" text,
	"model_used" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"theme_id" integer,
	"name" text,
	"path" text,
	"url" text,
	"style_analysis" jsonb,
	"tags" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "reference_image_url" text;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "image_plan_id" integer;--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD COLUMN "sequence" integer;--> statement-breakpoint
ALTER TABLE "llm_providers" ADD COLUMN "supports_vision" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "llm_providers" ADD COLUMN "supports_image_gen" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "prompt_profiles" ADD COLUMN "is_template" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "prompt_profiles" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "prompt_profiles" ADD COLUMN "usage_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "prompt_profiles" ADD COLUMN "success_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "prompt_profiles" ADD COLUMN "fail_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "prompt_profiles" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "image_plans" ADD CONSTRAINT "image_plans_creative_id_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_plans" ADD CONSTRAINT "image_plans_reference_image_id_reference_images_id_fk" FOREIGN KEY ("reference_image_id") REFERENCES "public"."reference_images"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_plans" ADD CONSTRAINT "image_plans_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_image_analyses" ADD CONSTRAINT "reference_image_analyses_reference_image_id_reference_images_id_fk" FOREIGN KEY ("reference_image_id") REFERENCES "public"."reference_images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_images" ADD CONSTRAINT "reference_images_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE set null ON UPDATE no action;