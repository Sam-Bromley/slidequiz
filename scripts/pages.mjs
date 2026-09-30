// Plain information pages (About + a few search-friendly guides), built as static HTML next to the app.
// They load instantly and Google can read them; each one points people into the app.
// Keep what they say in step with what the app really does.

const SITE = "https://slidequiz.co.uk";

const STEPS = [
  ["Upload", "Drop in your lecture slides (PowerPoint), a PDF, a Word document, or paste your notes."],
  ["Get your notes", "SlideQuiz lays everything out as tidy notes, grouped into topics with clear headings."],
  ["Practise", "Answer questions and flip flashcards made from your own material, and see how much you've covered."],
];

const COMMON_FAQ = [
  ["Is SlideQuiz free?", "Yes. You can upload as many lectures as you like and make notes, practise questions and use flashcards for free, with AI notes and questions for 10 lectures a month on a free account (2 to try without one). SlideQuiz Plus (£3.99 a month, cancel any time) gives 150 a month and helps keep SlideQuiz free."],
  ["Are my files uploaded anywhere?", "Your files are read on your own device and never uploaded. To write your notes, questions and flashcards, the text of your slides is sent to our AI provider. If you make an account, your notes and progress are also saved to it so you can use them on other devices. Your original files and slide pictures always stay on your device."],
  ["Do I need an account?", "No. Everything works without one. An account just lets you pick up your work on another device."],
  ["What files can I use?", "PowerPoint (.pptx), PDF, Word (.docx) and plain text. You can also paste notes straight in. Scanned pages and photos of slides can't be read yet, because there's no text in them to use."],
  ["Does it work on my phone?", "Yes. It works in any modern browser, and you can add it to your home screen so it opens like an app, even offline."],
];

