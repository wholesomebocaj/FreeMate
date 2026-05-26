import { EMPTY_FEN, PracticeBoard, STARTING_FEN } from "/static/components/practice-board.js";

const boardElement = document.querySelector("#practice-board");
const status = document.querySelector("#practice-status");
const practiceTurn = document.querySelector("#practice-turn");
const lastMove = document.querySelector("#last-move");
const historyList = document.querySelector("#move-history");
const fenInput = document.querySelector("#fen-input");
const fenFeedback = document.querySelector("#fen-feedback");

const board = new PracticeBoard(boardElement, {
  mode: "free",
  initialFen: STARTING_FEN,
  onMove: ({ san }) => {
    fenFeedback.textContent = san ? `Played ${san}` : "Move played.";
    fenFeedback.className = "result success";
    lastMove.textContent = san || board.history.at(-1)?.move || "None";
    renderHistory();
  },
  onIllegalMove: ({ message }) => {
    fenFeedback.textContent = message;
    fenFeedback.className = "result error";
  },
  onPositionChange: ({ fen, turn, isCheck, isCheckmate }) => {
    fenInput.value = fen;
    if (isCheckmate) {
      status.textContent = "Checkmate — game over";
      status.className = "is-checkmate";
      practiceTurn.textContent = "Game over";
    } else if (isCheck) {
      status.textContent = `${turn === "white" ? "White" : "Black"} is in check`;
      status.className = "is-check";
      practiceTurn.textContent = turn === "white" ? "White" : "Black";
    } else {
      status.textContent = `${turn === "white" ? "White" : "Black"} to move`;
      status.className = "";
      practiceTurn.textContent = turn === "white" ? "White" : "Black";
    }
    if (!board.history.length) {
      lastMove.textContent = "None";
    }
    renderHistory();
  },
});

document.querySelector("#reset-board").addEventListener("click", () => {
  board.loadFen(STARTING_FEN, { setInitial: true, clearHistory: true });
  fenFeedback.textContent = "Board reset to the starting position.";
  fenFeedback.className = "result success";
});

document.querySelector("#flip-board").addEventListener("click", () => {
  board.flip();
  fenFeedback.textContent = `Board flipped to ${board.orientation}'s perspective.`;
  fenFeedback.className = "result success";
});

document.querySelector("#clear-board").addEventListener("click", () => {
  board.loadFen(EMPTY_FEN, { setInitial: true, clearHistory: true });
  fenFeedback.textContent = "Board cleared.";
  fenFeedback.className = "result success";
});

document.querySelector("#fen-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    board.loadFen(fenInput.value, { setInitial: true, clearHistory: true });
    fenFeedback.textContent = "Position loaded.";
    fenFeedback.className = "result success";
  } catch (error) {
    fenFeedback.textContent = error.message;
    fenFeedback.className = "result error";
  }
});

function renderHistory() {
  historyList.innerHTML = "";

  if (!board.history.length) {
    const empty = document.createElement("li");
    empty.textContent = "No moves yet.";
    historyList.appendChild(empty);
    return;
  }

  board.history.forEach((entry, index) => {
    const item = document.createElement("li");
    item.textContent = `${index + 1}. ${entry.san || entry.move}`;
    historyList.appendChild(item);
  });
}

renderHistory();
