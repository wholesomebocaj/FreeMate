import { PracticeBoard } from "/static/components/practice-board.js";

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export class LessonRenderer {
  constructor(container, lesson) {
    this.container = container;
    this.lesson = lesson;
    this.currentStepIndex = 0;
    this.completedSteps = new Set();
  }

  render() {
    this.renderStep();
  }

  renderStep() {
    const step = this.lesson.steps[this.currentStepIndex];

    if (!step) {
      this.renderComplete();
      return;
    }

    this.container.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "lesson-step";

    const title = document.createElement("h2");
    title.className = "lesson-step-title";
    title.textContent = step.title || "";

    const body = document.createElement("p");
    body.className = "lesson-step-body";
    body.textContent = step.body || "";

    wrapper.appendChild(title);
    wrapper.appendChild(body);

    const progress = document.createElement("div");
    progress.className = "lesson-step-progress";
    progress.innerHTML = `
      <span class="lesson-step-progress-label">
        Step ${this.currentStepIndex + 1} of ${this.lesson.steps.length}
      </span>
      <span class="lesson-step-progress-state ${
        this.completedSteps.has(this.currentStepIndex) ? "done" : "waiting"
      }">
        ${this.completedSteps.has(this.currentStepIndex) ? "Completed" : "In progress"}
      </span>
    `;
    wrapper.appendChild(progress);

    switch (step.type) {
      case "explain":
        this.renderExplainStep(wrapper, step);
        break;

      case "checklist":
        this.renderChecklistStep(wrapper, step);
        break;

      case "highlight-demo":
      case "board-task":
      case "attack-visualization":
      case "guided-puzzle":
      case "rook-practice":
      case "rook-challenge":
      case "square-click":
      case "move-validation":
        this.renderInteractiveStep(wrapper, step);
        break;

      default:
        wrapper.innerHTML += `
          <p>Unsupported lesson step type: ${step.type}</p>
        `;
    }

    const stepIndex = this.currentStepIndex;
    if (["explain", "highlight-demo", "guided-puzzle", "attack-visualization"].includes(step.type)) {
      window.setTimeout(() => {
        if (this.currentStepIndex !== stepIndex) return;
        if (!this.completedSteps.has(stepIndex)) {
          this.markStepComplete(wrapper, step);
        }
      }, 250);
    }

    const controls = document.createElement("div");
    controls.className = "lesson-controls";

    if (this.currentStepIndex > 0) {
      const backButton = document.createElement("button");
      backButton.className = "button secondary";
      backButton.textContent = "Back";
      backButton.onclick = () => {
        this.currentStepIndex--;
        this.renderStep();
      };

      controls.appendChild(backButton);
    }

    const nextButton = document.createElement("button");
    nextButton.className = "button primary";
    nextButton.textContent =
      this.currentStepIndex === this.lesson.steps.length - 1
        ? "Finish"
        : "Next";
    nextButton.disabled = !this.completedSteps.has(this.currentStepIndex);
    nextButton.title = nextButton.disabled
      ? "Complete this step to continue"
      : "";

    nextButton.onclick = () => {
      if (!this.completedSteps.has(this.currentStepIndex)) return;
      this.currentStepIndex++;
      this.renderStep();
    };

    controls.appendChild(nextButton);

    wrapper.appendChild(controls);

    this.container.appendChild(wrapper);
  }

  renderExplainStep(wrapper, step) {
    const config = this.getBoardConfig(step);
    if (config) this.renderPracticeBoard(wrapper, step, config);
  }

  renderChecklistStep(wrapper, step) {
    const list = document.createElement("ul");
    list.className = "lesson-checklist";

    (step.tasks || []).forEach((task) => {
      const item = document.createElement("li");
      item.textContent = task;
      list.appendChild(item);
    });

    wrapper.appendChild(list);

    const config = this.getBoardConfig(step);
    if (config) this.renderPracticeBoard(wrapper, step, config);
  }

  renderInteractiveStep(wrapper, step) {
    this.renderPracticeBoard(wrapper, step, this.getBoardConfig(step));
  }

  renderPracticeBoard(wrapper, step, config) {
    if (!config) return;

    const boardContainer = document.createElement("div");
    boardContainer.className = "practice-board lesson-practice-board";

    wrapper.appendChild(boardContainer);

    new PracticeBoard(boardContainer, {
      ...config,
      mode: "lesson",
      highlightLegalMoves: true,
      showCoordinates: true,
      successMessage: step.successText || config.successMessage,
      errorMessage: config.errorMessage,
      onSquareSelect: ["square-click", "click-all-squares"].includes(step.type)
        ? ({ square }) => this.handleSquareClick(wrapper, step, square, config)
        : undefined,
      onMoveSuccess: ({ message }) => {
        this.showBoardFeedback(wrapper, message, "success");
        this.markStepComplete(wrapper, step);
      },
      onMoveError: ({ message }) => {
        this.showBoardFeedback(wrapper, message, "error");
      },
      onComplete: () => {
        if (step.type !== "square-click" && step.type !== "click-all-squares") {
          this.markStepComplete(wrapper, step);
        }
      },
    });

    const note = document.createElement("p");
    note.className = "lesson-step-note";
    note.textContent =
      step.type === "click-all-squares"
        ? "Complete every highlighted square to unlock the next step."
        : step.type === "square-click"
          ? "Click the target square to continue."
          : step.type === "board-task"
            ? "Make the correct board action to continue."
            : "Complete the interaction to continue.";
    wrapper.appendChild(note);

    if (step.type === "click-all-squares") {
      const counter = document.createElement("p");
      counter.className = "lesson-step-note";
      counter.setAttribute("data-click-all-progress", "true");
      counter.textContent = "0 squares found";
      wrapper.appendChild(counter);
    }
  }

  handleSquareClick(wrapper, step, square, config) {
    if (step.type === "click-all-squares") {
      this.handleClickAllSquares(wrapper, step, square, config);
      return;
    }

    if (!step.targetSquare) return;

    if (square === step.targetSquare) {
      this.showBoardFeedback(
        wrapper,
        step.successText || config.successMessage || `Correct. ${square.toUpperCase()} is the target square.`,
        "success",
      );
      this.markStepComplete(wrapper, step);
      return;
    }

    this.showBoardFeedback(
      wrapper,
      step.errorText || config.errorMessage || `Try again. Click ${step.targetSquare.toUpperCase()}.`,
      "error",
    );
  }

  handleClickAllSquares(wrapper, step, square, config) {
    const targetSquares = new Set(step.targetSquares || []);
    const progress = wrapper.querySelector("[data-click-all-progress]");
    const done = wrapper.__clickAllDone || (wrapper.__clickAllDone = new Set());

    if (!targetSquares.size) return;

    if (targetSquares.has(square)) {
      done.add(square);
      if (progress) {
        progress.textContent = `${done.size}/${targetSquares.size} squares found`;
      }
      if (done.size === targetSquares.size) {
        this.showBoardFeedback(
          wrapper,
          step.successText || config.successMessage || "Great job. You found them all.",
          "success",
        );
        this.markStepComplete(wrapper, step);
      } else {
        this.showBoardFeedback(
          wrapper,
          `Good. ${done.size} of ${targetSquares.size} squares found.`,
          "success",
        );
      }
      return;
    }

    this.showBoardFeedback(
      wrapper,
      step.errorText || config.errorMessage || "Not quite. Try another highlighted square.",
      "error",
    );
  }

  markStepComplete(wrapper, step) {
    if (step.completeOnSuccess === false) return;
    this.completedSteps.add(this.currentStepIndex);
    wrapper.dataset.stepComplete = "true";
    const stepState = wrapper.querySelector(".lesson-step-progress-state");
    if (stepState) {
      stepState.textContent = "Completed";
      stepState.classList.remove("waiting");
      stepState.classList.add("done");
    }
    const nextButton = wrapper.querySelector(".lesson-controls .button.primary");
    if (nextButton) {
      nextButton.disabled = false;
      nextButton.title = "";
    }
  }

  showBoardFeedback(wrapper, message, type) {
    let feedback = wrapper.querySelector(".lesson-board-feedback");
    if (!feedback) {
      feedback = document.createElement("p");
      feedback.className = "lesson-board-feedback result";
      wrapper.appendChild(feedback);
    }

    feedback.textContent = message;
    feedback.className = `lesson-board-feedback result ${type}`;
  }

  getBoardConfig(step) {
    const lessonConfigs = {
      "naming-squares": {
        initialFen: STARTING_FEN,
        objective: "Find d4 on the board.",
        highlightSquares: [],
        successMessage: "Exactly. d4 is where the d-file and rank 4 cross.",
        errorMessage: "Try again. Click the square where file d meets rank 4.",
      },
      "rook-from-d4": {
        initialFen: step.fen || "7k/8/8/8/3R4/8/8/7K w - - 0 1",
        objective: "Move the rook to a legal straight-line square.",
        allowedMoves: step.targetSquare
          ? [`${step.startSquare || "d4"}${step.targetSquare}`]
          : movesFrom("d4", rookSquares("d4")),
        lockToAllowedMoves: true,
        successMessage: "Correct! Rooks move in straight lines.",
        errorMessage: "Try again. Rooks can only move horizontally or vertically.",
      },
      "bishop-movement": {
        initialFen: "k7/8/8/8/3B4/8/8/7K w - - 0 1",
        objective: "Move the bishop along a diagonal.",
        highlightSquares: ["a1", "b2", "c3", "e5", "f6", "g7", "h8", "a7", "b6", "c5", "e3", "f2", "g1"],
        allowedMoves: movesFrom("d4", bishopSquares("d4")),
        lockToAllowedMoves: true,
        successMessage: "Correct! Bishops move diagonally.",
        errorMessage: "Try again. Bishops stay on diagonals.",
      },
      "knight-movement": {
        initialFen: "k7/8/8/8/3N4/8/8/7K w - - 0 1",
        objective: "Move the knight in an L shape.",
        highlightSquares: knightSquares("d4").map((square) => ({ square, className: "target" })),
        allowedMoves: movesFrom("d4", knightSquares("d4")),
        lockToAllowedMoves: true,
        successMessage: "Correct! Knights jump in an L shape.",
        errorMessage: "Try again. Knights move two squares and then one.",
      },
      "queen-movement": {
        initialFen: "k7/8/8/8/3Q4/8/8/7K w - - 0 1",
        objective: "Move the queen on a straight or diagonal line.",
        highlightSquares: [...rookSquares("d4"), ...bishopSquares("d4")].map((square) => ({ square, className: "focus" })),
        allowedMoves: movesFrom("d4", queenSquares("d4")),
        lockToAllowedMoves: true,
        successMessage: "Correct! Queens combine rook and bishop movement.",
        errorMessage: "Try again. Queens move on ranks, files, or diagonals.",
      },
      "first-opening-move": {
        initialFen: STARTING_FEN,
        objective: "Choose a principled legal first move.",
        highlightSquares: [
          { square: "d4", className: "target" },
          { square: "e4", className: "target" },
          { square: "d5", className: "target" },
          { square: "e5", className: "target" },
        ],
        allowedMoves: ["e2e4", "d2d4", "c2c4", "g1f3"],
        lockToAllowedMoves: true,
        successMessage: "Good first move. You are fighting for the center or developing a piece.",
        errorMessage: "Try e2e4, d2d4, c2c4, or g1f3.",
      },
      "checkmate-vs-stalemate": {
        initialFen: "k7/8/8/8/8/8/5K2/7Q w - - 0 1",
        objective: "See the difference between a king in check and a king with no legal moves.",
        highlightSquares: ["h8", "f2", "g2", "h2"].map((square) => ({ square, className: "focus" })),
      },
      "checks-captures-threats": {
        initialFen: "k7/8/8/3q4/8/8/4K3/8 w - - 0 1",
        objective: "Spot the opponent's forcing move.",
        highlightSquares: [{ square: "d5", className: "target" }, { square: "e2", className: "focus" }],
      },
      "find-the-fork-idea": {
        initialFen: "k7/8/8/8/3N4/8/4K3/3q4 w - - 0 1",
        objective: "Notice how one piece can attack two targets at once.",
        highlightSquares: [{ square: "d4", className: "target" }, { square: "d1", className: "target" }],
      },
    };

    if (lessonConfigs[this.lesson.id]) {
      return lessonConfigs[this.lesson.id];
    }

    if (step.fen) {
      const highlightSquares = normalizeHighlightSquares(
        step.highlightSquares || step.highlights || [],
      );

      return {
        initialFen: step.fen,
        objective: step.title || this.lesson.title,
        allowedMoves:
          step.allowedMoves ||
          (step.highlights && step.startSquare
            ? movesFrom(step.startSquare, step.highlights)
            : []),
        lockToAllowedMoves: Boolean(
          step.lockToAllowedMoves ||
            (step.highlights && step.startSquare) ||
            step.allowedMoves,
        ),
        highlightSquares,
        successMessage: step.successText || "Correct.",
        errorMessage: "Try another legal move from this position.",
      };
    }

    return null;
  }

  renderComplete() {
    this.container.innerHTML = `
      <div class="lesson-complete">
        <h2>Lesson Complete</h2>
        <p>Great work. Continue to the next lesson.</p>
      </div>
    `;
  }
}

