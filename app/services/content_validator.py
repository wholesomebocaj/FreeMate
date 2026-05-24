from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import chess


ALLOWED_LESSON_STEP_TYPES = {
    "attack-visualization",
    "board-demo",
    "board-task",
    "capture-task",
    "checklist",
    "click-all-squares",
    "explain",
    "guided-puzzle",
    "highlight-demo",
    "move-task",
    "move-validation",
    "multiple-choice",
    "rook-challenge",
    "rook-movement",
    "rook-practice",
    "square-click",
    "tactic-task",
}

ALLOWED_BRACKET_ITEM_KINDS = {"course", "preview"}
ALLOWED_OPENING_DATABASES = {"lichess", "masters"}
RATING_RANGE_PATTERN = re.compile(r"^\d+\s*[-–]\s*\d+$")


@dataclass(frozen=True)
class ValidationIssue:
    path: str
    message: str

    def __str__(self) -> str:
        return f"{self.path}: {self.message}"


class ContentValidationError(Exception):
    def __init__(self, issues: list[ValidationIssue]):
        self.issues = issues
        super().__init__("\n".join(str(issue) for issue in issues))


def raise_for_issues(issues: list[ValidationIssue]) -> None:
    if issues:
        raise ContentValidationError(issues)


def validate_curriculum_data(courses: Any, brackets: Any) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    course_ids = _validate_courses(courses, issues)
    lesson_ids = _lesson_ids(courses) if isinstance(courses, list) else set()
    _validate_brackets(brackets, course_ids, lesson_ids, issues)
    return issues


def validate_opening_index(index: Any, openings_dir: Path | None = None) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    if not isinstance(index, list):
        return [ValidationIssue("openings/index.json", "Expected a list of opening entries.")]

    seen_ids: set[str] = set()
    resolved_root = openings_dir.resolve() if openings_dir else None
    for index_number, entry in enumerate(index):
        path = f"openings/index.json[{index_number}]"
        if not isinstance(entry, dict):
            issues.append(ValidationIssue(path, "Expected an object."))
            continue

        opening_id = _required_string(entry, "id", path, issues)
        relative_path = _required_string(entry, "path", path, issues)
        if opening_id:
            _check_unique(opening_id, seen_ids, f"{path}.id", "opening id", issues)
        if relative_path and openings_dir:
            opening_path = (openings_dir / relative_path).resolve()
            if resolved_root and not opening_path.is_relative_to(resolved_root):
                issues.append(ValidationIssue(f"{path}.path", "Path escapes the openings data directory."))
            elif not opening_path.exists():
                issues.append(ValidationIssue(f"{path}.path", f"Referenced file does not exist: {relative_path}"))

    return issues


