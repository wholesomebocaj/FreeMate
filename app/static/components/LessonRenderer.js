import { PracticeBoard } from "/static/components/practice-board.js";

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export class LessonRenderer {
  constructor(container, lesson) {
    this.container = container;
    this.lesson = lesson;
    this.currentStepIndex = 0;
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

    switch (step.type) {
      case "explain":
        this.renderExplainStep(wrapper, step);
        break;

      case "checklist":
        this.renderChecklistStep(wrapper, step);
        break;

      case "rook-practice":
        this.renderBoardStep(wrapper, step);
        break;

      case "rook-challenge":
        this.renderBoardStep(wrapper, step);
        break;

      default:
        wrapper.innerHTML += `
          <p>Unsupported lesson step type: ${step.type}</p>
        `;
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

    nextButton.onclick = () => {
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

  renderBoardStep(wrapper, step) {
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
      onMoveSuccess: ({ message }) => {
        this.showBoardFeedback(wrapper, message, "success");
      },
      onMoveError: ({ message }) => {
        this.showBoardFeedback(wrapper, message, "error");
      },
      onComplete: () => {
        wrapper.dataset.stepComplete = "true";
      },
    });
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
        allowedMoves: movesFrom("d4", bishopSquares("d4")),
        lockToAllowedMoves: true,
        successMessage: "Correct! Bishops move diagonally.",
        errorMessage: "Try again. Bishops stay on diagonals.",
      },
      "knight-movement": {
        initialFen: "k7/8/8/8/3N4/8/8/7K w - - 0 1",
        objective: "Move the knight in an L shape.",
        allowedMoves: movesFrom("d4", knightSquares("d4")),
        lockToAllowedMoves: true,
        successMessage: "Correct! Knights jump in an L shape.",
        errorMessage: "Try again. Knights move two squares and then one.",
      },
      "queen-movement": {
        initialFen: "k7/8/8/8/3Q4/8/8/7K w - - 0 1",
        objective: "Move the queen on a straight or diagonal line.",
        allowedMoves: movesFrom("d4", queenSquares("d4")),
        lockToAllowedMoves: true,
        successMessage: "Correct! Queens combine rook and bishop movement.",
        errorMessage: "Try again. Queens move on ranks, files, or diagonals.",
      },
      "first-opening-move": {
        initialFen: STARTING_FEN,
        objective: "Choose a principled legal first move.",
        allowedMoves: ["e2e4", "d2d4", "c2c4", "g1f3"],
        lockToAllowedMoves: true,
        successMessage: "Good first move. You are fighting for the center or developing a piece.",
        errorMessage: "Try e2e4, d2d4, c2c4, or g1f3.",
      },
    };

    if (lessonConfigs[this.lesson.id]) {
      return lessonConfigs[this.lesson.id];
    }

    if (step.fen) {
      return {
        initialFen: step.fen,
        objective: step.title || this.lesson.title,
        allowedMoves: step.highlights && step.startSquare
          ? movesFrom(step.startSquare, step.highlights)
          : [],
        lockToAllowedMoves: Boolean(step.highlights && step.startSquare),
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
