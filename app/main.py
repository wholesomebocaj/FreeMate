import json
from pathlib import Path

import chess
from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
COURSE_PATH = STATIC_DIR / "data" / "course.json"

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


class RookMoveRequest(BaseModel):
    from_square: str = Field(default="d4", examples=["d4"])
    to_square: str = Field(..., examples=["d8"])


class RookMoveResponse(BaseModel):
    from_square: str
    to_square: str
    is_correct: bool
    message: str


class LegalMovesRequest(BaseModel):
    fen: str = Field(..., examples=[chess.STARTING_FEN])
    from_square: str = Field(..., examples=["d4"])


class LegalMovesResponse(BaseModel):
    from_square: str
    legal_squares: list[str]
    message: str


@app.get("/")
def homepage() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/lessons")
def lessons_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "lessons.html")


@app.get("/practice")
def practice_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "practice.html")


@app.get("/lesson/{lesson_id}")
def lesson_page(lesson_id: str) -> FileResponse:
    return FileResponse(STATIC_DIR / "lesson.html")


@app.get("/api/course")
def get_course() -> JSONResponse:
    with COURSE_PATH.open(encoding="utf-8") as course_file:
        return JSONResponse(json.load(course_file))


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


@app.post("/api/legal-moves", response_model=LegalMovesResponse)
def legal_moves(request: LegalMovesRequest) -> LegalMovesResponse:
    from_square = request.from_square.strip().lower()

    try:
        board = chess.Board(request.fen)
        start = chess.parse_square(from_square)
    except ValueError:
        return LegalMovesResponse(
            from_square=from_square,
            legal_squares=[],
            message="That board position or square is not valid.",
        )

    legal_squares = [
        chess.square_name(move.to_square)
        for move in board.legal_moves
        if move.from_square == start
    ]

    return LegalMovesResponse(
        from_square=from_square,
        legal_squares=legal_squares,
        message=f"Found {len(legal_squares)} legal moves.",
    )


@app.post("/api/rook-move", response_model=RookMoveResponse)
def validate_rook_move(request: RookMoveRequest) -> RookMoveResponse:
    from_square = request.from_square.strip().lower()
    to_square = request.to_square.strip().lower()

    try:
        start = chess.parse_square(from_square)
        target = chess.parse_square(to_square)
    except ValueError:
        return RookMoveResponse(
            from_square=from_square,
            to_square=to_square,
            is_correct=False,
            message="Choose a real square on the board.",
        )

    board = chess.Board.empty()
    board.turn = chess.WHITE
    board.castling_rights = chess.BB_EMPTY
    board.ep_square = None
    board.set_piece_at(chess.H1, chess.Piece(chess.KING, chess.WHITE))
    board.set_piece_at(chess.H8, chess.Piece(chess.KING, chess.BLACK))
    board.set_piece_at(start, chess.Piece(chess.ROOK, chess.WHITE))

    move = chess.Move(start, target)
    if move in board.legal_moves:
        return RookMoveResponse(
            from_square=from_square,
            to_square=to_square,
            is_correct=True,
            message="Correct. A rook moves in a straight line across ranks or files.",
        )

    return RookMoveResponse(
        from_square=from_square,
        to_square=to_square,
        is_correct=False,
        message="Incorrect. Rooks move horizontally or vertically, not diagonally.",
    )
