/**
 * Lines about the course rather than the subject: lecture/module references, lecturer names,
 * learning outcomes, reading, deadlines, activities and sign-posting. They stay in the notes
 * (every slide is shown), but they're never used for questions, answer options or flashcards.
 */
const ADMIN_START =
  /^(learning (objectives|outcomes|aims)|intended learning|by the end of|in this (lecture|session|lesson|module|part)|today we (will|'ll)|this (lecture|session|module|week) (will|covers|looks)|recommended reading|further reading|essential reading|reading:|see (chapter|page|pp?\.|lecture|slide|the video)|remember to|don'?t forget|deadline|submit|hand in|assessment|coursework|exam (date|is|will)|module (code|leader|convenor|lead|handbook|coordinator)|course (code|leader)|lecturer|tutor|instructor|office hours|contact|email|seminar|tutorial|workshop|practical session|lab (session|group)|attendance|moodle|blackboard|canvas|teams|zoom|slides (are|will be)|recording|week \d+|semester|term \d|credits?\b|marks? (available|breakdown)|weighting|source:|sources:|adapted from|image (credit|source|from)|photo (credit|by)|credit:|©|copyright|retrieved from|discuss|think about|consider (this|the following)|activity|task\b|exercise\b|question\s*\d*[:.]|quiz|poll|try (this|it)|have a go|with a partner|in (pairs|groups)|let'?s (look|start|begin|recap|review|move)|we (will|'ll|are going to) (now |next )?(look|cover|explore|discuss|see|start|move|begin)|next,? we|now we|recall (that|from)|remember (from|last)|last (week|time|lecture|session)|in the (next|previous) (lecture|session|week)|any questions|click (here|the link)|watch (this|the video)|video:|review (of )?(lecture|week|session|part|the)|recap( of)?\b|summary of (today|this lecture|the lecture))/i;

/** References to other lectures or modules anywhere in the line ("…Lecture 3…", "…Part 1 module"). */
const COURSE_REF = /\b(lecture|lect\.?|seminar|workshop|module)\s*\d+\b|\bpart \d+ (module|of the (course|module))\b|\bby (dr|prof|professor|mr|mrs|ms)\b/i;

/** Whole lines that are only admin detail: module codes, names with titles, emails, dates. */
const ADMIN_WHOLE = /^([A-Z]{2,5}\s?\d{3,5}[A-Z]?\b.{0,40}|(dr|prof|professor|mr|mrs|ms)\.? [A-Z][a-z]+( [A-Z][a-z]+)?|[\w.+-]+@[\w-]+\.[\w.]+|\d{1,2}(st|nd|rd|th)? (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{2,4})$/i;

export function isAdminLine(line: string): boolean {
  const l = line.replace(/^[\s•\-–*▪◦·●○■□➢➤►▶]+/, "").trim();
  if (!l) return false;
  return ADMIN_START.test(l) || COURSE_REF.test(l) || ADMIN_WHOLE.test(l);
}

/** The slide text without course-admin lines, for making questions and flashcards. */
export const stripAdmin = (text: string) =>
  text
    .split("\n")
    .filter((l) => !isAdminLine(l))
    .join("\n");
