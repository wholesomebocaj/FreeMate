import json
from pathlib import Path

import chess
import chess.pgn
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.services.content_validator import (
    ContentValidationError,
    raise_for_issues,
    validate_curriculum_data,
    validate_opening_data,
    validate_opening_index,
)
from app.services.opening_explorer import get_explorer_data


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
COURSE_PATH = STATIC_DIR / "data" / "courses.json"
BRACKETS_PATH = STATIC_DIR / "data" / "brackets.json"
OPENINGS_DIR = STATIC_DIR / "data" / "openings"
OPENINGS_INDEX_PATH = OPENINGS_DIR / "index.json"
BRACKET_SLUGS = {
    "beginner",
    "beginner-plus",
    "novice",
    "intermediate",
    "advanced-beginner",
}

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


class OpeningMoveRequest(BaseModel):
    opening_id: str = Field(..., examples=["italian-game"])
    move: str = Field(..., examples=["e2e4"])
    line_id: str | None = Field(default=None, examples=["main-line"])
    move_index: int = Field(default=0, ge=0)
    played_moves: list[str] = Field(default_factory=list)


@app.get("/")
def homepage() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/lessons")
def lessons_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "lessons.html")


@app.get("/openings")
def openings_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "openings.html")


@app.get("/openings/{opening_id}/train")
def opening_trainer_page(opening_id: str) -> FileResponse:
    return FileResponse(STATIC_DIR / "opening-trainer.html")


@app.get("/openings/{opening_id}")
def opening_overview_page(opening_id: str) -> FileResponse:
    return FileResponse(STATIC_DIR / "opening.html")


@app.get("/api/brackets")
def get_brackets() -> JSONResponse:
    _, brackets = load_curriculum_data()
    return JSONResponse(brackets)


@app.get("/courses/{course_id}")
def course_detail_page(course_id: str) -> FileResponse:
    return FileResponse(STATIC_DIR / "course.html")


@app.get("/course/{course_id}")
def legacy_course_detail_page(course_id: str) -> FileResponse:
    return FileResponse(STATIC_DIR / "course.html")


@app.get("/lessons/{lesson_id}")
def lesson_training_page(lesson_id: str) -> FileResponse:
    if lesson_id in BRACKET_SLUGS:
        return FileResponse(STATIC_DIR / "bracket.html")
    return FileResponse(STATIC_DIR / "lesson.html")


@app.get("/practice")
def practice_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "practice.html")


@app.get("/review")
def review_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "review.html")


@app.get("/lesson/{lesson_id}")
def legacy_lesson_page(lesson_id: str) -> FileResponse:
    return FileResponse(STATIC_DIR / "lesson.html")


@app.get("/api/course")
def get_course() -> JSONResponse:
    courses, _ = load_curriculum_data()
    return JSONResponse(courses)


@app.get("/api/openings")
def get_openings() -> JSONResponse:
    openings = [_opening_summary(prepare_opening(load_opening_by_id(entry["id"]))) for entry in load_opening_index()]
    return JSONResponse(openings)


@app.get("/api/openings/explorer")
def opening_explorer(
    database: str = Query(default="lichess", pattern="^(lichess|masters)$"),
    play: str | None = None,
    fen: str | None = None,
    speeds: str | None = None,
    ratings: str | None = None,
    moves: int = Query(default=12, ge=0, le=50),
    topGames: int = Query(default=0, ge=0, le=8),
    recentGames: int = Query(default=0, ge=0, le=8),
) -> JSONResponse:
    data = get_explorer_data(
        database=database,
        play=play,
        fen=fen,
        speeds=speeds,
        ratings=ratings,
        moves=moves,
        topGames=topGames,
        recentGames=recentGames,
    )
    return JSONResponse(data)


@app.get("/api/openings/{opening_id}")
def get_opening(opening_id: str) -> JSONResponse:
    opening = prepare_opening(load_opening_by_id(opening_id))
    opening["pgn"] = opening_to_pgn(opening)
    return JSONResponse(opening)


@app.post("/api/openings/validate-move")
def validate_opening_move(request: OpeningMoveRequest) -> JSONResponse:
    opening = prepare_opening(load_opening_by_id(request.opening_id))
    line = opening_line_by_id(opening, request.line_id) if request.line_id else opening.get("moves", [])

    if request.move_index >= len(line):
        return JSONResponse(
            {
                "is_valid": False,
                "message": "This opening line is already complete.",
                "complete": True,
            }
        )

    starting_fen = opening.get("training", {}).get("startingFen", "startpos")
    try:
        board = chess.Board() if starting_fen == "startpos" else chess.Board(starting_fen)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Opening has an invalid starting FEN: {exc}")

    previous_moves = request.played_moves or [move["uci"] for move in line[: request.move_index]]
    for previous_move in previous_moves:
        move = _parse_uci_move(previous_move)
        if move not in board.legal_moves:
            return JSONResponse(
                {
                    "is_valid": False,
                    "message": "The training position is out of sync. Reset the line and try again.",
                    "expected": line[request.move_index],
                    "fen": board.fen(),
                }
            )
        board.push(move)

    attempted_move = _parse_uci_move(request.move)
    expected_move = line[request.move_index]["uci"].lower()
    base_attempt = request.move.strip().lower()[:4]

    if attempted_move not in board.legal_moves:
        return JSONResponse(
            {
                "is_valid": False,
                "message": "That move is legal in some positions, but not here. Try the highlighted opening move.",
                "expected": line[request.move_index],
                "fen": board.fen(),
            }
        )

    if request.move.strip().lower() not in {expected_move, expected_move[:4]} and base_attempt != expected_move[:4]:
        return JSONResponse(
            {
                "is_valid": False,
                "message": f"Good legal move, but this trainer is practicing {line[request.move_index]['san']}.",
                "expected": line[request.move_index],
                "fen": board.fen(),
            }
        )

    san = board.san(attempted_move)
    board.push(attempted_move)
    complete = request.move_index >= len(line) - 1

    return JSONResponse(
        {
            "is_valid": True,
            "message": line[request.move_index].get("explanation", "Correct move."),
            "move": request.move,
            "san": san,
            "resulting_fen": board.fen(),
            "expected": line[request.move_index],
            "complete": complete,
        }
    )


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


