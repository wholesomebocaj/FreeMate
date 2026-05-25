from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.services.content_validator import (  # noqa: E402
    ValidationIssue,
    validate_curriculum_data,
    validate_opening_data,
    validate_opening_index,
)
from app.main import load_course_folders  # noqa: E402


DATA_DIR = ROOT_DIR / "app" / "static" / "data"
BRACKETS_PATH = DATA_DIR / "brackets.json"
OPENINGS_DIR = DATA_DIR / "openings"
OPENINGS_INDEX_PATH = OPENINGS_DIR / "index.json"


def main() -> int:
    issues: list[ValidationIssue] = []

    courses = load_course_folders()
    brackets = read_json(BRACKETS_PATH)
    opening_index = read_json(OPENINGS_INDEX_PATH)

    issues.extend(validate_curriculum_data(courses, brackets))
    issues.extend(validate_opening_index(opening_index, OPENINGS_DIR))

    opening_count = 0
    section_count = 0
    branch_count = 0
    move_count = 0
    if isinstance(opening_index, list):
        for entry in opening_index:
            if not isinstance(entry, dict) or not entry.get("path"):
                continue
            opening_path = OPENINGS_DIR / entry["path"]
            if not opening_path.exists():
                continue
            opening = read_json(opening_path)
            opening_count += 1
            sections = opening.get("sections", []) if isinstance(opening, dict) else []
            section_count += len(sections) if isinstance(sections, list) else 0
            if isinstance(sections, list):
                for section in sections:
                    branches = section.get("branches") or section.get("lessons") or [] if isinstance(section, dict) else []
                    branch_count += len(branches) if isinstance(branches, list) else 0
                    if isinstance(branches, list):
                        move_count += sum(
                            len(branch.get("moves", []))
                            for branch in branches
                            if isinstance(branch, dict) and isinstance(branch.get("moves"), list)
                        )
            issues.extend(validate_opening_data(opening, source=f"openings/{entry['path']}"))

    if issues:
        print("FreeMate content validation failed:")
        for issue in issues:
            print(f"  - {issue}")
        return 1

    lesson_count = count_lessons(courses)
    course_count = len(courses) if isinstance(courses, list) else 0
    bracket_count = len(brackets) if isinstance(brackets, list) else 0
    print("FreeMate content validation passed.")
    print(f"  Curriculum: {bracket_count} brackets, {course_count} courses, {lesson_count} lessons")
    print(f"  Openings: {opening_count} openings, {section_count} sections, {branch_count} branches, {move_count} moves")
    return 0


def read_json(path: Path):
    try:
        with path.open(encoding="utf-8") as file:
            return json.load(file)
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError as exc:
        return {"__json_error__": f"{exc.msg} at line {exc.lineno}, column {exc.colno}"}


def count_lessons(courses) -> int:
    if not isinstance(courses, list):
        return 0
    count = 0
    for course in courses:
        for category in course.get("categories", []) if isinstance(course, dict) else []:
            for skill in category.get("skills", []) if isinstance(category, dict) else []:
                count += len(skill.get("lessons", [])) if isinstance(skill, dict) else 0
    return count


if __name__ == "__main__":
    raise SystemExit(main())
