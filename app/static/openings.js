import { PracticeBoard, STARTING_FEN } from "/static/components/practice-board.js";
import { recordReviewFailure, recordReviewSuccess } from "/static/components/review-store.js";

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
      return (side === "all" || opening.side === side)
        && (difficulty === "all" || opening.difficulty === difficulty);
    });

    count.textContent = `${visible.length} opening courses`;
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
  const sectionCount = opening.sections?.length || 0;

  container.innerHTML = `
    <div class="opening-overview-grid">
      <section class="opening-overview-main">
        <p class="eyebrow">${opening.eco} · ${opening.difficulty} · ${opening.side}</p>
        <h1>${opening.name}</h1>
        <p>${opening.description}</p>
        <div class="opening-overview-actions">
          <a class="button primary" href="/openings/${opening.id}/train">Train this repertoire</a>
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
        <p class="eyebrow">${sectionCount} sections · main training path</p>
        <ol class="opening-line-list">
          ${opening.moves.map((move) => `
            <li>
              <span>${(move.lineIndex ?? 0) + 1}</span>
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
  const roadmap = document.querySelector("#trainer-roadmap");
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
  const timings = {
    userSettle: 250,
    opponentSettle: 220,
  };

  title.textContent = opening.name;
  ideas.innerHTML = opening.ideas.map((idea) => `<li>${idea}</li>`).join("");
  mistakes.innerHTML = opening.commonMistakes.map((mistake) => `<li>${mistake}</li>`).join("");

  const trainingLines = getTrainingLines(opening);
  let branchCompletions = loadBranchCompletions(opening.id);
  let openingProgress = loadOpeningProgress(opening.id);
  const requestedLineId = new URLSearchParams(window.location.search).get("line");
  let activeLine = trainingLines.find((line) => line.id === requestedLineId)
    || trainingLines.find((line) => line.id === openingProgress.activeLineId)
    || trainingLines[0];

  let moveIndex = 0;
  let currentFen = opening.training.startingFen === "startpos" ? STARTING_FEN : opening.training.startingFen;
  let playedMoves = [];
  const trainSide = opening.training.sideToTrain || "white";

  await restoreLineState(activeLine);

  const board = new PracticeBoard(boardElement, {
    mode: "lesson",
    initialFen: currentFen,
    orientation: trainSide === "black" ? "black" : "white",
    lockToAllowedMoves: true,
    highlightLegalMoves: true,
    animationDuration: 520,
    enableSounds: true,
    onMoveSuccess: async ({ move }) => {
      const validation = await fetchJson("/api/openings/validate-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opening_id: opening.id,
          move,
          line_id: activeLine.id,
          move_index: moveIndex,
          played_moves: playedMoves,
        }),
      });

      if (!validation.is_valid) {
        feedback.textContent = validation.message;
        feedback.className = "lesson-board-feedback error";
        queueActiveLineForReview();
        board.loadFen(currentFen, { clearHistory: false });
        return;
      }

      playedMoves.push(activeLine.moves[moveIndex].uci);
      currentFen = validation.resulting_fen;
      boardElement.classList.add("opening-board-correct");
      setTimeout(() => boardElement.classList.remove("opening-board-correct"), 520);
      feedback.textContent = validation.message;
      feedback.className = "lesson-board-feedback success";
      moveIndex += 1;

      if (moveIndex >= activeLine.moves.length) {
        markBranchComplete(activeLine.id);
      }

      saveLineProgress();
      renderTrainerState();
      await wait(timings.userSettle);
      await autoPlayOpponentMoves();
    },
    onMoveError: ({ message }) => {
      boardElement.classList.remove("opening-board-shake");
      void boardElement.offsetWidth;
      boardElement.classList.add("opening-board-shake");
      setTimeout(() => boardElement.classList.remove("opening-board-shake"), 420);
      feedback.textContent = message || "Try the highlighted opening move.";
      feedback.className = "lesson-board-feedback error";
      queueActiveLineForReview();
    },
  });

  await autoPlayOpponentMoves();

  roadmap.addEventListener("click", async (event) => {
    const section = event.target.closest(".opening-roadmap-section");
    if (event.target.matches("summary") && section) {
      rememberSectionState(opening.id, section.dataset.sectionId, section.open);
      return;
    }

    const moveItem = event.target.closest(".opening-move-list li[data-line-index]");
    if (moveItem && roadmap.contains(moveItem)) {
      event.preventDefault();
      const clickedLine = trainingLines.find((line) => line.id === moveItem.dataset.lineId);

      if (!clickedLine) {
        return;
      }

      if (clickedLine.id !== activeLine.id) {
        activeLine = clickedLine;
        openingProgress.activeLineId = activeLine.id;
      }

      await jumpToMoveIndex(Number(moveItem.dataset.lineIndex));
      return;
    }

    const button = event.target.closest(".opening-roadmap-line[data-line-id]");
    if (!button) {
      return;
    }

    const nextLine = trainingLines.find((line) => line.id === button.dataset.lineId);
    if (!nextLine || nextLine.id === activeLine.id) {
      return;
    }

    await loadBranch(nextLine);
  });

  roadmap.addEventListener("keydown", async (event) => {
    const moveItem = event.target.closest(".opening-move-list li[data-line-index]");
    if (!moveItem || !roadmap.contains(moveItem)) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    const clickedLine = trainingLines.find((line) => line.id === moveItem.dataset.lineId);

    if (!clickedLine) {
      return;
    }

    if (clickedLine.id !== activeLine.id) {
      activeLine = clickedLine;
      openingProgress.activeLineId = activeLine.id;
    }

    await jumpToMoveIndex(Number(moveItem.dataset.lineIndex));
  });

  document.addEventListener("keydown", async (event) => {
    if (event.defaultPrevented || shouldIgnoreTrainerKeydown(event.target)) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      await jumpToMoveIndex(moveIndex - 1);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      await jumpToMoveIndex(moveIndex + 1);
    }
  });

  async function loadBranch(nextLine) {
    activeLine = nextLine;
    openingProgress.activeLineId = activeLine.id;
    saveOpeningProgress(opening.id, openingProgress);
    await restoreLineState(activeLine);

    status.textContent = "Loading";
    status.className = "lesson-step-progress-state waiting";
    noteTitle.textContent = activeLine.title;
    explanation.textContent = activeLine.description || "Follow the branch one move at a time.";
    feedback.textContent = moveIndex >= activeLine.moves.length
      ? "Branch complete. The final position has been restored."
      : "Branch loaded. Follow the coach prompts.";
    feedback.className = "lesson-board-feedback";

    board.setConfig({ allowedMoves: [], highlightSquares: [] });
    board.loadFen(currentFen, { clearHistory: true });
    renderTrainerState();
    await autoPlayOpponentMoves();
  }

  async function jumpToMoveIndex(nextIndex) {
    const boundedIndex = Math.max(0, Math.min(Number(nextIndex) || 0, activeLine.moves.length));
    if (boundedIndex === moveIndex) {
      return;
    }

    await rebuildLineState(activeLine, boundedIndex);
    saveLineProgress();
    renderTrainerState();

    if (boundedIndex <= 0) {
      feedback.textContent = `Returned to the start of ${activeLine.title}.`;
    } else if (boundedIndex >= activeLine.moves.length) {
      feedback.textContent = `Jumped to the end of ${activeLine.title}.`;
    } else {
      const jumpMove = activeLine.moves[Math.max(0, boundedIndex - 1)];
      feedback.textContent = jumpMove
        ? `Jumped to ${jumpMove.san}.`
        : `Jumped within ${activeLine.title}.`;
    }

    feedback.className = "lesson-board-feedback";
  }

  async function autoPlayOpponentMoves() {
    while (moveIndex < activeLine.moves.length && !isUserMove(moveIndex, trainSide)) {
      const reply = activeLine.moves[moveIndex];

      status.textContent = "Coach move";
      prompt.textContent = `${reply.san} is the reply`;
      noteTitle.textContent = `Opponent plays ${reply.san}`;
      explanation.textContent = reply.explanation;
      board.setConfig({ allowedMoves: [], highlightSquares: moveHighlights(reply.uci) });
      renderTrainerState();

      await wait(timings.userSettle);

      const data = await board.playMove(reply.uci, {
        suppressCallbacks: true,
        suppressComplete: true,
      });

      if (!data.isValid && !data.is_valid) {
        feedback.textContent = `The line could not continue at ${reply.san}.`;
        feedback.className = "lesson-board-feedback error";
        return;
      }

      playedMoves.push(reply.uci);
      currentFen = data.resulting_fen;
      moveIndex += 1;

      if (moveIndex >= activeLine.moves.length) {
        markBranchComplete(activeLine.id);
      }

      saveLineProgress();
      renderTrainerState();
      await wait(timings.opponentSettle);
    }

    renderTrainerState();
  }

  function renderTrainerState() {
    renderOpeningRoadmap(
      roadmap,
      trainingLines,
      activeLine,
      moveIndex,
      playedMoves,
      branchCompletions,
      opening.id,
      openingProgress,
    );

    if (moveIndex >= activeLine.moves.length) {
      prompt.textContent = "Line complete.";
      kicker.textContent = `${activeLine.title} · ${playedMoves.length}/${activeLine.moves.length}`;
      noteTitle.textContent = "Training complete";
      explanation.textContent = activeLine.completionMessage
        || "Great work. You handled this real-game branch. Pick another branch in the roadmap when you are ready.";
      feedback.textContent = "Branch complete.";
      feedback.className = "lesson-board-feedback success";
      status.textContent = "Complete";
      status.className = "lesson-step-progress-state done";
      board.setConfig({ allowedMoves: [], highlightSquares: [] });
      board.loadFen(currentFen, { clearHistory: false });
      return;
    }

    const expected = activeLine.moves[moveIndex];
    const userTurn = isUserMove(moveIndex, trainSide);

    kicker.textContent = `${activeLine.title} · move ${moveIndex + 1} of ${activeLine.moves.length}`;
    board.loadFen(currentFen, { clearHistory: false });

    if (!userTurn) {
      prompt.textContent = `Review ${expected.san}`;
      noteTitle.textContent = `Opponent plays ${expected.san}`;
      explanation.textContent = expected.explanation
        || activeLine.description
        || "Step through the line with the sidebar or arrow keys.";
      status.textContent = "Preview";
      status.className = "lesson-step-progress-state waiting";
      board.setConfig({
        mode: "lesson",
        allowedMoves: [],
        lockToAllowedMoves: true,
        highlightSquares: moveHighlights(expected.uci),
        animationDuration: 520,
      });
      return;
    }

    prompt.textContent = `Play ${expected.san}`;
    noteTitle.textContent = `Why ${expected.san}?`;
    explanation.textContent = expected.explanation
      || activeLine.description
      || "Make the recommended beginner move.";
    status.textContent = "Your move";
    status.className = "lesson-step-progress-state waiting";
    board.setConfig({
      mode: "lesson",
      allowedMoves: [expected.uci],
      lockToAllowedMoves: true,
      successMessage: expected.explanation,
      errorMessage: `This line wants ${expected.san}. Try the highlighted move.`,
      highlightSquares: moveHighlights(expected.uci),
      animationDuration: 520,
    });
  }

  function markBranchComplete(lineId) {
    branchCompletions[lineId] = {
      completed: true,
      completedAt: new Date().toISOString(),
    };

    saveBranchCompletions(opening.id, branchCompletions);

    recordReviewSuccess({
      type: "opening",
      id: opening.id,
      branchId: lineId,
      title: `${opening.name}: ${activeLine.title}`,
      subtitle: opening.name,
      href: `/openings/${opening.id}/train?line=${encodeURIComponent(lineId)}`,
    });
  }

  function queueActiveLineForReview() {
    recordReviewFailure({
      type: "opening",
      id: opening.id,
      branchId: activeLine.id,
      title: `${opening.name}: ${activeLine.title}`,
      subtitle: activeLine.description || opening.name,
      href: `/openings/${opening.id}/train?line=${encodeURIComponent(activeLine.id)}`,
    });
  }

  async function restoreLineState(line) {
    const saved = normalizeSavedLineState(openingProgress.lines?.[line.id], line);

    if (saved) {
      moveIndex = saved.moveIndex;
      playedMoves = saved.playedMoves;
      currentFen = saved.currentFen;
      return;
    }

    if (branchCompletions[line.id]?.completed) {
      await rebuildLineState(line, line.moves.length);
      saveLineProgress();
      return;
    }

    resetLineState();
  }

  async function rebuildLineState(line, targetIndex) {
    resetLineState();
    const target = Math.max(0, Math.min(targetIndex, line.moves.length));

    for (let index = 0; index < target; index += 1) {
      const move = line.moves[index];
      const validation = await fetchJson("/api/openings/validate-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opening_id: opening.id,
          move: move.uci,
          line_id: line.id,
          move_index: index,
          played_moves: playedMoves,
        }),
      });

      if (!validation.is_valid) {
        resetLineState();
        return;
      }

      playedMoves.push(move.uci);
      currentFen = validation.resulting_fen;
      moveIndex = index + 1;
    }
  }

  function resetLineState() {
    moveIndex = 0;
    playedMoves = [];
    currentFen = opening.training.startingFen === "startpos"
      ? STARTING_FEN
      : opening.training.startingFen;
  }

  function saveLineProgress() {
    openingProgress = {
      ...openingProgress,
      activeLineId: activeLine.id,
      lines: {
        ...(openingProgress.lines || {}),
        [activeLine.id]: {
          moveIndex,
          playedMoves: [...playedMoves],
          currentFen,
          completed: moveIndex >= activeLine.moves.length,
          updatedAt: new Date().toISOString(),
        },
      },
    };

    saveOpeningProgress(opening.id, openingProgress);
  }
}

