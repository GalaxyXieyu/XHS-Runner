// Keywords service - re-export from KeywordsRepo for backward compatibility
import { keywordsRepo, type Keyword } from '../../repos/keywordsRepo';

// Re-export types
export type { Keyword };

// Re-export methods as standalone functions for backward compatibility
export async function listKeywords() {
  return keywordsRepo.findAll();
}

export async function addKeyword(value: string) {
  return keywordsRepo.upsert(value);
}

export async function updateKeyword(id: number, value: string, isEnabled?: boolean) {
  const data: Partial<Keyword> = { value };
  if (isEnabled !== undefined) {
    data.isEnabled = isEnabled;
  }
  return keywordsRepo.update(id, data);
}

export async function removeKeyword(id: number) {
  return keywordsRepo.delete(id);
}