def validate_opening_data(opening: Any, *, source: str = "opening") -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    if not isinstance(opening, dict):
        return [ValidationIssue(source, "Expected an opening object.")]

    _required_string(opening, "id", source, issues)
    _required_string(opening, "name", source, issues)
    _required_string(opening, "eco", source, issues)
    _required_string(opening, "difficulty", source, issues)
    _required_string(opening, "bracket", source, issues)
    side = _required_string(opening, "side", source, issues)
    if side and side not in {"White", "Black"}:
        issues.append(ValidationIssue(f"{source}.side", "Expected White or Black."))
    _required_string(opening, "description", source, issues)

    ideas = opening.get("ideas", [])
    if not isinstance(ideas, list) or not all(isinstance(idea, str) and idea.strip() for idea in ideas):
        issues.append(ValidationIssue(f"{source}.ideas", "Expected a list of non-empty strings."))

    mistakes = opening.get("commonMistakes", [])
    if not isinstance(mistakes, list) or not all(isinstance(mistake, str) and mistake.strip() for mistake in mistakes):
        issues.append(ValidationIssue(f"{source}.commonMistakes", "Expected a list of non-empty strings."))

    training = opening.get("training")
    if not isinstance(training, dict):
        issues.append(ValidationIssue(f"{source}.training", "Expected an object."))
        starting_fen = "startpos"
    else:
        starting_fen = training.get("startingFen", "startpos")
        _validate_fen_or_startpos(starting_fen, f"{source}.training.startingFen", issues)
        side_to_train = training.get("sideToTrain")
        if side_to_train is not None and side_to_train not in {"white", "black"}:
            issues.append(ValidationIssue(f"{source}.training.sideToTrain", "Expected white or black."))

    sections = opening.get("sections")
    if not isinstance(sections, list) or not sections:
        issues.append(ValidationIssue(f"{source}.sections", "Expected at least one section."))
        return issues

    seen_section_ids: set[str] = set()
    seen_branch_ids: set[str] = set()
    has_main_line = False
    for section_index, section in enumerate(sections):
        section_path = f"{source}.sections[{section_index}]"
        if not isinstance(section, dict):
            issues.append(ValidationIssue(section_path, "Expected an object."))
            continue
        section_id = _required_string(section, "id", section_path, issues)
        if section_id:
            _check_unique(section_id, seen_section_ids, f"{section_path}.id", "section id", issues)
        _required_string(section, "title", section_path, issues)

        branches = section.get("branches") or section.get("lessons")
        if not isinstance(branches, list) or not branches:
            issues.append(ValidationIssue(f"{section_path}.branches", "Expected at least one playable branch."))
            continue
        for branch_index, branch in enumerate(branches):
            branch_path = f"{section_path}.branches[{branch_index}]"
            if not isinstance(branch, dict):
                issues.append(ValidationIssue(branch_path, "Expected an object."))
                continue
            branch_id = _required_string(branch, "id", branch_path, issues)
            if branch_id:
                _check_unique(branch_id, seen_branch_ids, f"{branch_path}.id", "branch id", issues)
            _required_string(branch, "title", branch_path, issues)
            _required_string(branch, "description", branch_path, issues)
            moves = branch.get("moves")
            if not isinstance(moves, list) or not moves:
                issues.append(ValidationIssue(f"{branch_path}.moves", "Expected at least one move."))
            else:
                _validate_opening_line(moves, starting_fen, f"{branch_path}.moves", issues)
            _validate_string_list(branch.get("hints", []), f"{branch_path}.hints", issues)
            _validate_string_list(branch.get("coachingNotes", []), f"{branch_path}.coachingNotes", issues)
            has_main_line = has_main_line or branch.get("isMainLine") is True or branch_id == "main-line"

    if not has_main_line:
        issues.append(ValidationIssue(f"{source}.sections", "Expected one branch marked as the main line."))

    _validate_opening_tree(opening.get("tree"), f"{source}.tree", issues)
    return issues


def _validate_courses(courses: Any, issues: list[ValidationIssue]) -> set[str]:
    course_ids: set[str] = set()
    seen_lesson_ids: set[str] = set()
    if not isinstance(courses, list):
        issues.append(ValidationIssue("courses.json", "Expected a list of courses."))
        return course_ids

    for course_index, course in enumerate(courses):
        course_path = f"courses[{course_index}]"
        if not isinstance(course, dict):
            issues.append(ValidationIssue(course_path, "Expected an object."))
            continue

        course_id = _required_string(course, "id", course_path, issues)
        if course_id:
            _check_unique(course_id, course_ids, f"{course_path}.id", "course id", issues)
        _required_string(course, "title", course_path, issues)
        _required_string(course, "description", course_path, issues)
        categories = course.get("categories")
        if not isinstance(categories, list) or not categories:
            issues.append(ValidationIssue(f"{course_path}.categories", "Expected at least one category."))
            continue

        seen_category_ids: set[str] = set()
        for category_index, category in enumerate(categories):
            category_path = f"{course_path}.categories[{category_index}]"
            if not isinstance(category, dict):
                issues.append(ValidationIssue(category_path, "Expected an object."))
                continue
            category_id = _required_string(category, "id", category_path, issues)
            if category_id:
                _check_unique(category_id, seen_category_ids, f"{category_path}.id", "category id", issues)
            _required_string(category, "title", category_path, issues)
            skills = category.get("skills")
            if not isinstance(skills, list) or not skills:
                issues.append(ValidationIssue(f"{category_path}.skills", "Expected at least one skill."))
                continue

            seen_skill_ids: set[str] = set()
            for skill_index, skill in enumerate(skills):
                skill_path = f"{category_path}.skills[{skill_index}]"
                if not isinstance(skill, dict):
                    issues.append(ValidationIssue(skill_path, "Expected an object."))
                    continue
                skill_id = _required_string(skill, "id", skill_path, issues)
                if skill_id:
                    _check_unique(skill_id, seen_skill_ids, f"{skill_path}.id", "skill id", issues)
                _required_string(skill, "title", skill_path, issues)
                lessons = skill.get("lessons")
                if not isinstance(lessons, list) or not lessons:
                    issues.append(ValidationIssue(f"{skill_path}.lessons", "Expected at least one lesson."))
                    continue

                for lesson_index, lesson in enumerate(lessons):
                    lesson_path = f"{skill_path}.lessons[{lesson_index}]"
                    _validate_lesson(lesson, lesson_path, seen_lesson_ids, issues)

    return course_ids