async function renderExplorerStats(play) {
  const statsCard = document.querySelector("#opening-stats");

  try {
    const data = await fetchJson(
      `/api/openings/explorer?database=lichess&play=${encodeURIComponent(play)}&moves=5&topGames=0&recentGames=0`,
    );

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
        ${
          (data.moves || []).slice(0, 5).map((move) => `
            <li>
              <strong>${move.san || move.uci}</strong>
              <span>${move.games.toLocaleString()} games</span>
            </li>
          `).join("")
          || "<li>No live explorer moves available.</li>"
        }
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
        <p class="eyebrow">${opening.difficulty} · ${opening.side} · ${opening.sectionCount || 1} sections · ${opening.moveCount} moves</p>
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

function renderOpeningRoadmap(
  container,
  lines,
  activeLine,
  activeIndex,
  playedMoves,
  completions = {},
  openingId = "",
  progress = {},
) {
  const sections = groupLinesBySection(lines);
  const openSections = loadOpenSections(openingId);
  const activeProgress = progressForLine(activeLine, activeIndex, completions, progress);
  const activeLineMoves = renderSidebarMoveItems(activeLine, {
    activeIndex,
    isActiveLine: true,
    isComplete: Boolean(completions[activeLine.id]?.completed),
  });

  container.innerHTML = `
    <section class="opening-roadmap-current" aria-live="polite">
      <p class="eyebrow">Current branch</p>
      <h3>${activeLine.title}</h3>
      <span>${activeLine.sectionTitle || "Opening line"}</span>
      <div class="opening-sidebar-progress" aria-label="${activeProgress.done} of ${activeProgress.total} moves complete">
        <i style="width: ${activeProgress.percent}%"></i>
      </div>
      <div class="opening-current-move-card">
        <small>${activeProgress.done}/${activeProgress.total} complete</small>
        <strong>${activeProgress.done >= activeProgress.total ? "Line complete" : "Active line"}</strong>
        <ol class="opening-move-list opening-current-line-list is-active-list" aria-label="${activeLine.title} active move list">
          ${activeLineMoves}
        </ol>
      </div>
    </section>
    ${sections.map((section) => {
      const lessons = section.lines.map((line) => {
        const isActiveLine = line.id === activeLine.id;
        const isComplete = Boolean(completions[line.id]?.completed);
        const lineProgress = progressForLine(line, isActiveLine ? activeIndex : 0, completions, progress);
        const moves = renderSidebarMoveItems(line, { activeIndex, isActiveLine, isComplete });

        return `
          <article class="opening-roadmap-entry ${isActiveLine ? "is-active-entry" : ""}">
            <button
              class="opening-roadmap-line ${isActiveLine ? "is-active" : ""} ${isComplete ? "is-complete" : ""}"
              type="button"
              data-line-id="${line.id}"
              ${isActiveLine ? 'aria-current="step"' : ""}
            >
              <span>
                <strong>${isComplete ? "✓ " : ""}${line.title}</strong>
                <em>${isActiveLine ? "Training now" : isComplete ? "Complete" : `${line.moves.length} moves`}</em>
              </span>
              <small>${line.description || "Guided response"}</small>
              <b class="opening-line-meter" aria-hidden="true"><i style="width: ${lineProgress.percent}%"></i></b>
            </button>
            <ol class="opening-move-list ${isActiveLine ? "is-active-list" : "is-line-list"}" aria-label="${line.title} move list">
              ${moves}
            </ol>
          </article>
        `;
      }).join("");

      const isOpen = section.lines.some((line) => line.id === activeLine.id)
        || openSections[section.id] !== false;

      return `
        <details class="opening-roadmap-section" data-section-id="${section.id}" ${isOpen ? "open" : ""}>
          <summary>${section.title}</summary>
          <div class="opening-roadmap-section-body">
            ${lessons}
          </div>
        </details>
      `;
    }).join("")}
  `;

  const active = container.querySelector(".opening-move-list li.active");
  active?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });

  const activeLineButton = container.querySelector(".opening-roadmap-line.is-active");
  activeLineButton?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
}

