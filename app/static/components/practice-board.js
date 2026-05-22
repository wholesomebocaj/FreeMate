import { Chessground } from "/static/vendor/chessground/chessground.min.js";

export const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const EMPTY_FEN = "8/8/8/8/8/8/8/8 w - - 0 1";

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

function squareToGrid(square, orientation) {
  const fileIndex = files.indexOf(square[0]);
  const rank = Number(square[1]);

  if (fileIndex < 0 || Number.isNaN(rank)) {
    return { file: 0, rank: 0 };
  }

  if (orientation === "black") {
    return { file: 7 - fileIndex, rank: rank - 1 };
  }

  return { file: fileIndex, rank: 8 - rank };
}

const fenPieceMap = {
  P: "wP",
  N: "wN",
  B: "wB",
  R: "wR",
  Q: "wQ",
  K: "wK",
  p: "bP",
  n: "bN",
  b: "bB",
  r: "bR",
  q: "bQ",
  k: "bK",
};

export class BoardSound {
  constructor() {
    this.context = null;
    this.tones = {
      move: [420, 0.045, "sine"],
      capture: [260, 0.075, "triangle"],
      illegal: [130, 0.12, "sawtooth"],
      success: [640, 0.14, "sine"],
    };
  }

  play(type) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      this.context = this.context || new AudioContextClass();
      const [frequency, duration, wave] = this.tones[type] || this.tones.move;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();

      oscillator.frequency.value = frequency;
      oscillator.type = wave;
      gain.gain.setValueAtTime(0.0001, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, this.context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(this.context.destination);
      oscillator.start();
      oscillator.stop(this.context.currentTime + duration);
    } catch (error) {
      // Browsers can block audio until the first user gesture. Board play should still work.
    }
  }
}

export class PracticeBoard {
  constructor(element, config = {}) {
    this.element = element;
    this.mode = config.mode || "free";
    this.initialFen = normalizeFen(config.initialFen || config.fen || STARTING_FEN);
    this.fen = this.initialFen;
    this.orientation = config.orientation || "white";
    this.objective = config.objective || "";
    this.allowedMoves = config.allowedMoves || [];
    this.lockToAllowedMoves = Boolean(config.lockToAllowedMoves);
    this.highlightLegalMoves = config.highlightLegalMoves !== false;
    this.solutionMoves = config.solutionMoves || [];
    this.showCoordinates = config.showCoordinates !== false;
    this.enableSounds = config.enableSounds !== false;
    this.successMessage = config.successMessage || "";
    this.errorMessage = config.errorMessage || "";
    this.onMove = config.onMove || (() => {});
    this.onSquareSelect = config.onSquareSelect || (() => {});
    this.onIllegalMove = config.onIllegalMove || (() => {});
    this.onMoveSuccess = config.onMoveSuccess || (() => {});
    this.onMoveError = config.onMoveError || (() => {});
    this.onComplete = config.onComplete || (() => {});
    this.onPositionChange = config.onPositionChange || (() => {});
    this.highlightSquares = config.highlightSquares || [];
    this.sound = this.enableSounds ? config.sound || new BoardSound() : { play() {} };

    this.position = parseFen(this.fen);
    this.turn = parseTurn(this.fen);
    this.lastMove = [];
    this.history = [];
    this.pendingSelectionRequest = 0;

    this.element.classList.add("practice-board-component");
    this.ground = Chessground(this.element, this.createGroundConfig());
    this.installSquareLayer();
    this.installHighlightLayer();
    this.installSquareClickHandler();
    this.syncHighlightLayer();

    queueMicrotask(() => this.emitPositionChange());
  }

  installSquareLayer() {
    const container = this.element.querySelector("cg-container");
    if (!container || container.querySelector(".cg-square-layer")) return;

    const layer = document.createElement("div");
    layer.className = "cg-square-layer";
    for (let rank = 8; rank >= 1; rank -= 1) {
      files.forEach((file) => {
        const square = document.createElement("span");
        square.className = (rank + files.indexOf(file)) % 2 === 0 ? "light" : "dark";
        square.setAttribute("aria-hidden", "true");
        layer.appendChild(square);
      });
    }
    container.insertBefore(layer, container.firstChild);
  }

  installHighlightLayer() {
    const container = this.element.querySelector("cg-container");
    if (!container || container.querySelector(".cg-highlight-layer")) return;

    const layer = document.createElement("div");
    layer.className = "cg-highlight-layer";
    container.appendChild(layer);
  }