def _validate_lesson(lesson: Any, path: str, seen_lesson_ids: set[str], issues: list[ValidationIssue]) -> None:
    if not isinstance(lesson, dict):
        issues.append(ValidationIssue(path, "Expected an object."))
        return

    lesson_id = _required_string(lesson, "id", path, issues)
    if lesson_id:
        _check_unique(lesson_id, seen_lesson_ids, f"{path}.id", "lesson id", issues)
    _required_string(lesson, "title", path, issues)
    _required_string(lesson, "summary", path, issues)
    _required_string(lesson, "difficulty", path, issues)
    if not isinstance(lesson.get("timeMinutes"), int) or lesson.get("timeMinutes", 0) <= 0:
        issues.append(ValidationIssue(f"{path}.timeMinutes", "Expected a positive integer."))
    rating_range = lesson.get("ratingRange")
    if not _is_rating_range(rating_range):
        issues.append(ValidationIssue(f"{path}.ratingRange", "Expected a rating range like '0-400' or two integer bounds."))

    steps = lesson.get("steps")
    if not isinstance(steps, list) or not steps:
        issues.append(ValidationIssue(f"{path}.steps", "Expected at least one lesson step."))
        return

    for step_index, step in enumerate(steps):
        _validate_lesson_step(step, f"{path}.steps[{step_index}]", issues)


def _validate_lesson_step(step: Any, path: str, issues: list[ValidationIssue]) -> None:
    if not isinstance(step, dict):
        issues.append(ValidationIssue(path, "Expected an object."))
        return

    step_type = _required_string(step, "type", path, issues)
    if step_type and step_type not in ALLOWED_LESSON_STEP_TYPES:
        issues.append(ValidationIssue(f"{path}.type", f"Unsupported lesson step type '{step_type}'."))
    if step_type != "rook-movement":
        _required_string(step, "title", path, issues)

    if "fen" in step:
        _validate_fen(step.get("fen"), f"{path}.fen", issues)
    _validate_square_list(step.get("highlightSquares", []), f"{path}.highlightSquares", issues)
    _validate_square_list(step.get("highlights", []), f"{path}.highlights", issues)
    _validate_square_list(step.get("targetSquares", []), f"{path}.targetSquares", issues)

    for square_field in ("targetSquare", "startSquare"):
        if square_field in step:
            _validate_square(step.get(square_field), f"{path}.{square_field}", issues)

    allowed_moves = step.get("allowedMoves", [])
    if allowed_moves:
        if not isinstance(allowed_moves, list):
            issues.append(ValidationIssue(f"{path}.allowedMoves", "Expected a list of UCI moves."))
        else:
            for move_index, move_text in enumerate(allowed_moves):
                _validate_uci(move_text, f"{path}.allowedMoves[{move_index}]", issues)

    if step_type == "multiple-choice":
        choices = step.get("choices")
        if not isinstance(choices, list) or not choices:
            issues.append(ValidationIssue(f"{path}.choices", "Expected at least one choice."))
        else:
            values = {_choice_value(choice) for choice in choices}
            values.discard(None)
            correct = step.get("correctChoice", step.get("correctAnswer", step.get("answer")))
            if correct is None:
                issues.append(ValidationIssue(f"{path}.correctChoice", "Expected a correct choice value."))
            elif correct not in values:
                issues.append(ValidationIssue(f"{path}.correctChoice", f"'{correct}' does not match any choice value."))

    if step_type == "click-all-squares" and not step.get("targetSquares"):
        issues.append(ValidationIssue(f"{path}.targetSquares", "click-all-squares requires targetSquares."))
    if step_type == "square-click" and not step.get("targetSquare"):
        issues.append(ValidationIssue(f"{path}.targetSquare", "square-click requires targetSquare."))


