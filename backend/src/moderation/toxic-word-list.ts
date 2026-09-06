/**
 * Curated toxicity lexicons used by the automated content filter.
 *
 * Hard slurs (`BLOCKED_TERMS`) are never allowed: the message is rejected and
 * a strike is recorded. Profanity / insults (`PROFANE_TERMS`) are censored
 * with asterisks and softly flagged; the message still goes through. Terms are
 * matched on word boundaries after accent/separator normalisation, so simple
 * obfuscation ("h a t e", "h4te", "h-a-t-e") is still caught — see
 * `TextFilterService.normalizeForMatch`.
 *
 * The lists are intentionally conservative and English-first; they can be
 * extended without touching the filter logic.
 */

// Severe: hate speech / slurs / direct threats / sexual predation. Blocked.
export const BLOCKED_TERMS: string[] = [
  // Racial / ethnic / homophobic slurs are represented here by their stems so
  // inflections match; the filter uses boundary matching.
  'nigger',
  'nigga',
  'faggot',
  'fag',
  'retard',
  'retarded',
  'kike',
  'spic',
  'chink',
  'dyke',
  'tranny',
  'whore',
  'kill yourself',
  'kys',
  'rape you',
  'grooming',
  'send nudes',
  'child predator',
  'bomb threat',
  'shoot up',
];

// Mild/moderate profanity & insults: censored, not blocked.
export const PROFANE_TERMS: string[] = [
  'fuck',
  'fucker',
  'fucking',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'dickhead',
  'cunt',
  'motherfucker',
  'pussy',
  'slut',
  'moron',
  'idiot',
  'stupid',
  'loser',
  'shut up',
  'hate you',
];

/** Words that, repeated in a spammy pattern, indicate flooding/scam spam. */
export const SPAM_SIGNALS: string[] = [
  'click this link',
  'free coins',
  'free pips',
  'giveaway claim',
  'crypto airdrop',
  'send money',
  'gift card code',
  'http://',
  'https://',
  'www.',
  'whatsapp',
  'telegram.me',
  't.me/',
];
