import { PracticeBoard, STARTING_FEN } from "/static/components/practice-board.js";

const page = document.body.dataset.openingPage;
const openingId = getOpeningId();

if (page === "browser") {
  initOpeningBrowser();
}

if (page === "overview") {
  initOpeningOverview();
}

if (page === "trainer") {
  initOpeningTrainer();
}

async function initOpeningBrowser() {
  const openings = await fetchJson("/api/openings");
  const list = document.querySelector("#opening-list");
  const count = document.querySelector("#opening-count");
  const sideFilter = document.querySelector("#opening-side-filter");
  const difficultyFilter = document.querySelector("#opening-difficulty-filter");

  const render = () => {
    const side = sideFilter.value;
    const difficulty = difficultyFilter.value;
    const visible = openings.filter((opening) => {
      return (side === "all" || opening.side === side) &&
        (difficulty === "all" || opening.difficulty === difficulty);
    });

    count.textContent = `${openings.length} opening courses`;
    list.innerHTML = visible.map(renderOpeningRow).join("");
  };

  sideFilter.addEventListener("change", render);
  difficultyFilter.addEventListener("change", render);
  render();
}

async function initOpeningOverview() {
  const opening = await fetchJson(`/api/openings/${openingId}`);
  const container = document.querySelector("#opening-overview");
  const play = opening.moves.map((move) => move.uci).join(",");

  container.innerHTML = `
    <div class="opening-overview-grid">
      <section class="opening-overview-main">
        <p class="eyebrow">${opening.eco} · ${opening.difficulty} · ${opening.side}</p>
        <h1>${opening.name}</h1>
        <p>${opening.description}</p>
        <div class="opening-overview-actions">
          <a class="button primary" href="/openings/${opening.id}/train">Train this line</a>
          <a class="button secondary" href="/openings">All openings</a>
        </div>
      </section>
      <aside class="opening-stats-card" id="opening-stats">
        <p class="eyebrow">Explorer stats</p>
        <h2>Loading data</h2>
        <p>Checking common continuations.</p>
      </aside>
    </div>
    <section class="opening-overview-grid">
      <div class="opening-line-card">
        <p class="eyebrow">Main line</p>
        <ol class="opening-line-list">
          ${opening.moves.map((move, index) => `
            <li>
              <span>${index + 1}</span>
              <strong>${move.san}</strong>
              <p>${move.explanation}</p>
            </li>
          `).join("")}
        </ol>
      </div>
      <div class="opening-line-card">
        <p class="eyebrow">Coach notes</p>
        <h2>Ideas to remember</h2>
        <ul>${opening.ideas.map((idea) => `<li>${idea}</li>`).join("")}</ul>
        <h2>Common mistakes</h2>
        <ul>${opening.commonMistakes.map((mistake) => `<li>${mistake}</li>`).join("")}</ul>
      </div>
    </section>
  `;

  renderExplorerStats(play);
}

async function initOpeningTrainer() {
  const opening = await fetchJson(`/api/openings/${openingId}`);
  const moveList = document.querySelector("#trainer-move-list");
  const title = document.querySelector("#trainer-title");
  const prompt = document.querySelector("#trainer-prompt");
  const kicker = document.querySelector("#trainer-kicker");
  const status = document.querySelector("#trainer-status");
  const feedback = document.querySelector("#trainer-feedback");
  const explanation = document.querySelector("#trainer-explanation");
  const noteTitle = document.querySelector("#trainer-note-title");
  const ideas = document.querySelector("#trainer-ideas");
  const mistakes = document.querySelector("#trainer-mistakes");
  const boardElement = document.querySelector("#opening-board");

  title.textContent = opening.name;
  ideas.innerHTML = opening.ideas.map((idea) => `<li>${idea}</li>`).join("");
  mistakes.innerHTML = opening.commonMistakes.map((mistake) => `<li>${mistake}</li>`).join("");

  let moveIndex = 0;
  let currentFen = opening.training.startingFen === "startpos" ? STARTING_FEN : opening.training.startingFen;
  const playedMoves = [];
  const trainSide = opening.training.sideToTrain || "white";

  const board = new PracticeBoard(boardElement, {
    mode: "lesson",
    initialFen: currentFen,
    orientation: trainSide === "black" ? "black" : "white",
    lockToAllowedMoves: true,
    highlightLegalMoves: true,
    enableSounds: true,
    onMoveSuccess: async ({ move }) => {
      const validation = await fetchJson("/api/openings/validate-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opening_id: opening.id,
          move,
          move_index: moveIndex,
          played_moves: playedMoves,
        }),
      });

      if (!validation.is_valid) {
        feedback.textContent = validation.message;
        feedback.className = "lesson-board-feedback error";
        board.loadFen(currentFen, { clearHistory: false });
        return;
      }

      playedMoves.push(opening.moves[moveIndex].uci);
      currentFen = validation.resulting_fen;
      feedback.textContent = validation.message;
      feedback.className = "lesson-board-feedback success";
      moveIndex += 1;
      renderTrainerState();
      await autoPlayOpponentMoves();
    },
    onMoveError: ({ message }) => {
      feedback.textContent = message || "Try the highlighted opening move.";
      feedback.className = "lesson-board-feedback error";
    },
  });

  await autoPlayOpponentMoves();

  async function autoPlayOpponentMoves() {
    while (moveIndex < opening.moves.length && !isUserMove(moveIndex, trainSide)) {
      const reply = opening.moves[moveIndex];
      const data = await fetchJson("/api/validate-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ move: reply.uci, fen: currentFen }),
      });

      if (!data.is_valid) {
        feedback.textContent = `The line could not continue at ${reply.san}.`;
        feedback.className = "lesson-board-feedback error";
        return;
      }

      playedMoves.push(reply.uci);
      currentFen = data.resulting_fen;
      moveIndex += 1;
    }
    renderTrainerState();
  }

  function renderTrainerState() {
    renderMoveList(moveList, opening.moves, moveIndex, playedMoves);

    if (moveIndex >= opening.moves.length) {
      prompt.textContent = "Line complete.";
      kicker.textContent = `${opening.name} · ${playedMoves.length}/${opening.moves.length}`;
      noteTitle.textContent = "Training complete";
      explanation.textContent = "Great work. You played the full guided line.";
      feedback.textContent = "Opening line complete. Reset the page to run it again.";
      feedback.className = "lesson-board-feedback success";
      status.textContent = "Complete";
      status.className = "lesson-step-progress-state done";
      board.setConfig({ allowedMoves: [], highlightSquares: [] });
      board.loadFen(currentFen, { clearHistory: false });
      return;
    }

    const expected = opening.moves[moveIndex];
    prompt.textContent = `Play ${expected.san}`;
    kicker.textContent = `${opening.name} · move ${moveIndex + 1} of ${opening.moves.length}`;
    noteTitle.textContent = `Why ${expected.san}?`;
    explanation.textContent = expected.explanation;
    status.textContent = "Your move";
    status.className = "lesson-step-progress-state waiting";
    board.loadFen(currentFen, { clearHistory: false });
    board.setConfig({
      mode: "lesson",
      allowedMoves: [expected.uci],
      lockToAllowedMoves: true,
      successMessage: expected.explanation,
      errorMessage: `This line wants ${expected.san}. Try the highlighted move.`,
      highlightSquares: moveHighlights(expected.uci),
    });
  }
}

