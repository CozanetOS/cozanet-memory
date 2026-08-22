/**
 * Enhanced extraction patterns for user profile memory.
 * The original extractFromMessage only caught basic patterns like "my name is X".
 * This version catches many more natural-language patterns.
 */

export interface Extraction {
  key: string;
  value: string;
  category: 'identity' | 'preference' | 'fact' | 'skill' | 'goal' | 'relationship';
  confidence: number;
}

export function extractFromMessageEnhanced(content: string): Extraction[] {
  const extractions: Extraction[] = [];

  // ── Name ──────────────────────────────────────────────────
  const nameMatch = content.match(/my name is ([A-Za-z\s]+?)(?:[,.!?]|\s*$)/i);
  if (nameMatch) extractions.push({ key: 'name', value: nameMatch[1].trim(), category: 'identity', confidence: 0.9 });

  const callMatch = content.match(/call me ([A-Za-z\s]+?)(?:[,.!?]|\s*$)/i);
  if (callMatch) extractions.push({ key: 'nickname', value: callMatch[1].trim(), category: 'identity', confidence: 0.9 });

  const imMatch = content.match(/^I'?m ([A-Z][a-z]+)(?:[,.!?]|\s*$)/m);
  if (imMatch && imMatch[1].length < 20) {
    extractions.push({ key: 'name', value: imMatch[1], category: 'identity', confidence: 0.6 });
  }

  // ── Timezone / Location ───────────────────────────────────
  const tzMatch = content.match(/(?:I'?m in|my timezone is|I live in|I'?m based in)\s+(.+?)(?:timezone|time zone)?(?:[,.!?]|\s*$)/i);
  if (tzMatch) extractions.push({ key: 'location', value: tzMatch[1].trim(), category: 'identity', confidence: 0.7 });

  // ── Pet / Dog / Animal names ──────────────────────────────
  const petMatch = content.match(/my (?:dog|cat|pet)'?s? name is ([A-Za-z]+?)(?:[,.!?]|\s*$)/i);
  if (petMatch) extractions.push({ key: `pet_name:${petMatch[1].trim().toLowerCase()}`, value: petMatch[1].trim(), category: 'fact', confidence: 0.85 });

  // ── Family / Relationships ────────────────────────────────
  const wifeMatch = content.match(/my (?:wife|girlfriend|partner)'?s? name is ([A-Za-z]+?)(?:[,.!?]|\s*$)/i);
  if (wifeMatch) extractions.push({ key: 'partner_name', value: wifeMatch[1].trim(), category: 'relationship', confidence: 0.85 });

  const husbandMatch = content.match(/my (?:husband|boyfriend)'?s? name is ([A-Za-z]+?)(?:[,.!?]|\s*$)/i);
  if (husbandMatch) extractions.push({ key: 'partner_name', value: husbandMatch[1].trim(), category: 'relationship', confidence: 0.85 });

  const kidMatch = content.match(/my (?:son|daughter|kid|child)'?s? name is ([A-Za-z]+?)(?:[,.!?]|\s*$)/i);
  if (kidMatch) extractions.push({ key: `child_name:${kidMatch[1].trim().toLowerCase()}`, value: kidMatch[1].trim(), category: 'relationship', confidence: 0.85 });

  // ── Work / Company ────────────────────────────────────────
  const workMatch = content.match(/I work (?:at|for)\s+(.+?)(?:[,.!?]|\s*$)/i);
  if (workMatch) extractions.push({ key: 'workplace', value: workMatch[1].trim(), category: 'identity', confidence: 0.8 });

  const jobMatch = content.match(/I'?m a (.+?)(?:at|at|—|-)(?:\s+(.+?))?(?:[,.!?]|\s*$)/i);
  if (jobMatch) extractions.push({ key: 'job_title', value: jobMatch[1].trim(), category: 'identity', confidence: 0.6 });

  // ── Preferences (broader) ─────────────────────────────────
  const prefMatch = content.match(/I (?:prefer|like|love|enjoy|hate|dislike|can'?t stand)\s+(.+?)(?:[,.!?]|\s*$)/i);
  if (prefMatch) {
    const pref = prefMatch[1].trim();
    const isNegative = /hate|dislike|can'?t stand/i.test(content);
    extractions.push({ key: `preference:${pref.slice(0, 50)}`, value: isNegative ? 'dislike' : 'like', category: 'preference', confidence: 0.6 });
  }

  // ── Goals / Plans ────────────────────────────────────────
  const goalMatch = content.match(/I(?:'?m)?\s+(?:want|trying|planning|going) to\s+(.+?)(?:[,.!?]|\s*$)/i);
  if (goalMatch) {
    extractions.push({ key: `goal:${goalMatch[1].trim().slice(0, 50)}`, value: goalMatch[1].trim(), category: 'goal', confidence: 0.7 });
  }

  // ── "Remember that" — explicit memory request ─────────────
  const rememberMatch = content.match(/(?:remember|don'?t forget)(?:\s+that)?\s+(.+?)(?:[,.!?]|\s*$)/i);
  if (rememberMatch) {
    extractions.push({ key: `explicit:${rememberMatch[1].trim().slice(0, 50)}`, value: rememberMatch[1].trim(), category: 'fact', confidence: 0.95 });
  }

  // ── Deadlines / Important dates ──────────────────────────
  const deadlineMatch = content.match(/(?:deadline|due date|submit by)\s+(.+?)(?:[,.!?]|\s*$)/i);
  if (deadlineMatch) {
    extractions.push({ key: 'deadline', value: deadlineMatch[1].trim(), category: 'fact', confidence: 0.8 });
  }

  // ── Projects ─────────────────────────────────────────────
  const projectMatch = content.match(/I'?m working on\s+(.+?)(?:[,.!?]|\s*$)/i);
  if (projectMatch) {
    extractions.push({ key: 'current_project', value: projectMatch[1].trim(), category: 'fact', confidence: 0.7 });
  }

  // ── Language / Tech stack ────────────────────────────────
  const langMatch = content.match(/I (?:code|program|write) in\s+(.+?)(?:[,.!?]|\s*$)/i);
  if (langMatch) {
    extractions.push({ key: 'programming_language', value: langMatch[1].trim(), category: 'skill', confidence: 0.7 });
  }

  return extractions;
}
