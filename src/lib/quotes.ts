/** Short quotes about learning and effort, one shown per day on Home. */
export const QUOTES: { text: string; by: string }[] = [
  { text: "The secret of getting ahead is getting started.", by: "Mark Twain" },
  { text: "An investment in knowledge pays the best interest.", by: "Benjamin Franklin" },
  { text: "It does not matter how slowly you go as long as you do not stop.", by: "Confucius" },
  { text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", by: "Will Durant" },
  { text: "The roots of education are bitter, but the fruit is sweet.", by: "Aristotle" },
  { text: "Well begun is half done.", by: "Aristotle" },
  { text: "Genius is one percent inspiration and ninety-nine percent perspiration.", by: "Thomas Edison" },
  { text: "The more that you read, the more things you will know.", by: "Dr. Seuss" },
  { text: "Energy and persistence conquer all things.", by: "Benjamin Franklin" },
  { text: "Knowledge is power.", by: "Francis Bacon" },
  { text: "Patience is bitter, but its fruit is sweet.", by: "Jean-Jacques Rousseau" },
  { text: "Great things are done by a series of small things brought together.", by: "Vincent van Gogh" },
  { text: "The beautiful thing about learning is that no one can take it away from you.", by: "B. B. King" },
  { text: "I have not failed. I've just found 10,000 ways that won't work.", by: "Thomas Edison" },
  { text: "While we teach, we learn.", by: "Seneca" },
  { text: "Difficulties strengthen the mind, as labour does the body.", by: "Seneca" },
  { text: "He who asks a question is a fool for five minutes; he who does not ask remains a fool forever.", by: "Chinese proverb" },
  { text: "A journey of a thousand miles begins with a single step.", by: "Lao Tzu" },
  { text: "Wonder is the beginning of wisdom.", by: "Socrates" },
  { text: "What we learn with pleasure we never forget.", by: "Alfred Mercier" },
  { text: "Study the past if you would define the future.", by: "Confucius" },
  { text: "Real knowledge is to know the extent of one's ignorance.", by: "Confucius" },
  { text: "Little by little, one travels far.", by: "J. R. R. Tolkien" },
  { text: "You don't have to see the whole staircase, just take the first step.", by: "Martin Luther King Jr." },
  { text: "Try not to become a man of success, but rather try to become a man of value.", by: "Albert Einstein" },
  { text: "Nothing in life is to be feared, it is only to be understood.", by: "Marie Curie" },
  { text: "The mind is not a vessel to be filled, but a fire to be kindled.", by: "Plutarch" },
  { text: "Either write something worth reading or do something worth writing.", by: "Benjamin Franklin" },
  { text: "Change is the end result of all true learning.", by: "Leo Buscaglia" },
  { text: "Courage doesn't always roar. Sometimes courage is the quiet voice at the end of the day saying, I will try again tomorrow.", by: "Mary Anne Radmacher" },
  { text: "Perseverance is not a long race; it is many short races one after the other.", by: "Walter Elliot" },
  { text: "There are no secrets to success. It is the result of preparation, hard work and learning from failure.", by: "Colin Powell" },
  { text: "Develop a passion for learning. If you do, you will never cease to grow.", by: "Anthony J. D'Angelo" },
  { text: "Knowing is not enough; we must apply.", by: "Johann Wolfgang von Goethe" },
];

/** The same quote all day, changing at midnight. */
export function quoteOfTheDay(d = new Date()) {
  const start = new Date(d.getFullYear(), 0, 0);
  const day = Math.floor((d.getTime() - start.getTime()) / 86_400_000);
  return QUOTES[(day + d.getFullYear()) % QUOTES.length];
}