function renderSidebarMoveItems(line, { activeIndex = 0, isActiveLine = false, isComplete = false } = {}) {
  return line.moves.map((move, index) => {
    const state = isActiveLine
      ? moveTrackerState(index, activeIndex, isComplete)
      : (isComplete ? "done" : "upcoming");

    return `
      <li
        class="${state}"
        data-line-id="${line.id}"
        data-line-index="${index}"
        role="button"
        tabindex="0"
        aria-label="Jump to ${move.san} in ${line.title}"
        title="${move.title || move.uci}"
      >
        <span class="move-state-icon" aria-hidden="true">${moveStateIcon(state)}</span>
        <strong>${renderMoveLabel(move, index)}</strong>
        <small>${move.title || move.uci}</small>
      </li>
    `;
  }).join("");
}

function renderMoveLabel(move, index) {
  const moveNumber = Math.floor(index / 2) + 1;
  const prefix = index % 2 === 0 ? `${moveNumber}.` : `${moveNumber}...`;
  return `${prefix} ${move.san}`;
}

function progressForLine(line, activeIndex, completions = {}, progress = {}) {
  const total = line.moves.length || 0;
  const savedIndex = progress.lines?.[line.id]?.moveIndex;
  const done = completions[line.id]?.completed
    ? total
    : Math.max(0, Math.min(Number.isInteger(savedIndex) ? savedIndex : activeIndex, total));

  return {
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
  };
}

