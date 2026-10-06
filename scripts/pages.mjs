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
  ["Is SlideQuiz free?", "Yes. A free account gets 10 credits a month. One credit makes notes, practice questions and flashcards for a normal lecture. Everything you make stays yours to revise from. SlideQuiz Pro (£3.99 a month, cancel any time) gives 100 credits a month."],
  ["Are my files uploaded anywhere?", "Your files are read on your own device and never uploaded. To write your notes, questions and flashcards, the text of your slides is sent securely to our service provider (see the privacy policy). If you make an account, your notes and progress are also saved to it so you can use them on other devices. Your original files and slide pictures always stay on your device."],
  ["Do I need an account?", "Yes, a free one. It takes about 20 seconds with just an email and password, needs no card, and keeps your work saved on any device."],
  ["What files can I use?", "PowerPoint (.pptx), PDF, Word (.docx) and plain text. You can also paste notes straight in. Scanned pages and photos of slides can't be read yet, because there's no text in them to use."],
  ["Does it work on my phone?", "Yes. It works in any modern browser, and you can add it to your home screen so it opens like an app, even offline."],
];

export const PAGES = [
  {
    slug: "about",
    shots: ["notes","quiz","flashcards"],
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
    shots: ["notes","flashcards","quiz"],
    title: "Turn PowerPoint slides into flashcards",
    description: "Upload your lecture PowerPoint and SlideQuiz makes flashcards from it automatically. Free account, no card needed.",
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
    shots: ["quiz","marked","progress"],
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
    shots: ["upload","notes","flashcards"],
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
  {
    slug: "essay-plans",
    shots: ["notes","marked","progress"],
    note: "Free account, no card needed.",
    title: "Essay questions, plans and feedback from your lectures",
    description: "Get exam-style essay questions from your own lectures, plan your essay step by step, and get feedback on every part. Free.",
    h1: "Essay questions, plans and feedback from your lectures",
    lead: "Get an essay question on a lecture or a whole module, plan it one small step at a time, and get feedback on your thesis, each point, your conclusion and your style. Free.",
    sections: [
      {
        h: "How it works",
        steps: [
          ["Choose what it's on", "One lecture, several lectures, or a whole module folder."],
          ["Get a question", "Exam-style questions (Evaluate, Discuss, To what extent and more), or type your own."],
          ["Plan it step by step", "Small boxes guide you through the introduction (context, key terms, scope, thesis), each point (topic sentence, evidence, explanation, link), the conclusion and your references."],
          ["Get feedback", "Notes on exactly which part to improve, from a missing thesis to evidence that isn't explained."],
        ],
      },
      {
        h: "Your essay, not a ready-made one",
        paras: ["SlideQuiz never writes your essay for you. It guides you through a strong structure and tells you what to improve, so you learn to write top-band answers yourself."],
      },
    ],
    faq: [["Is this free?", "Yes. Essays are free with a free account. SlideQuiz Pro (£3.99 a month) adds more credits and extra tools."], ...COMMON_FAQ],
  },
  {
    slug: "pro",
    shots: ["notes","marked","progress"],
    cta: ["Get SlideQuiz Pro", "/#/pro"],
    note: "£3.99 a month. Cancel any time.",
    title: "SlideQuiz Pro",
    description: "SlideQuiz Pro: 100 credits a month, lecture recordings and YouTube videos, highlights, PDF and Word notes and more. £3.99 a month, cancel any time.",
    h1: "SlideQuiz Pro",
    lead: "Everything in SlideQuiz, plus more credits and extra tools for serious revision. £3.99 a month, cancel any time.",
    sections: [
      {
        h: "What you get with Pro",
        list: [
          ["100 credits a month", "Enough for a whole term of lectures. Free accounts get 10."],
          ["Recordings and YouTube", "Notes and questions from lecture recordings (audio and video) and YouTube lectures."],
          ["Highlights and your own notes", "Highlight your revision notes and add notes of your own."],
          ["Designed PDF and Word notes", "Download your notes, with your highlights, ready to print or share."],
          ["Weekly recap and personalising", "See how your week went, use your own photo as the background, and pick accent colours."],
        ],
      },
      {
        h: "Simple and fair",
        paras: ["Payments are handled securely by Stripe, and SlideQuiz never sees your card details. Cancel any time from Settings, and you keep Pro until the end of the month you've paid for."],
      },
    ],
    faq: COMMON_FAQ,
  },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const LOGO = `<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#111"/><rect x="7" y="8" width="18" height="13" rx="2.5" fill="none" stroke="#fff" stroke-width="2"/><path d="M16 21v4M12 25h8" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="m12.5 14.5 2.5 2.5 4.5-4.5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const CSS = `
:root{--bg:#fff;--fg:#111;--muted:#5f6368;--line:#e8e8e8;--soft:#f6f6f4;--card:#fff}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}img{display:block;max-width:100%}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
.narrow{max-width:760px;margin:0 auto}
header{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.88);backdrop-filter:saturate(1.6) blur(12px);-webkit-backdrop-filter:saturate(1.6) blur(12px);border-bottom:1px solid transparent}
header .wrap{display:flex;align-items:center;justify-content:space-between;height:64px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;text-decoration:none;font-size:17px;letter-spacing:-.02em}
.btn{display:inline-flex;align-items:center;gap:8px;background:var(--fg);color:#fff;text-decoration:none;font-weight:700;border-radius:999px;padding:14px 26px;font-size:16px;transition:transform .15s,box-shadow .15s;box-shadow:0 1px 0 rgba(0,0,0,.04),0 8px 24px -10px rgba(0,0,0,.45)}
.btn:hover{transform:translateY(-1px)}
.btn.ghost{background:transparent;color:var(--fg);box-shadow:none;border:1px solid var(--line);padding:9px 16px;font-size:14px}
.hero{text-align:center;padding:56px 0 0}
.pill{display:inline-flex;gap:8px;align-items:center;font-size:13px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:6px 14px;background:var(--soft)}
.pill b{color:var(--fg)}
h1{font-size:clamp(36px,6.4vw,62px);line-height:1.04;letter-spacing:-.045em;margin:22px auto 18px;max-width:820px}
.lead{font-size:clamp(17px,2.2vw,20px);line-height:1.55;color:var(--muted);margin:0 auto 30px;max-width:640px}
.ctas{display:flex;gap:14px;justify-content:center;align-items:center;flex-wrap:wrap}
.link{font-weight:700;text-decoration:none;color:var(--muted);font-size:15px}.link:hover{color:var(--fg)}
.note{font-size:13px;color:var(--muted);margin-top:14px}
.phones{position:relative;display:flex;justify-content:center;align-items:flex-end;gap:0;margin:48px auto 0;height:clamp(380px,62vw,620px);max-width:860px;overflow:hidden;padding:0 10px}
.phones::after{content:"";position:absolute;left:0;right:0;bottom:0;height:120px;background:linear-gradient(transparent,var(--bg))}
.phone{flex:none;width:clamp(170px,27vw,280px);border-radius:34px;border:8px solid #111;background:#111;overflow:hidden;box-shadow:0 30px 60px -25px rgba(0,0,0,.45)}
.phone img{border-radius:26px;width:100%;height:auto}
.phone.side{transform:translateY(40px) scale(.9);opacity:.96}
.phone.l{margin-right:-34px;transform:translateY(40px) rotate(-5deg) scale(.9)}
.phone.r{margin-left:-34px;transform:translateY(40px) rotate(5deg) scale(.9)}
.phone.mid{position:relative;z-index:2;transform:translateY(0)}
section{padding:72px 0 0}
h2{font-size:clamp(26px,3.6vw,36px);letter-spacing:-.035em;line-height:1.1;margin:0 0 10px;text-align:center}
.sub{color:var(--muted);text-align:center;margin:0 auto 34px;max-width:560px}
.steps{list-style:none;padding:0;margin:34px 0 0;display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.steps li{background:var(--soft);border-radius:22px;padding:24px}
.num{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--fg);color:#fff;font-weight:700;font-size:15px;margin-bottom:16px}
.steps b,.feat b{display:block;font-size:17px;letter-spacing:-.01em;margin-bottom:6px}
.steps p,.feat p{margin:0;color:var(--muted);font-size:15px;line-height:1.55}
.feat{list-style:none;padding:0;margin:34px 0 0;display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.feat li{border:1px solid var(--line);border-radius:22px;padding:24px;background:var(--card)}
.tick{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:9px;background:var(--soft);margin-bottom:14px;font-weight:700;font-size:14px}
.prose{max-width:680px;margin:0 auto;text-align:center;color:var(--muted);font-size:17px}
.prose p{margin:0 0 14px}
.faq{max-width:760px;margin:30px auto 0;display:grid;gap:10px}
details{border:1px solid var(--line);border-radius:16px;padding:16px 20px;background:var(--card)}
summary{cursor:pointer;font-weight:700;list-style:none;display:flex;justify-content:space-between;gap:16px}
summary::-webkit-details-marker{display:none}
summary::after{content:"+";font-weight:400;font-size:22px;line-height:1;color:var(--muted)}
details[open] summary::after{content:"–"}
details p{margin:10px 0 0;color:var(--muted)}
.cta{text-align:center;margin:80px 0 0;padding:56px 24px;border-radius:30px;background:#111;color:#fff}
.cta h2{color:#fff;margin-bottom:12px}
.cta p{color:#b9b9b9;margin:0 0 26px;font-size:17px}
.cta .btn{background:#fff;color:#111}
footer{margin-top:64px;padding:28px 0 44px;border-top:1px solid var(--line);font-size:14px;color:var(--muted)}
footer .wrap{display:flex;flex-wrap:wrap;gap:10px 20px}
footer a{text-decoration:none}footer a:hover{color:var(--fg)}
@media (max-width:640px){.hero{padding-top:36px}.phone.l,.phone.r{margin:0 -70px}.phone{width:200px}section{padding-top:56px}.cta{border-radius:24px;padding:44px 20px}}
`;

export function renderPage(page, analytics) {
  const url = `${SITE}/${page.slug}/`;
  const faqLd = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: page.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
  const steps = (items) => `<ol class="steps">${items.map(([t, d], i) => `<li><span class="num">${i + 1}</span><b>${esc(t)}</b><p>${esc(d)}</p></li>`).join("")}</ol>`;
  const body = page.sections
    .map((s, k) => {
      let h = `<section${k === 0 ? ' id="how"' : ""}><div class="narrow"><h2>${esc(s.h)}</h2></div>`;
      if (s.steps) h += steps(s.steps);
      if (s.list) h += `<ul class="feat">${s.list.map(([t, d]) => `<li><span class="tick">✓</span><b>${esc(t)}</b><p>${esc(d)}</p></li>`).join("")}</ul>`;
      if (s.paras) h += `<div class="prose" style="margin-top:18px">${s.paras.map((p) => `<p>${esc(p)}</p>`).join("")}</div>`;
      return h + "</section>";
    })
    .join("\n");
  const how = page.slug === "about" ? `<section><div class="narrow"><h2>How it works</h2></div>${steps(STEPS)}</section>` : "";
  const shots = page.shots ?? ["notes", "quiz", "flashcards"];
  const alt = { notes: "Revision notes in SlideQuiz", quiz: "A practice question in SlideQuiz", flashcards: "A flashcard in SlideQuiz", marked: "A written answer marked in SlideQuiz", progress: "Progress by topic in SlideQuiz", upload: "Uploading lecture slides to SlideQuiz" };
  const phone = (n, cls) => `<div class="phone ${cls}"><img src="/img/${n}.webp" alt="${alt[n]}" width="600" height="1240" loading="${cls === "mid" ? "eager" : "lazy"}" /></div>`;
  const cta = page.cta ?? ["Try SlideQuiz free", "/"];
  const others = PAGES.filter((p) => p.slug !== page.slug);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<!-- How the visitor found SlideQuiz (e.g. "Google Ads → home"), kept for this visit only and saved with the account if they sign up. -->
<script>
(function(){try{if(sessionStorage.getItem("slidequiz:source"))return;var q=new URLSearchParams(location.search),s,me=location.hostname.replace(/^www\\./,"");
if(q.get("gclid")||q.get("gbraid")||q.get("wbraid"))s="Google Ads";else if(q.get("utm_source"))s=q.get("utm_source").slice(0,40);
else{var r=document.referrer?new URL(document.referrer).hostname.replace(/^www\\./,""):"";if(r===me)return;
s=!r?"Direct":/(^|\\.)google\\./.test(r)?"Google search":/(^|\\.)bing\\./.test(r)?"Bing":/duckduckgo/.test(r)?"DuckDuckGo":/reddit\\./.test(r)?"Reddit":/tiktok\\./.test(r)?"TikTok":/instagram\\./.test(r)?"Instagram":/(facebook|fb)\\./.test(r)?"Facebook":/youtube\\.|youtu\\.be/.test(r)?"YouTube":/thestudentroom/.test(r)?"The Student Room":/(^|\\.)slidequiz\\./.test(r)?"Direct":r.slice(0,60);}
sessionStorage.setItem("slidequiz:source",s+" → "+(location.pathname==="/"?"home":location.pathname.replace(/\\/$/,"").slice(0,60)));}catch(e){}})();
</script>
<!-- Google tag (Consent Mode): no ad cookies unless the visitor clicks Accept on SlideQuiz's cookie banner. -->
<script async src="https://www.googletagmanager.com/gtag/js?id=AW-18485189868"></script>
<script>
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
(function(){var c=null;try{c=localStorage.getItem("slidequiz:cookies")}catch(e){}var ok=c==="yes"?"granted":"denied";
gtag("consent","default",{ad_storage:ok,ad_user_data:ok,ad_personalization:"denied",analytics_storage:"denied",wait_for_update:500});
gtag("set","ads_data_redaction",ok!=="granted");gtag("js",new Date());gtag("config","AW-18485189868");})();
</script>
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
<meta name="color-scheme" content="light" />
<style>${CSS.trim()}</style>
<script type="application/ld+json">${JSON.stringify(faqLd)}</script>
</head>
<body>
<header><div class="wrap"><a class="brand" href="/">${LOGO}SlideQuiz</a><a class="btn ghost" href="/">Open SlideQuiz</a></div></header>
<main class="wrap">
<div class="hero">
<span class="pill"><b>Free to try</b> · No card needed · Phone and laptop</span>
<h1>${esc(page.h1)}</h1>
<p class="lead">${esc(page.lead)}</p>
<div class="ctas"><a class="btn" href="${cta[1]}">${esc(cta[0])} →</a><a class="link" href="#how">How it works ↓</a></div>
${page.note && page.note !== "Free account, no card needed." ? `<p class="note">${esc(page.note)}</p>` : ""}
<div class="phones">${phone(shots[0], "l")}${phone(shots[1], "mid")}${phone(shots[2], "r")}</div>
</div>
${how}
${body}
<section><div class="narrow"><h2>Questions</h2></div><div class="faq">
${page.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n")}
</div></section>
<div class="cta"><h2>Revise from your own slides</h2><p>Upload a lecture and get notes, flashcards and practice questions in about a minute.</p><a class="btn" href="${cta[1]}">${esc(cta[0])} →</a></div>
</main>
<footer><div class="wrap"><a href="/">SlideQuiz</a>${others.map((p) => `<a href="/${p.slug}/">${esc(p.title)}</a>`).join("")}<a href="/#/privacy">Privacy policy</a></div></footer>
${analytics}
<script>
  // Coming from an ad: keep the ad's click id on links into the app, so a later sign-up or purchase is credited to the ad.
  (function () {
    var q = new URLSearchParams(location.search), keep = new URLSearchParams();
    ["gclid", "gbraid", "wbraid"].forEach(function (k) { if (q.get(k)) keep.set(k, q.get(k)); });
    if (!keep.toString()) return;
    document.querySelectorAll('a[href^="/"]').forEach(function (a) {
      var h = a.getAttribute("href"), i = h.indexOf("#");
      var path = i < 0 ? h : h.slice(0, i), hash = i < 0 ? "" : h.slice(i);
      if (/\.(png|ico|svg)/.test(path)) return;
      a.setAttribute("href", path + (path.indexOf("?") < 0 ? "?" : "&") + keep.toString() + hash);
    });
  })();
</script>
</body>
</html>
`;
}

export function sitemap() {
  const urls = [`${SITE}/`, ...PAGES.map((p) => `${SITE}/${p.slug}/`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`;
}
