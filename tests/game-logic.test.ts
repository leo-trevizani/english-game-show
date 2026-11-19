import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('index.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, 'index.html must contain an inline <script> block');

const sandbox = {
  window: {} as Record<string, any>,
  document: {
    addEventListener: () => {},
    getElementById: () => ({ addEventListener: () => {}, setAttribute: () => {}, removeAttribute: () => {}, textContent: '' }),
    createElement: () => ({ textContent: '', innerHTML: '' }),
    body: { dataset: {} },
    documentElement: {}
  },
  URLSearchParams
};
vm.createContext(sandbox);
vm.runInContext(scriptMatch[1], sandbox);

const engine = sandbox.window.__GAME_ENGINE__;

test('index.html has zero external CDN links and uses local News_1..News_12 screenshots', () => {
  assert.equal(/<(?:link|script)[^>]+(?:href|src)=["']https?:\/\//i.test(html), false, 'Should not load external CDN scripts or stylesheets');
  assert.equal(/@import\s+url\(["']?https?:\/\//i.test(html), false, 'Should not import external CDN stylesheets');
  assert.ok(
    html.includes('id="framing-img"'),
    'Game 4 must include #framing-img'
  );
});

test('Trivia contains 11 English questions and buildTriviaDeck shuffles questions and options while preserving correct answers', () => {
  assert.equal(engine.GAME_DATA.trivia.length, 11);

  // Build two decks with deterministic reversed/stepped PRNGs to confirm reordering
  let seedA = 1;
  const rngA = () => ((seedA = (seedA * 16807) % 2147483647) / 2147483647);
  let seedB = 99991;
  const rngB = () => ((seedB = (seedB * 16807) % 2147483647) / 2147483647);

  const deckA = engine.buildTriviaDeck(engine.GAME_DATA.trivia, rngA);
  const deckB = engine.buildTriviaDeck(engine.GAME_DATA.trivia, rngB);

  assert.equal(deckA.length, 11);
  assert.notDeepEqual(
    deckA.map((q: any) => q.question),
    deckB.map((q: any) => q.question)
  );

  // Verify every shuffled question still maps correctIndex to the exact original correct answer text
  const expectedAnswers = new Map(
    engine.GAME_DATA.trivia.map((q: any) => [q.question, q.options[q.correctIndex]])
  );
  for (const q of deckA) {
    assert.equal(q.options.length, 4);
    assert.equal(q.options[q.correctIndex], expectedAnswers.get(q.question));
  }
});

test('Trivia state transitions cleanly between Question (A), Answer (B), and Next/Prev', () => {
  const initial = engine.createGameState().trivia;
  assert.equal(initial.index, 0);
  assert.equal(initial.total, 11);
  assert.equal(initial.revealed, false);

  const revealed = engine.stepTrivia(initial, 'next');
  assert.equal(revealed.index, 0);
  assert.equal(revealed.revealed, true);

  const nextQ = engine.stepTrivia(revealed, 'next');
  assert.equal(nextQ.index, 1);
  assert.equal(nextQ.revealed, false);

  const backToQ0Reveal = engine.stepTrivia(nextQ, 'prev');
  assert.equal(backToQ0Reveal.index, 0);
  assert.equal(backToQ0Reveal.revealed, true);

  const backToQ0Unrevealed = engine.stepTrivia(backToQ0Reveal, 'prev');
  assert.equal(backToQ0Unrevealed.index, 0);
  assert.equal(backToQ0Unrevealed.revealed, false);

  // Clamp at start
  const clampedStart = engine.stepTrivia(backToQ0Unrevealed, 'prev');
  assert.equal(clampedStart.index, 0);
  assert.equal(clampedStart.revealed, false);
});

test('Flashcards contain 40 PT-BR prompts with answers, and swipe increments score only on correct', () => {
  assert.equal(engine.GAME_DATA.flashcards.length, 40);
  for (const card of engine.GAME_DATA.flashcards) {
    assert.ok(typeof card.prompt === 'string' && card.prompt.length > 0);
    assert.ok(Array.isArray(card.answers) && card.answers.length > 0);
  }

  let seedA = 7;
  const rngA = () => ((seedA = (seedA * 16807) % 2147483647) / 2147483647);
  let seedB = 54321;
  const rngB = () => ((seedB = (seedB * 16807) % 2147483647) / 2147483647);
  const deckA = engine.shuffleArray(engine.GAME_DATA.flashcards, rngA);
  const deckB = engine.shuffleArray(engine.GAME_DATA.flashcards, rngB);
  assert.equal(deckA.length, 40);
  assert.notDeepEqual(
    deckA.map((c: any) => c.prompt),
    deckB.map((c: any) => c.prompt)
  );

  let f = engine.createGameState().flashcards;
  assert.equal(f.total, 40);
  assert.equal(f.correct, 0);
  assert.equal(f.index, 0);

  f = engine.swipeFlashcard(f, 'correct');
  assert.equal(f.correct, 1);
  assert.equal(f.index, 1);

  f = engine.swipeFlashcard(f, 'skip');
  assert.equal(f.correct, 1);
  assert.equal(f.index, 2);

  f = engine.resetFlashcards(f.total);
  assert.equal(f.correct, 0);
  assert.equal(f.index, 0);
});

test('Write them Right has 98 unique words and randomizeTables samples balanced, non-overlapping 25-word grids', () => {
  const words = engine.GAME_DATA.tables.words;
  assert.equal(words.length, 98);
  assert.equal(new Set(words).size, 98, 'Word bank should have no duplicate entries');

  const tiers = engine.splitVocabTiers(words);
  const easySet = new Set(tiers.easy);
  const mediumSet = new Set(tiers.medium);
  const hardSet = new Set(tiers.hard);

  let seedA = 11;
  const rngA = () => ((seedA = (seedA * 16807) % 2147483647) / 2147483647);
  let seedB = 77773;
  const rngB = () => ((seedB = (seedB * 16807) % 2147483647) / 2147483647);

  const randA = engine.randomizeTables(engine.GAME_DATA.tables, rngA);
  const randB = engine.randomizeTables(engine.GAME_DATA.tables, rngB);

  assert.equal(randA.left.length, 25);
  assert.equal(randA.right.length, 25);
  assert.equal(new Set([...randA.left, ...randA.right]).size, 50, 'Left and Right tables must share zero words');
  assert.notDeepEqual(randA.left, randB.left);
  assert.notDeepEqual(randA.right, randB.right);

  const countTiers = (list: string[]) => ({
    easy: list.filter((w) => easySet.has(w)).length,
    medium: list.filter((w) => mediumSet.has(w)).length,
    hard: list.filter((w) => hardSet.has(w)).length
  });

  assert.deepEqual(countTiers(randA.left), { easy: 9, medium: 8, hard: 8 });
  assert.deepEqual(countTiers(randA.right), { easy: 9, medium: 8, hard: 8 });
  assert.deepEqual(countTiers(randB.left), { easy: 9, medium: 8, hard: 8 });
  assert.deepEqual(countTiers(randB.right), { easy: 9, medium: 8, hard: 8 });
});

test('Guess the Framing contains 12 news cases with valid URLs/tags and transitions cleanly', () => {
  assert.equal(engine.GAME_DATA.framingTags.length, 5);
  assert.equal(engine.GAME_DATA.framing.length, 12);

  engine.GAME_DATA.framing.forEach((item: any, idx: number) => {
    assert.ok(typeof item.headline === 'string' && item.headline.length > 0);
    assert.match(item.url, /^https:\/\//);
    assert.match(item.image, new RegExp(`^\\./assets/aistudio/News_${idx + 1}_[a-f0-9]+\\.png$`));
    assert.ok(
      fs.existsSync(item.image.replace(/^\.\//, 'public/')),
      `Missing local framing image file: ${item.image}`
    );
    assert.ok(
      engine.GAME_DATA.framingTags.includes(item.correctTag),
      `Invalid framing tag: ${item.correctTag}`
    );
  });

  let seedA = 13;
  const rngA = () => ((seedA = (seedA * 16807) % 2147483647) / 2147483647);
  let seedB = 98765;
  const rngB = () => ((seedB = (seedB * 16807) % 2147483647) / 2147483647);

  const deckA = engine.buildFramingDeck(engine.GAME_DATA.framing, rngA);
  const deckB = engine.buildFramingDeck(engine.GAME_DATA.framing, rngB);
  assert.equal(deckA.length, 12);
  assert.equal(deckB.length, 12);
  assert.notDeepEqual(
    deckA.map((c: any) => c.headline),
    deckB.map((c: any) => c.headline)
  );
  assert.notDeepEqual(
    deckA.map((c: any) => c.headline),
    engine.GAME_DATA.framing.map((c: any) => c.headline)
  );

  let fr = engine.createGameState().framing;
  assert.equal(fr.index, 0);
  assert.equal(fr.total, 12);
  assert.equal(fr.revealed, false);

  fr = engine.stepFraming(fr, 'next');
  assert.equal(fr.index, 0);
  assert.equal(fr.revealed, true);

  fr = engine.stepFraming(fr, 'next');
  assert.equal(fr.index, 1);
  assert.equal(fr.revealed, false);

  fr = engine.stepFraming(fr, 'prev');
  assert.equal(fr.index, 0);
  assert.equal(fr.revealed, true);

  // Advance through all 12 items and clamp at last revealed state
  for (let i = 0; i < 30; i++) {
    fr = engine.stepFraming(fr, 'next');
  }
  assert.equal(fr.index, 11);
  assert.equal(fr.revealed, true);
});