async function renderExplorerStats(play) {
  const statsCard = document.querySelector("#opening-stats");
  try {
    const data = await fetchJson(`/api/openings/explorer?database=lichess&play=${encodeURIComponent(play)}&moves=5&topGames=0&recentGames=0`);
    const total = data.totals?.games || 0;
    const openingName = data.opening?.name || "Opening position";
    statsCard.innerHTML = `
      <p class="eyebrow">Lichess explorer</p>
      <h2>${openingName}</h2>
      <p>${total.toLocaleString()} games in the current query.</p>
      ${data.error ? `<p class="result error">${data.error}</p>` : ""}
      <div class="opening-stats-grid">
        <span>White ${percent(data.totals?.white, total)}</span>
        <span>Draw ${percent(data.totals?.draws, total)}</span>
        <span>Black ${percent(data.totals?.black, total)}</span>
      </div>
      <h3>Common next moves</h3>
      <ul class="opening-next-moves">
        ${(data.moves || []).slice(0, 5).map((move) => `<li><strong>${move.san || move.uci}</strong><span>${move.games.toLocaleString()} games</span></li>`).join("") || "<li>No live explorer moves available.</li>"}
      </ul>
    `;
  } catch (error) {
    statsCard.innerHTML = `
      <p class="eyebrow">Lichess explorer</p>
      <h2>Stats unavailable</h2>
      <p>The opening course still works from local FreeMate data.</p>
    `;
  }
}

function renderOpeningRow(opening) {
  return `
    <article class="opening-row">
      <div class="opening-row-thumb" aria-hidden="true">
        <span>${opening.eco}</span>
      </div>
      <div class="opening-row-main">
        <p class="eyebrow">${opening.difficulty} · ${opening.side} · ${opening.moveCount} moves</p>
        <h2>${opening.name}</h2>
        <p>${opening.description}</p>
        <div class="opening-row-meta">
          ${(opening.ideas || []).slice(0, 3).map((idea) => `<span>${idea}</span>`).join("")}
        </div>
      </div>
      <div class="opening-row-actions">
        <a class="button secondary" href="/openings/${opening.id}">Overview</a>
        <a class="button primary" href="/openings/${opening.id}/train">Train</a>
      </div>
    </article>
  `;
}

function renderMoveList(container, moves, activeIndex, playedMoves) {
  container.innerHTML = moves.map((move, index) => {
    const state = index < playedMoves.length ? "done" : index === activeIndex ? "active" : "";
    return `<li class="${state}"><span>${index + 1}</span><strong>${move.san}</strong><small>${move.uci}</small></li>`;
  }).join("");
}

function moveHighlights(uci) {
  return [
    { square: uci.slice(0, 2), className: "focus" },
    { square: uci.slice(2, 4), className: "target" },
  ];
}

function isUserMove(index, side) {
  return side === "black" ? index % 2 === 1 : index % 2 === 0;
}

function getOpeningId() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[0] === "openings" ? parts[1] : "";
}

function percent(value = 0, total = 0) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}
