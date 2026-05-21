from pathlib import Path

import chess
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="FreeMate", version="1.0.0")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class MoveRequest(BaseModel):
    move: str = Field(..., examples=["e2e4"])
    fen: str | None = Field(default=None, examples=[chess.STARTING_FEN])


class MoveResponse(BaseModel):
    move: str
    is_valid: bool
    message: str
    san: str | None = None
    resulting_fen: str | None = None


@app.get("/")
def homepage() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/lessons")
def lessons_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "lessons.html")


@app.post("/api/validate-move", response_model=MoveResponse)
def validate_move(request: MoveRequest) -> MoveResponse:
    try:
        board = chess.Board(request.fen) if request.fen else chess.Board()
    except ValueError:
        return MoveResponse(
            move=request.move,
            is_valid=False,
            message="That board position is not a valid FEN string.",
        )

    try:
        move = chess.Move.from_uci(request.move.strip().lower())
    except ValueError:
        return MoveResponse(
            move=request.move,
            is_valid=False,
            message="Enter a move in UCI format, like e2e4 or g1f3.",
        )

    if move not in board.legal_moves:
        return MoveResponse(
            move=request.move,
            is_valid=False,
            message="That move is not legal in the current position.",
        )

    san = board.san(move)
    board.push(move)

    return MoveResponse(
        move=request.move,
        is_valid=True,
        message="Nice move. That is legal from this position.",
        san=san,
        resulting_fen=board.fen(),
    )