function moveTrackerState(index, activeIndex, isComplete) {
  if (isComplete || index < activeIndex) {
    return "done";
  }

  if (index === activeIndex) {
    return "active";
  }

  return "upcoming";
}

function moveStateIcon(state) {
  if (state === "done") {
    return "✓";
  }

  if (state === "active") {
    return "→";
  }

  return "•";
}

function normalizeSavedLineState(saved, line) {
  if (!saved || !Array.isArray(saved.playedMoves)) {
    return null;
  }

  const moveIndex = Math.max(0, Math.min(saved.moveIndex || 0, line.moves.length));
  const playedMoves = saved.playedMoves.slice(0, moveIndex);
  const expectedMoves = line.moves.slice(0, moveIndex).map((move) => move.uci);
  const isInSync = expectedMoves.every((move, index) => playedMoves[index] === move);

  if (!isInSync || !saved.currentFen) {
    return null;
  }

  return {
    moveIndex,
    playedMoves,
    currentFen: saved.currentFen,
  };
}

function getTrainingLines(opening) {
  const lines = [];

  (opening.sections || []).forEach((section) => {
    (section.branches || section.lessons || []).forEach((lesson) => {
      if (!lesson.moves?.length) {
        return;
      }

      lines.push({
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        hints: lesson.hints || [],
        coachingNotes: lesson.coachingNotes || [],
        completionMessage: lesson.completionMessage,
        sectionId: section.id,
        sectionTitle: section.title,
        isMainLine: Boolean(lesson.isMainLine),
        moves: lesson.moves.map((move, index) => ({
          ...move,
          lineIndex: index,
          sectionId: section.id,
          sectionTitle: section.title,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
        })),
      });
    });
  });

  if (!lines.length) {
    lines.push({
      id: "main-line",
      title: "Main Line",
      sectionId: "main-line",
      sectionTitle: "Main Line",
      moves: opening.moves || [],
    });
  }

  return lines.sort((a, b) => Number(b.isMainLine) - Number(a.isMainLine));
}

