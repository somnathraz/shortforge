import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export type CharacterProfile = {
  id: string;
  displayName: string;
  aliases: string[];
  promptLock: string;
  masterImage?: string;
};

const CHARACTERS_DIR = () => path.resolve(process.env.CHARACTERS_DIR || 'characters');

export function charactersRootDir(): string {
  return CHARACTERS_DIR();
}

export async function loadCharacterProfiles(): Promise<CharacterProfile[]> {
  const root = charactersRootDir();
  let dirs: string[] = [];
  try {
    dirs = await readdir(root);
  } catch {
    return [];
  }

  const profiles: CharacterProfile[] = [];
  for (const dir of dirs) {
    const profilePath = path.join(root, dir, 'profile.json');
    try {
      await access(profilePath);
      const raw = JSON.parse(await readFile(profilePath, 'utf8')) as Partial<CharacterProfile>;
      const id = raw.id || dir;
      const masterCandidates = ['master.png', 'master.jpg', 'master.jpeg', 'master.webp'];
      let masterImage: string | undefined;
      for (const name of masterCandidates) {
        const full = path.join(root, dir, name);
        try {
          await access(full);
          masterImage = full;
          break;
        } catch {
          // continue
        }
      }
      profiles.push({
        id,
        displayName: raw.displayName || id,
        aliases: raw.aliases || [id],
        promptLock: raw.promptLock || '',
        ...(masterImage ? { masterImage } : {})
      });
    } catch {
      // skip invalid character folders
    }
  }
  return profiles;
}

export function matchCharactersInPrompt(
  visualPrompt: string,
  profiles: CharacterProfile[],
  episodeContext = ''
): CharacterProfile[] {
  const text = `${visualPrompt}\n${episodeContext}`.toLowerCase();
  return profiles.filter((profile) => {
    const names = [profile.id, profile.displayName, ...profile.aliases].map((n) => n.toLowerCase());
    return names.some((name) => name && text.includes(name));
  });
}

/** Append master character locks from characters/<id>/profile.json when names appear in the prompt. */
export async function enrichVisualPrompt(
  visualPrompt: string,
  episodeContext = ''
): Promise<{
  prompt: string;
  masterImagePaths: string[];
}> {
  const profiles = await loadCharacterProfiles();
  const matched = matchCharactersInPrompt(visualPrompt, profiles, episodeContext);
  const locks = matched.map((p) => p.promptLock).filter(Boolean);
  const masterImagePaths = matched.map((p) => p.masterImage).filter((p): p is string => Boolean(p));
  const prompt = [visualPrompt.trim(), ...locks].filter(Boolean).join(', ');
  return { prompt, masterImagePaths };
}