  createGroundConfig() {
    return {
      fen: this.fen,
      orientation: this.orientation,
      turnColor: this.turn,
      coordinates: this.showCoordinates,
      coordinatesOnSquares: false,
      ranksPosition: "left",
      highlight: {
        check: true,
        lastMove: true,
      },
      animation: {
        enabled: true,
        duration: 180,
      },
      selectable: {
        enabled: true,
      },
      draggable: {
        enabled: true,
        distance: 3,
        autoDistance: true,
        showGhost: true,
      },
      movable: {
        color: "both",
        dests: new Map(),
        free: true,
        rookCastle: true,
        showDests: true,
        events: {
          after: (fromSquare, toSquare, metadata) => {
            this.tryMove(fromSquare, toSquare, metadata);
          },
        },
      },
      premovable: {
        enabled: false,
      },
      drawable: {
        enabled: false,
      },
      events: {
        select: (square) => {
          this.handleSelect(square);
        },
      },
    };
  }

  installSquareClickHandler() {
    const board = this.element.querySelector("cg-board");
    if (!board || board.dataset.squareClickHandlerInstalled === "true") return;

    board.dataset.squareClickHandlerInstalled = "true";
    board.addEventListener("click", (event) => {
      const squareElement = event.target.closest?.("square");
      if (!squareElement) return;

      const squareName = Array.from(squareElement.classList).find((className) =>
        /^[a-h][1-8]$/.test(className),
      );
      if (!squareName) return;

      this.onSquareSelect({ square: squareName, fen: this.fen, history: this.history });
    });
  }

  setConfig(config = {}) {
    this.mode = config.mode || this.mode;
    this.objective = config.objective || this.objective;
    this.allowedMoves = config.allowedMoves || this.allowedMoves;
    this.solutionMoves = config.solutionMoves || this.solutionMoves;
    this.lockToAllowedMoves = config.lockToAllowedMoves ?? this.lockToAllowedMoves;
    this.highlightLegalMoves = config.highlightLegalMoves ?? this.highlightLegalMoves;
    this.successMessage = config.successMessage || this.successMessage;
    this.errorMessage = config.errorMessage || this.errorMessage;
    this.highlightSquares = config.highlightSquares || this.highlightSquares;
    this.syncHighlightLayer();
  }

  loadFen(fen, options = {}) {
    this.fen = normalizeFen(fen);
    this.position = parseFen(this.fen);
    this.turn = parseTurn(this.fen);
    this.lastMove = [];
    this.pendingSelectionRequest += 1;

    if (options.setInitial) {
      this.initialFen = this.fen;
    }

    if (options.clearHistory !== false) {
      this.history = [];
    }

    this.syncBoard({ clearSelection: true, clearLastMove: true });
    this.emitPositionChange();
  }

  reset() {
    this.loadFen(this.initialFen, { clearHistory: true });
  }

  clear() {
    this.loadFen(EMPTY_FEN, { clearHistory: true });
  }

  flip() {
    this.orientation = this.orientation === "white" ? "black" : "white";
    this.pendingSelectionRequest += 1;
    this.ground.set({
      orientation: this.orientation,
      movable: { dests: new Map() },
    });
    this.syncHighlightLayer();
    this.emitPositionChange();
  }

  async handleSelect(square) {
    const requestId = ++this.pendingSelectionRequest;

    if (!this.highlightLegalMoves || !this.position[square]) {
      this.ground.set({ movable: { dests: new Map() } });
      return;
    }

    const legalSquares = await this.fetchLegalSquares(square);
    if (requestId !== this.pendingSelectionRequest) return;

    this.ground.set({
      movable: {
        dests: legalSquares.length ? new Map([[square, legalSquares]]) : new Map(),
      },
    });
  }

