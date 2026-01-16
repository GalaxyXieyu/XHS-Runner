import { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/server/supabase";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id } = req.query;
  const taskId = Number(id);

  if (!taskId || isNaN(taskId)) {
    return res.status(400).json({ error: "Invalid task ID" });
  }

  const { data, error } = await supabase
    .from("generation_tasks")
    .select("id, status, prompt, result_asset_id, error_message, created_at, updated_at")
    .eq("id", taskId)
    .single();

  if (error) {
    return res.status(404).json({ error: "Task not found" });
  }

  res.json({
    id: data.id,
    status: data.status,
    prompt: data.prompt,
    assetId: data.result_asset_id,
    errorMessage: data.error_message,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  });
}