def _validate_brackets(
    brackets: Any,
    course_ids: set[str],
    lesson_ids: set[str],
    issues: list[ValidationIssue],
) -> None:
    if not isinstance(brackets, list):
        issues.append(ValidationIssue("brackets.json", "Expected a list of skill brackets."))
        return

    seen_ids: set[str] = set()
    seen_slugs: set[str] = set()
    for bracket_index, bracket in enumerate(brackets):
        path = f"brackets[{bracket_index}]"
        if not isinstance(bracket, dict):
            issues.append(ValidationIssue(path, "Expected an object."))
            continue
        bracket_id = _required_string(bracket, "id", path, issues)
        if bracket_id:
            _check_unique(bracket_id, seen_ids, f"{path}.id", "bracket id", issues)
        slug = _required_string(bracket, "slug", path, issues)
        if slug:
            _check_unique(slug, seen_slugs, f"{path}.slug", "bracket slug", issues)
        _required_string(bracket, "title", path, issues)
        _required_string(bracket, "range", path, issues)
        _required_string(bracket, "description", path, issues)
        _validate_string_list(bracket.get("learn", []), f"{path}.learn", issues)

        items = bracket.get("items")
        if not isinstance(items, list) or not items:
            issues.append(ValidationIssue(f"{path}.items", "Expected at least one course or preview item."))
            continue
        seen_item_ids: set[str] = set()
        for item_index, item in enumerate(items):
            item_path = f"{path}.items[{item_index}]"
            if not isinstance(item, dict):
                issues.append(ValidationIssue(item_path, "Expected an object."))
                continue
            item_id = _required_string(item, "id", item_path, issues)
            if item_id:
                _check_unique(item_id, seen_item_ids, f"{item_path}.id", "bracket item id", issues)
            kind = item.get("kind", "course")
            if kind not in ALLOWED_BRACKET_ITEM_KINDS:
                issues.append(ValidationIssue(f"{item_path}.kind", f"Expected one of {sorted(ALLOWED_BRACKET_ITEM_KINDS)}."))
            _required_string(item, "title", item_path, issues)
            _required_string(item, "description", item_path, issues)
            if kind == "course":
                course_id = _required_string(item, "courseId", item_path, issues)
                if course_id and course_id not in course_ids:
                    issues.append(ValidationIssue(f"{item_path}.courseId", f"Unknown course id '{course_id}'."))
            for lesson_id in item.get("lessonIds", []):
                if lesson_id not in lesson_ids:
                    issues.append(ValidationIssue(f"{item_path}.lessonIds", f"Unknown lesson id '{lesson_id}'."))


def _validate_opening_line(moves: list[Any], starting_fen: Any, path: str, issues: list[ValidationIssue]) -> None:
    try:
        board = chess.Board() if starting_fen == "startpos" else chess.Board(starting_fen)
    except (TypeError, ValueError):
        return

    for move_index, move_data in enumerate(moves):
        move_path = f"{path}[{move_index}]"
        if not isinstance(move_data, dict):
            issues.append(ValidationIssue(move_path, "Expected a move object."))
            return
        uci = _required_string(move_data, "uci", move_path, issues)
        san = _required_string(move_data, "san", move_path, issues)
        _required_string(move_data, "title", move_path, issues)
        _required_string(move_data, "explanation", move_path, issues)
        if not uci:
            continue
        try:
            move = chess.Move.from_uci(uci.lower())
        except ValueError:
            issues.append(ValidationIssue(f"{move_path}.uci", f"Invalid UCI move '{uci}'."))
            continue
        if move not in board.legal_moves:
            issues.append(ValidationIssue(f"{move_path}.uci", f"Move '{uci}' is not legal from the current opening position."))
            continue
        expected_san = board.san(move)
        if san and san != expected_san:
            issues.append(ValidationIssue(f"{move_path}.san", f"Expected SAN '{expected_san}' for UCI '{uci}', got '{san}'."))
        board.push(move)