  async fetchLegalSquares(square) {
    try {
      const response = await fetch("/api/legal-moves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: this.fen, from_square: square }),
      });
      const data = await response.json();
      return data.legal_squares || [];
    } catch (error) {
      return [];
    }
  }

  async tryMove(fromSquare, toSquare, metadata = {}) {
    if (!fromSquare || !toSquare || fromSquare === toSquare) {
      this.syncBoard({ clearSelection: true });
      return;
    }

    const move = this.buildMove(fromSquare, toSquare);

    if (!this.isConfiguredMoveAllowed(move)) {
      this.rejectMove(move, "That move is not part of this exercise.");
      return;
    }

    const captured = Boolean(this.position[toSquare]) || Boolean(metadata.captured);

    try {
      const response = await fetch("/api/validate-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ move, fen: this.fen }),
      });
      const data = await response.json();

      if (!data.is_valid) {
        this.rejectMove(move, data.message);
        return;
      }

      this.applyValidatedMove({
        fromSquare,
        toSquare,
        move,
        san: data.san,
        resultingFen: data.resulting_fen,
        captured: captured || (data.san || "").includes("x"),
      });
    } catch (error) {
      this.rejectMove(move, "The move validator is unavailable.");
    }
  }

  buildMove(fromSquare, toSquare) {
    const piece = this.position[fromSquare];
    const promotionRank = piece === "wP" ? "8" : piece === "bP" ? "1" : null;
    return promotionRank && toSquare.endsWith(promotionRank)
      ? `${fromSquare}${toSquare}q`
      : `${fromSquare}${toSquare}`;
  }

  isConfiguredMoveAllowed(move) {
    const baseMove = move.slice(0, 4);
    if (this.mode === "free") return true;
    if (this.lockToAllowedMoves && this.allowedMoves.length) {
      return this.allowedMoves.includes(move) || this.allowedMoves.includes(baseMove);
    }
    if (this.mode === "puzzle" && this.solutionMoves.length) {
      return this.solutionMoves[0] === move || this.solutionMoves[0] === baseMove;
    }
    return true;
  }

  applyValidatedMove({ fromSquare, toSquare, move, san, resultingFen, captured }) {
    this.fen = normalizeFen(resultingFen || this.fen);
    this.position = parseFen(this.fen);
    this.turn = parseTurn(this.fen);
    this.lastMove = [fromSquare, toSquare];
    this.history.push({ move, san, fen: this.fen, captured });
    this.pendingSelectionRequest += 1;

    const message = this.successMessage || "Correct. Nice move.";
    const payload = { move, san, fen: this.fen, history: this.history, captured, message };

    this.sound.play(captured ? "capture" : "move");
    this.syncBoard();
    this.onMove(payload);
    this.onMoveSuccess(payload);
    if (this.mode === "lesson" || this.mode === "puzzle") {
      this.onComplete(payload);
    }
    this.emitPositionChange();
  }

  rejectMove(move, message) {
    const feedback = this.errorMessage || message;
    this.pendingSelectionRequest += 1;
    this.sound.play("illegal");
    this.syncBoard({ clearSelection: true });
    this.onIllegalMove({ move, message: feedback });
    this.onMoveError({ move, message: feedback });
  }

  syncBoard(options = {}) {
    const lastMove = options.clearLastMove ? undefined : this.lastMove;

    this.ground.set({
      fen: this.fen,
      turnColor: this.turn,
      lastMove,
      movable: {
        color: "both",
        dests: new Map(),
        free: true,
      },
    });

    if (options.clearSelection) {
      this.ground.selectSquare(null);
    }

    this.syncHighlightLayer();
  }

  syncHighlightLayer() {
    const layer = this.element.querySelector(".cg-highlight-layer");
    if (!layer) return;

    layer.innerHTML = "";
    const highlights = Array.isArray(this.highlightSquares) ? this.highlightSquares : [];
    highlights.forEach((entry) => {
      const square = typeof entry === "string" ? entry : entry?.square;
      if (!square) return;

      const marker = document.createElement("span");
      marker.className = `cg-highlight-square ${typeof entry === "string" ? "focus" : entry.className || "focus"}`;
      marker.dataset.square = square;
      const coords = squareToGrid(square, this.orientation);
      marker.style.gridColumn = String(coords.file + 1);
      marker.style.gridRow = String(coords.rank + 1);
      layer.appendChild(marker);
    });
  }

  emitPositionChange() {
    this.onPositionChange({
      fen: this.fen,
      turn: this.turn,
      orientation: this.orientation,
      history: this.history,
      position: this.position,
    });
  }

  destroy() {
    this.ground?.destroy();
  }
}

export function parseFen(fen) {
  const placement = normalizeFen(fen).split(" ")[0];
  const position = {};
  const ranks = placement.split("/");

  if (ranks.length !== 8) {
    throw new Error("FEN must contain 8 ranks.");
  }

  ranks.forEach((rankText, rankIndex) => {
    let fileIndex = 0;
    const rank = 8 - rankIndex;
    [...rankText].forEach((char) => {
      if (/\d/.test(char)) {
        fileIndex += Number(char);
        return;
      }
      if (!fenPieceMap[char]) {
        throw new Error(`Unsupported FEN piece: ${char}`);
      }
      if (fileIndex > 7) {
        throw new Error("Each FEN rank must contain 8 files.");
      }
      position[`${files[fileIndex]}${rank}`] = fenPieceMap[char];
      fileIndex += 1;
    });
    if (fileIndex !== 8) {
      throw new Error("Each FEN rank must contain 8 files.");
    }
  });

  return position;
}

function parseTurn(fen) {
  return normalizeFen(fen).split(" ")[1] === "b" ? "black" : "white";
}

function normalizeFen(fen) {
  if (typeof fen !== "string" || !fen.trim()) {
    throw new Error("Enter a FEN string to load a position.");
  }

  const parts = fen.trim().split(/\s+/);
  if (parts.length === 1) return `${parts[0]} w - - 0 1`;
  return [
    parts[0],
    parts[1] || "w",
    parts[2] || "-",
    parts[3] || "-",
    parts[4] || "0",
    parts[5] || "1",
  ].join(" ");
}