function groupLinesBySection(lines) {
  const groups = [];

  lines.forEach((line) => {
    let group = groups.find((entry) => entry.id === line.sectionId);

    if (!group) {
      group = { id: line.sectionId, title: line.sectionTitle, lines: [] };
      groups.push(group);
    }

    group.lines.push(line);
  });

  return groups;
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function completionKey(openingId) {
  return `freemate-opening-completions:${openingId}`;
}

function progressKey(openingId) {
  return `freemate-opening-progress:${openingId}`;
}

function openSectionsKey(openingId) {
  return `freemate-opening-open-sections:${openingId}`;
}

function loadBranchCompletions(openingId) {
  try {
    return JSON.parse(localStorage.getItem(completionKey(openingId))) || {};
  } catch (error) {
    return {};
  }
}

function saveBranchCompletions(openingId, completions) {
  localStorage.setItem(completionKey(openingId), JSON.stringify(completions));
}

function loadOpeningProgress(openingId) {
  try {
    return JSON.parse(localStorage.getItem(progressKey(openingId))) || { lines: {} };
  } catch (error) {
    return { lines: {} };
  }
}

function saveOpeningProgress(openingId, progress) {
  localStorage.setItem(progressKey(openingId), JSON.stringify({
    activeLineId: progress.activeLineId,
    lines: progress.lines || {},
  }));
}

function loadOpenSections(openingId) {
  try {
    return JSON.parse(localStorage.getItem(openSectionsKey(openingId))) || {};
  } catch (error) {
    return {};
  }
}

function rememberSectionState(openingId, sectionId, wasOpenBeforeToggle) {
  const sections = loadOpenSections(openingId);
  sections[sectionId] = !wasOpenBeforeToggle;
  localStorage.setItem(openSectionsKey(openingId), JSON.stringify(sections));
}

function shouldIgnoreTrainerKeydown(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function getOpeningId() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[0] === "openings" ? parts[1] : "";
}

function percent(value = 0, total = 0) {
  if (!total) {
    return "0%";
  }

  return `${Math.round((value / total) * 100)}%`;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}