export const PAGES = [
  {
    slug: "about",
    title: "About SlideQuiz",
    description: "SlideQuiz turns your lecture slides, PDFs and notes into clean notes, practice questions and flashcards. Free, and your files stay on your device.",
    h1: "Revise straight from your lecture slides",
    lead: "SlideQuiz turns the slides and notes you already have into tidy revision notes, practice questions and flashcards, so you spend your time learning instead of copying things out.",
    sections: [
      {
        h: "What you get",
        list: [
          ["Clean notes", "Every slide laid out as easy-to-read notes, grouped into topics, with key terms in bold. Show or hide the pictures from your slides, and export to PDF or Word."],
          ["Practice questions", "Multiple-choice questions that work through all of your material, one at a time. Anything you get wrong comes back later until you know it."],
          ["Flashcards", "Cards made from the facts in your slides that have one clear answer, plus any you write yourself."],
          ["Progress by topic", "See how much of each topic you've covered, so you know what to revise next."],
          ["Folders and exam dates", "Keep each module in its own folder, add the exam date, and practise everything in a folder together."],
        ],
      },
    ],
    faq: COMMON_FAQ,
  },
  {
    slug: "powerpoint-to-flashcards",
    title: "Turn PowerPoint slides into flashcards",
    description: "Upload your lecture PowerPoint and SlideQuiz makes flashcards from it automatically. Free, no sign-up needed, and your files stay on your device.",
    h1: "Turn PowerPoint slides into flashcards",
    lead: "Upload your lecture slides and SlideQuiz picks out the facts with one clear answer (key terms, names, figures) and turns them into flashcards for you.",
    sections: [
      {
        h: "How it works",
        steps: [
          ["Upload your slides", "Drop in the .pptx file from your lecture. It's read on your device in a few seconds."],
          ["Create flashcards", "Choose the lecture, and the topics you want, then create. Each card asks for one thing, like the name of a process or a key figure."],
          ["Study them", "Flip each card to check yourself, shuffle them, and swipe through them on your phone. Add your own cards any time."],
        ],
      },
      {
        h: "Why it helps",
        paras: [
          "Writing flashcards by hand takes ages, and it's easy to miss things. Making them from the slides themselves means they match exactly what your lecturer covered.",
          "Testing yourself with flashcards (active recall) is one of the most effective ways to remember things, far better than re-reading.",
        ],
      },
    ],
    faq: [["Can I edit the flashcards?", "Yes. You can change or delete any card and add your own."], ...COMMON_FAQ],
  },
  {
    slug: "lecture-slides-to-practice-questions",
    title: "Practice questions from your lecture slides",
    description: "Make multiple-choice practice questions from your lecture slides or PDF in seconds. Free, covers every topic, and brings back the ones you get wrong.",
    h1: "Practice questions from your lecture slides",
    lead: "Upload a lecture and SlideQuiz makes multiple-choice questions that work through everything in it, one question at a time.",
    sections: [
      {
        h: "How it works",
        steps: [
          ["Upload the lecture", "PowerPoint, PDF or Word, or paste your notes."],
          ["Answer questions", "Choose which topics to practise and how many answer options you want (3 to 6). The right answer's position changes every time, so you can't just remember the letter."],
          ["Close the gaps", "Questions you get wrong come back a few questions later. The progress screen shows how much of each topic you've covered."],
        ],
      },
      {
        h: "Revising a whole module",
        paras: ["Put a module's lectures in one folder and use Practise all to mix questions from all of them, which is ideal for the run-up to an exam. Add the exam date to see a countdown."],
      },
    ],
    faq: [["See where an answer came from?", "Yes. After each question you can jump to that part of your notes."], ...COMMON_FAQ],
  },
  {
    slug: "revision-notes-from-slides",
    title: "Make revision notes from lecture slides",
    description: "Turn lecture slides into clean, organised revision notes grouped by topic. Free, works with PowerPoint, PDF and Word, and exports to PDF or Word.",
    h1: "Make revision notes from your slides",
    lead: "Slides are made for presenting, not revising. SlideQuiz turns them into clear notes, grouped into topics, that are easy to read and learn from.",
    sections: [
      {
        h: "How it works",
        steps: [
          ["Upload your slides", "PowerPoint, PDF or Word. Every slide is included, and you can leave any out."],
          ["Read your notes", "Each topic gets a heading, key terms are picked out in bold, and reference lists are left out so it's just the content."],
          ["Take them anywhere", "Show the pictures from your slides if you want them, search across all your notes, or export to PDF or Word."],
        ],
      },
      {
        h: "Then test yourself",
        paras: ["The same slides give you practice questions and flashcards, so you can go from reading to testing yourself in one place."],
      },
    ],
    faq: COMMON_FAQ,
  },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const LOGO = `<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#111"/><rect x="7" y="8" width="18" height="13" rx="2.5" fill="none" stroke="#fff" stroke-width="2"/><path d="M16 21v4M12 25h8" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="m12.5 14.5 2.5 2.5 4.5-4.5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const CSS = `
:root{--bg:#fff;--fg:#111;--muted:#666;--line:#e6e6e6;--card:#fafafa}
@media (prefers-color-scheme:dark){:root{--bg:#0b0b0c;--fg:#f2f2f2;--muted:#a0a0a0;--line:#262628;--card:#151517}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 Arial,Helvetica,sans-serif}
a{color:inherit}
.wrap{max-width:760px;margin:0 auto;padding:0 20px}
header{display:flex;align-items:center;justify-content:space-between;padding:18px 0}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;text-decoration:none;font-size:17px}
.btn{display:inline-block;background:var(--fg);color:var(--bg);text-decoration:none;font-weight:600;border-radius:999px;padding:12px 24px}
.btn.small{padding:8px 16px;font-size:14px}
h1{font-size:clamp(30px,6vw,44px);line-height:1.15;margin:48px 0 16px;letter-spacing:-.02em}
h2{font-size:22px;margin:56px 0 16px}
.lead{font-size:18px;color:var(--muted);margin:0 0 28px}
.note{font-size:14px;color:var(--muted);margin-top:12px}
.steps{list-style:none;padding:0;margin:0;display:grid;gap:12px}
.steps li{display:flex;gap:16px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px}
.num{flex:none;width:30px;height:30px;border-radius:50%;background:var(--fg);color:var(--bg);display:grid;place-items:center;font-weight:700;font-size:14px}
.steps b,.feat b{display:block;margin-bottom:2px}
.steps p,.feat p{margin:0;color:var(--muted)}
.feat{list-style:none;padding:0;margin:0;display:grid;gap:18px}
details{border-bottom:1px solid var(--line);padding:14px 0}
summary{cursor:pointer;font-weight:600}
details p{margin:8px 0 0;color:var(--muted)}
.cta{text-align:center;margin:64px 0 24px;padding:36px 20px;border:1px solid var(--line);border-radius:18px;background:var(--card)}
.cta p{margin:0 0 18px;font-size:18px}
footer{border-top:1px solid var(--line);margin-top:48px;padding:24px 0 40px;font-size:14px;color:var(--muted);display:flex;flex-wrap:wrap;gap:8px 18px}
footer a{text-decoration:none}footer a:hover{text-decoration:underline}
`;

export function renderPage(page, analytics) {
  const url = `${SITE}/${page.slug}/`;
  const faqLd = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: page.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
  const body = page.sections
    .map((s) => {
      let h = `<h2>${esc(s.h)}</h2>`;
      if (s.steps) h += `<ol class="steps">${s.steps.map(([t, d], i) => `<li><span class="num">${i + 1}</span><div><b>${esc(t)}</b><p>${esc(d)}</p></div></li>`).join("")}</ol>`;
      if (s.list) h += `<ul class="feat">${s.list.map(([t, d]) => `<li><b>${esc(t)}</b><p>${esc(d)}</p></li>`).join("")}</ul>`;
      if (s.paras) h += s.paras.map((p) => `<p>${esc(p)}</p>`).join("");
      return h;
    })
    .join("\n");
  const steps = page.slug === "about" ? `<h2>How it works</h2><ol class="steps">${STEPS.map(([t, d], i) => `<li><span class="num">${i + 1}</span><div><b>${esc(t)}</b><p>${esc(d)}</p></div></li>`).join("")}</ol>` : "";
  const others = PAGES.filter((p) => p.slug !== page.slug);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(page.title)} | SlideQuiz</title>
<meta name="description" content="${esc(page.description)}" />
<link rel="canonical" href="${url}" />
<link rel="icon" href="/favicon.ico" sizes="48x48" />
<link rel="icon" href="/favicon-48.png" type="image/png" sizes="48x48" />
<link rel="icon" href="/favicon.svg?v=2" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<meta property="og:title" content="${esc(page.title)}" />
<meta property="og:description" content="${esc(page.description)}" />
<meta property="og:url" content="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="SlideQuiz" />
<meta name="theme-color" content="#ffffff" />
<style>${CSS.trim()}</style>
<script type="application/ld+json">${JSON.stringify(faqLd)}</script>
</head>
<body>
<div class="wrap">
<header><a class="brand" href="/">${LOGO}SlideQuiz</a><a class="btn small" href="/">Open SlideQuiz</a></header>
<main>
<h1>${esc(page.h1)}</h1>
<p class="lead">${esc(page.lead)}</p>
<a class="btn" href="/">Try SlideQuiz free</a>
<p class="note">No sign-up needed. Your files stay on your device.</p>
${steps}
${body}
<h2>Questions</h2>
${page.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n")}
<div class="cta"><p>Ready to revise from your own slides?</p><a class="btn" href="/">Try SlideQuiz free</a></div>
</main>
<footer><a href="/">SlideQuiz</a>${others.map((p) => `<a href="/${p.slug}/">${esc(p.title)}</a>`).join("")}<a href="/#/privacy">Privacy policy</a></footer>
</div>
${analytics}
</body>
</html>
`;
}

export function sitemap() {
  const urls = [`${SITE}/`, ...PAGES.map((p) => `${SITE}/${p.slug}/`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`;
}