function movesFrom(fromSquare, squares) {
  return squares.map((square) => `${fromSquare}${square}`);
}

function normalizeHighlightSquares(input) {
  return (input || []).flatMap((entry) => {
    if (!entry) return [];
    if (typeof entry === "string") {
      return [{ square: entry, className: "focus" }];
    }
    if (Array.isArray(entry)) {
      return normalizeHighlightSquares(entry);
    }
    if (entry.square) {
      return [{ square: entry.square, className: entry.className || "focus" }];
    }
    return [];
  });
}

function rookSquares(fromSquare) {
  const file = fromSquare[0];
  const rank = Number(fromSquare[1]);
  return [
    ...files.map((targetFile) => `${targetFile}${rank}`),
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((targetRank) => `${file}${targetRank}`),
  ].filter((square) => square !== fromSquare);
}

function bishopSquares(fromSquare) {
  return raySquares(fromSquare, [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]);
}

function queenSquares(fromSquare) {
  return [...rookSquares(fromSquare), ...bishopSquares(fromSquare)];
}

function knightSquares(fromSquare) {
  const fileIndex = files.indexOf(fromSquare[0]);
  const rank = Number(fromSquare[1]);
  return [
    [1, 2],
    [2, 1],
    [2, -1],
    [1, -2],
    [-1, -2],
    [-2, -1],
    [-2, 1],
    [-1, 2],
  ]
    .map(([fileDelta, rankDelta]) => toSquare(fileIndex + fileDelta, rank + rankDelta))
    .filter(Boolean);
}

function raySquares(fromSquare, directions) {
  const startFileIndex = files.indexOf(fromSquare[0]);
  const startRank = Number(fromSquare[1]);
  const squares = [];

  directions.forEach(([fileDelta, rankDelta]) => {
    let fileIndex = startFileIndex + fileDelta;
    let rank = startRank + rankDelta;

    while (fileIndex >= 0 && fileIndex < 8 && rank >= 1 && rank <= 8) {
      squares.push(`${files[fileIndex]}${rank}`);
      fileIndex += fileDelta;
      rank += rankDelta;
    }
  });

  return squares;
}

function toSquare(fileIndex, rank) {
  if (fileIndex < 0 || fileIndex > 7 || rank < 1 || rank > 8) return null;
  return `${files[fileIndex]}${rank}`;
}
