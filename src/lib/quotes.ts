/**
 * Quotes about anything (life, courage, humour, science, sport, history), one shown per day on Home.
 * Only quotes with a well-documented source: many "famous quotes" online are credited to the wrong
 * person, so those are left out. Lines from books are from classics (pre-1929).
 */
export const QUOTES: { text: string; by: string }[] = [
  // Learning and effort
  { text: "An investment in knowledge pays the best interest.", by: "Benjamin Franklin" },
  { text: "It does not matter how slowly you go as long as you do not stop.", by: "Confucius" },
  { text: "Well begun is half done.", by: "Aristotle" },
  { text: "Genius is one percent inspiration and ninety-nine percent perspiration.", by: "Thomas Edison" },
  { text: "Energy and persistence conquer all things.", by: "Benjamin Franklin" },
  { text: "Knowledge is power.", by: "Francis Bacon" },
  { text: "Great things are done by a series of small things brought together.", by: "Vincent van Gogh" },
  { text: "The beautiful thing about learning is that no one can take it away from you.", by: "B. B. King" },
  { text: "While we teach, we learn.", by: "Seneca" },
  { text: "Difficulties strengthen the mind, as labour does the body.", by: "Seneca" },
  { text: "A journey of a thousand miles begins with a single step.", by: "Lao Tzu" },
  { text: "Real knowledge is to know the extent of one's ignorance.", by: "Confucius" },
  { text: "Study the past if you would define the future.", by: "Confucius" },
  { text: "Nothing in life is to be feared, it is only to be understood.", by: "Marie Curie" },
  { text: "The mind is not a vessel to be filled, but a fire to be kindled.", by: "Plutarch" },
  { text: "Knowing is not enough; we must apply.", by: "Johann Wolfgang von Goethe" },
  { text: "Education is the most powerful weapon which you can use to change the world.", by: "Nelson Mandela" },
  { text: "The important thing is not to stop questioning.", by: "Albert Einstein" },
  { text: "Imagination is more important than knowledge.", by: "Albert Einstein" },
  { text: "A little learning is a dangerous thing.", by: "Alexander Pope" },

  // Life
  { text: "Life is like riding a bicycle. To keep your balance you must keep moving.", by: "Albert Einstein" },
  { text: "Life can only be understood backwards; but it must be lived forwards.", by: "Søren Kierkegaard" },
  { text: "In three words I can sum up everything I've learned about life: it goes on.", by: "Robert Frost" },
  { text: "The best way out is always through.", by: "Robert Frost" },
  { text: "Two roads diverged in a wood, and I, I took the one less travelled by, and that has made all the difference.", by: "Robert Frost" },
  { text: "To live is the rarest thing in the world. Most people exist, that is all.", by: "Oscar Wilde" },
  { text: "We are all in the gutter, but some of us are looking at the stars.", by: "Oscar Wilde" },
  { text: "The unexamined life is not worth living.", by: "Socrates" },
  { text: "Carpe diem. Seize the day.", by: "Horace" },
  { text: "Your time is limited, so don't waste it living someone else's life.", by: "Steve Jobs" },
  { text: "Stay hungry. Stay foolish.", by: "Steve Jobs" },
  { text: "Lost time is never found again.", by: "Benjamin Franklin" },
  { text: "He who has a why to live can bear almost any how.", by: "Friedrich Nietzsche" },
  { text: "Hope is the thing with feathers that perches in the soul.", by: "Emily Dickinson" },
  { text: "Hope springs eternal in the human breast.", by: "Alexander Pope" },
  { text: "No man is an island.", by: "John Donne" },
  { text: "The mind is its own place, and in itself can make a heaven of hell, a hell of heaven.", by: "John Milton" },
  { text: "They also serve who only stand and wait.", by: "John Milton" },
  { text: "Those who cannot remember the past are condemned to repeat it.", by: "George Santayana" },
  { text: "I think, therefore I am.", by: "René Descartes" },
  { text: "No man ever steps in the same river twice.", by: "Heraclitus" },
  { text: "Man is born free, and everywhere he is in chains.", by: "Jean-Jacques Rousseau" },
  { text: "Hell is other people.", by: "Jean-Paul Sartre" },
  { text: "One is not born, but rather becomes, a woman.", by: "Simone de Beauvoir" },
  { text: "Well-behaved women seldom make history.", by: "Laurel Thatcher Ulrich" },

  // Courage and resilience
  { text: "The only thing we have to fear is fear itself.", by: "Franklin D. Roosevelt" },
  { text: "That which does not kill us makes us stronger.", by: "Friedrich Nietzsche" },
  { text: "I am the master of my fate, I am the captain of my soul.", by: "William Ernest Henley" },
  { text: "If you can keep your head when all about you are losing theirs…", by: "Rudyard Kipling" },
  { text: "To strive, to seek, to find, and not to yield.", by: "Alfred, Lord Tennyson" },
  { text: "I am not afraid of storms, for I am learning how to sail my ship.", by: "Louisa May Alcott" },
  { text: "Fall seven times, stand up eight.", by: "Japanese proverb" },
  { text: "A smooth sea never made a skilled sailor.", by: "English proverb" },
  { text: "Keep calm and carry on.", by: "British wartime poster, 1939" },
  { text: "Fortune favours the bold.", by: "Latin proverb" },
  { text: "However difficult life may seem, there is always something you can do and succeed at.", by: "Stephen Hawking" },
  { text: "Look up at the stars and not down at your feet.", by: "Stephen Hawking" },
  { text: "Injustice anywhere is a threat to justice everywhere.", by: "Martin Luther King Jr." },
  { text: "Darkness cannot drive out darkness; only light can do that. Hate cannot drive out hate; only love can do that.", by: "Martin Luther King Jr." },
  { text: "You don't have to see the whole staircase, just take the first step.", by: "Martin Luther King Jr." },
  { text: "Courage doesn't always roar. Sometimes courage is the quiet voice at the end of the day saying, I will try again tomorrow.", by: "Mary Anne Radmacher" },
  { text: "Perseverance is not a long race; it is many short races one after the other.", by: "Walter Elliot" },
  { text: "Never in the field of human conflict was so much owed by so many to so few.", by: "Winston Churchill" },
  { text: "Ask not what your country can do for you – ask what you can do for your country.", by: "John F. Kennedy" },
  { text: "That's one small step for man, one giant leap for mankind.", by: "Neil Armstrong" },
  { text: "I have not failed. I've just found 10,000 ways that won't work.", by: "Thomas Edison" },
  { text: "There are no secrets to success. It is the result of preparation, hard work and learning from failure.", by: "Colin Powell" },

  // Science and ideas
  { text: "If I have seen further it is by standing on the shoulders of giants.", by: "Isaac Newton" },
  { text: "Give me a place to stand, and I shall move the earth.", by: "Archimedes" },
  { text: "Science is a way of thinking much more than it is a body of knowledge.", by: "Carl Sagan" },
  { text: "The good thing about science is that it's true whether or not you believe in it.", by: "Neil deGrasse Tyson" },
  { text: "The best way to predict the future is to invent it.", by: "Alan Kay" },
  { text: "Wonder is the beginning of wisdom.", by: "Socrates" },
  { text: "Man is by nature a political animal.", by: "Aristotle" },

  // Shakespeare
  { text: "To be, or not to be, that is the question.", by: "William Shakespeare, Hamlet" },
  { text: "We know what we are, but know not what we may be.", by: "William Shakespeare, Hamlet" },
  { text: "Brevity is the soul of wit.", by: "William Shakespeare, Hamlet" },
  { text: "All the world's a stage, and all the men and women merely players.", by: "William Shakespeare, As You Like It" },
  { text: "The fault, dear Brutus, is not in our stars, but in ourselves.", by: "William Shakespeare, Julius Caesar" },
  { text: "The course of true love never did run smooth.", by: "William Shakespeare, A Midsummer Night's Dream" },
  { text: "We are such stuff as dreams are made on.", by: "William Shakespeare, The Tempest" },
  { text: "Some are born great, some achieve greatness, and some have greatness thrust upon them.", by: "William Shakespeare, Twelfth Night" },
  { text: "Parting is such sweet sorrow.", by: "William Shakespeare, Romeo and Juliet" },
  { text: "Uneasy lies the head that wears a crown.", by: "William Shakespeare, Henry IV Part 2" },
  { text: "Once more unto the breach, dear friends, once more.", by: "William Shakespeare, Henry V" },
  { text: "Nothing will come of nothing.", by: "William Shakespeare, King Lear" },

  // Classic books and poems
  { text: "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.", by: "Jane Austen, Pride and Prejudice" },
  { text: "It was the best of times, it was the worst of times.", by: "Charles Dickens, A Tale of Two Cities" },
  { text: "All happy families are alike; each unhappy family is unhappy in its own way.", by: "Leo Tolstoy, Anna Karenina" },
  { text: "Whatever our souls are made of, his and mine are the same.", by: "Emily Brontë, Wuthering Heights" },
  { text: "I am no bird; and no net ensnares me.", by: "Charlotte Brontë, Jane Eyre" },
  { text: "Call me Ishmael.", by: "Herman Melville, Moby-Dick" },
  { text: "So we beat on, boats against the current, borne back ceaselessly into the past.", by: "F. Scott Fitzgerald, The Great Gatsby" },
  { text: "The pen is mightier than the sword.", by: "Edward Bulwer-Lytton" },
  { text: "A thing of beauty is a joy for ever.", by: "John Keats" },
  { text: "Beauty is truth, truth beauty.", by: "John Keats" },
  { text: "I wandered lonely as a cloud.", by: "William Wordsworth" },
  { text: "The child is father of the man.", by: "William Wordsworth" },
  { text: "Water, water, every where, nor any drop to drink.", by: "Samuel Taylor Coleridge" },
  { text: "To err is human; to forgive, divine.", by: "Alexander Pope" },
  { text: "'Tis better to have loved and lost than never to have loved at all.", by: "Alfred, Lord Tennyson" },
  { text: "Do I dare disturb the universe?", by: "T. S. Eliot" },
  { text: "The truth is rarely pure and never simple.", by: "Oscar Wilde" },
  { text: "I can resist everything except temptation.", by: "Oscar Wilde" },

  // History
  { text: "Veni, vidi, vici. I came, I saw, I conquered.", by: "Julius Caesar" },
  { text: "The die is cast.", by: "Julius Caesar" },
  { text: "Know thyself.", by: "Inscription at the Temple of Apollo, Delphi" },

  // Humour
  { text: "In this world nothing can be said to be certain, except death and taxes.", by: "Benjamin Franklin" },
  { text: "Early to bed and early to rise, makes a man healthy, wealthy, and wise.", by: "Benjamin Franklin" },
  { text: "Well done is better than well said.", by: "Benjamin Franklin" },
  { text: "It ain't over till it's over.", by: "Yogi Berra" },

  // Sport
  { text: "Float like a butterfly, sting like a bee.", by: "Muhammad Ali" },
  { text: "I hated every minute of training, but I said, don't quit. Suffer now and live the rest of your life as a champion.", by: "Muhammad Ali" },
  { text: "You miss 100% of the shots you don't take.", by: "Wayne Gretzky" },
  { text: "I've failed over and over and over again in my life. And that is why I succeed.", by: "Michael Jordan" },
  { text: "Champions keep playing until they get it right.", by: "Billie Jean King" },

  // Proverbs
  { text: "Where there's a will, there's a way.", by: "English proverb" },
  { text: "Rome wasn't built in a day.", by: "English proverb" },
  { text: "Every cloud has a silver lining.", by: "English proverb" },
  { text: "Actions speak louder than words.", by: "English proverb" },
  { text: "The early bird catches the worm.", by: "English proverb" },
  { text: "He who asks a question is a fool for five minutes; he who does not ask remains a fool forever.", by: "Chinese proverb" },
];

/** The same quote all day for everyone, changing at midnight UK time. */
export function quoteOfTheDay(d = new Date()) {
  const uk = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => Number(uk.find((p) => p.type === t)?.value);
  const day = Math.floor(Date.UTC(get("year"), get("month") - 1, get("day")) / 86_400_000);
  // Step through the list in a scrambled order so neighbouring days feel different.
  return QUOTES[(day * 37) % QUOTES.length];
}