def _validate_opening_tree(tree: Any, path: str, issues: list[ValidationIssue]) -> None:
    if tree is None:
        return
    if not isinstance(tree, dict):
        issues.append(ValidationIssue(path, "Expected an object when present."))
        return
    move_text = tree.get("move") or tree.get("uci")
    if move_text is not None:
        _validate_uci(move_text, f"{path}.move", issues)
    responses = tree.get("responses", [])
    if responses and not isinstance(responses, list):
        issues.append(ValidationIssue(f"{path}.responses", "Expected a list."))
        return
    for index, child in enumerate(responses):
        _validate_opening_tree(child, f"{path}.responses[{index}]", issues)


def _lesson_ids(courses: list[Any]) -> set[str]:
    ids: set[str] = set()
    for course in courses:
        for category in course.get("categories", []) if isinstance(course, dict) else []:
            for skill in category.get("skills", []) if isinstance(category, dict) else []:
                for lesson in skill.get("lessons", []) if isinstance(skill, dict) else []:
                    if isinstance(lesson, dict) and isinstance(lesson.get("id"), str):
                        ids.add(lesson["id"])
    return ids


def _required_string(data: dict[str, Any], key: str, path: str, issues: list[ValidationIssue]) -> str | None:
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        issues.append(ValidationIssue(f"{path}.{key}", "Expected a non-empty string."))
        return None
    return value


def _check_unique(value: str, seen: set[str], path: str, label: str, issues: list[ValidationIssue]) -> None:
    if value in seen:
        issues.append(ValidationIssue(path, f"Duplicate {label} '{value}'."))
    seen.add(value)


def _validate_string_list(value: Any, path: str, issues: list[ValidationIssue]) -> None:
    if not isinstance(value, list):
        issues.append(ValidationIssue(path, "Expected a list of strings."))
        return
    for index, item in enumerate(value):
        if not isinstance(item, str) or not item.strip():
            issues.append(ValidationIssue(f"{path}[{index}]", "Expected a non-empty string."))


def _validate_fen_or_startpos(value: Any, path: str, issues: list[ValidationIssue]) -> None:
    if value == "startpos":
        return
    _validate_fen(value, path, issues)


def _validate_fen(value: Any, path: str, issues: list[ValidationIssue]) -> None:
    if not isinstance(value, str) or not value.strip():
        issues.append(ValidationIssue(path, "Expected a FEN string."))
        return
    try:
        chess.Board(value)
    except ValueError as exc:
        issues.append(ValidationIssue(path, f"Invalid FEN: {exc}"))


def _validate_square_list(value: Any, path: str, issues: list[ValidationIssue]) -> None:
    if value in (None, []):
        return
    if not isinstance(value, list):
        issues.append(ValidationIssue(path, "Expected a list of squares or highlight objects."))
        return
    for index, entry in enumerate(value):
        if isinstance(entry, str):
            _validate_square(entry, f"{path}[{index}]", issues)
        elif isinstance(entry, dict):
            _validate_square(entry.get("square"), f"{path}[{index}].square", issues)
        else:
            issues.append(ValidationIssue(f"{path}[{index}]", "Expected a square string or object with square."))


def _validate_square(value: Any, path: str, issues: list[ValidationIssue]) -> None:
    if not isinstance(value, str):
        issues.append(ValidationIssue(path, "Expected a square such as e4."))
        return
    try:
        chess.parse_square(value.lower())
    except ValueError:
        issues.append(ValidationIssue(path, f"Invalid square '{value}'."))


def _validate_uci(value: Any, path: str, issues: list[ValidationIssue]) -> None:
    if not isinstance(value, str):
        issues.append(ValidationIssue(path, "Expected a UCI move string."))
        return
    try:
        chess.Move.from_uci(value.lower())
    except ValueError as exc:
        issues.append(ValidationIssue(path, f"Invalid UCI move '{value}': {exc}"))


def _choice_value(choice: Any) -> str | None:
    if isinstance(choice, str):
        return choice
    if isinstance(choice, dict):
        value = choice.get("value", choice.get("label"))
        return value if isinstance(value, str) else None
    return None


def _is_rating_range(value: Any) -> bool:
    if isinstance(value, str):
        return bool(RATING_RANGE_PATTERN.match(value.strip()))
    return isinstance(value, list) and len(value) == 2 and all(isinstance(bound, int) for bound in value)