def load_opening_index() -> list[dict]:
    with OPENINGS_INDEX_PATH.open(encoding="utf-8") as index_file:
        index = json.load(index_file)
    try:
        raise_for_issues(validate_opening_index(index, OPENINGS_DIR))
    except ContentValidationError as exc:
        raise _content_validation_http_error(exc) from exc
    return index


def load_opening_by_id(opening_id: str) -> dict:
    for entry in load_opening_index():
        if entry["id"] != opening_id:
            continue
        opening_path = (OPENINGS_DIR / entry["path"]).resolve()
        if not opening_path.is_relative_to(OPENINGS_DIR.resolve()):
            raise HTTPException(status_code=400, detail="Invalid opening path.")
        with opening_path.open(encoding="utf-8") as opening_file:
            opening = json.load(opening_file)
        try:
            raise_for_issues(validate_opening_data(opening, source=f"openings/{entry['path']}"))
        except ContentValidationError as exc:
            raise _content_validation_http_error(exc) from exc
        return opening
    raise HTTPException(status_code=404, detail="Opening not found.")


def load_curriculum_data() -> tuple[list[dict], list[dict]]:
    with COURSE_PATH.open(encoding="utf-8") as course_file:
        courses = json.load(course_file)
    with BRACKETS_PATH.open(encoding="utf-8") as brackets_file:
        brackets = json.load(brackets_file)
    try:
        raise_for_issues(validate_curriculum_data(courses, brackets))
    except ContentValidationError as exc:
        raise _content_validation_http_error(exc) from exc
    return courses, brackets


def _content_validation_http_error(exc: ContentValidationError) -> HTTPException:
    issues = [str(issue) for issue in exc.issues[:25]]
    if len(exc.issues) > 25:
        issues.append(f"...and {len(exc.issues) - 25} more issues.")
    return HTTPException(
        status_code=500,
        detail={
            "message": "FreeMate content validation failed.",
            "issues": issues,
        },
    )


def prepare_opening(opening: dict) -> dict:
    prepared = dict(opening)
    prepared["moves"] = main_opening_line(opening)
    prepared["sectionCount"] = len(opening.get("sections", []))
    return prepared


def main_opening_line(opening: dict) -> list[dict]:
    sections = opening.get("sections") or []
    for section in sections:
        for lesson in section_branches(section):
            if lesson.get("isMainLine") or lesson.get("id") == "main-line":
                return annotate_line(lesson.get("moves", []), section, lesson)
    for section in sections:
        for lesson in section_branches(section):
            if lesson.get("moves"):
                return annotate_line(lesson.get("moves", []), section, lesson)
    return opening.get("moves", [])


def opening_line_by_id(opening: dict, line_id: str | None) -> list[dict]:
    sections = opening.get("sections") or []
    for section in sections:
        for lesson in section_branches(section):
            if lesson.get("id") == line_id:
                return annotate_line(lesson.get("moves", []), section, lesson)
    return opening.get("moves", [])


def section_branches(section: dict) -> list[dict]:
    return section.get("branches") or section.get("lessons") or []


def annotate_line(moves: list[dict], section: dict, lesson: dict) -> list[dict]:
    return [
        {
            **move,
            "lineIndex": index,
            "sectionId": section.get("id"),
            "sectionTitle": section.get("title"),
            "lessonId": lesson.get("id"),
            "lessonTitle": lesson.get("title"),
            "lineTitle": lesson.get("title"),
            "lineDescription": lesson.get("description"),
        }
        for index, move in enumerate(moves)
    ]


def _opening_summary(opening: dict) -> dict:
    return {
        "id": opening.get("id"),
        "name": opening.get("name"),
        "eco": opening.get("eco"),
        "difficulty": opening.get("difficulty"),
        "bracket": opening.get("bracket"),
        "side": opening.get("side"),
        "description": opening.get("description"),
        "moveCount": len(opening.get("moves", [])),
        "sectionCount": opening.get("sectionCount", 0),
        "ideas": opening.get("ideas", []),
        "training": opening.get("training", {}),
        "spacedRepetition": opening.get("spacedRepetition", {}),
    }


def opening_to_pgn(opening: dict) -> str:
    game = chess.pgn.Game()
    game.headers["Event"] = "FreeMate Opening Trainer"
    game.headers["Opening"] = opening.get("name", "Opening")
    game.headers["ECO"] = opening.get("eco", "")

    starting_fen = opening.get("training", {}).get("startingFen", "startpos")
    board = chess.Board() if starting_fen == "startpos" else chess.Board(starting_fen)
    node = game
    for move_data in opening.get("moves", []):
        move = chess.Move.from_uci(move_data["uci"])
        if move not in board.legal_moves:
            break
        node = node.add_variation(move)
        board.push(move)

    return str(game)


def _parse_uci_move(move_text: str) -> chess.Move:
    try:
        return chess.Move.from_uci(move_text.strip().lower())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Move must be UCI, like e2e4: {exc}")
