/**
 * Flashcards about the slides themselves rather than the subject ("Any other questions?", "Thank you",
 * learning objectives, reading lists, module admin). These are never worth memorising.
 */
const WHOLE =
  /^(any (other |more |further )?questions|questions( and answers)?|q\s*&\s*a|thank(s| you)( for (listening|your attention))?|the end|end of (the )?(lecture|session|presentation|slides)|break|coffee break|lunch|references?|bibliography|further reading|(recommended|essential) reading|reading list|(learning|session|lecture) (objectives|outcomes|aims)|objectives|aims|outcomes|contents|agenda|overview|outline|summary|recap|introduction|welcome|title|questions\?|discussion|activity|task|exercise|quiz|poll|video|break time)[\s.?!:…]*$/i;
const ADMIN =
  /\b(this (lecture|session|module|presentation|slide|week)|today'?s (lecture|session)|module (code|leader|lead|handbook|convenor)|lecturer|office hours|moodle|blackboard|canvas|deadline|hand in|submission|coursework|attendance|contact details|email address|any (other |more |further )?questions|thank you for|learning (objectives|outcomes)|by the end of (this|the|today))\b/i;

const BACK = /^(any (other |more |further )?questions|questions\?|q\s*&\s*a|thank(s| you)( for (listening|your attention))?|the end)[\s.?!:…]*$/i;

export function isJunkCard(front: string, back: string): boolean {
  const f = front.trim();
  const b = back.trim();
  // A single word like "Summary" can be a real answer, so the back only counts if it's clearly slide furniture.
  return WHOLE.test(f) || BACK.test(b) || ADMIN.test(f) || ADMIN.test(b);
}
