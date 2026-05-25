from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status as http_status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import CourseProgress, LessonProgress, OpeningProgress


ALLOWED_LESSON_STATUSES = {"new", "learning", "shaky", "mastered"}


def get_progress_snapshot(db: Session, user_id: int) -> dict[str, list[dict[str, Any]]]:
    lesson_rows = db.scalars(
        select(LessonProgress).where(LessonProgress.user_id == user_id).order_by(LessonProgress.updated_at.desc())
    ).all()
    opening_rows = db.scalars(
        select(OpeningProgress).where(OpeningProgress.user_id == user_id).order_by(OpeningProgress.updated_at.desc())
    ).all()
    course_rows = db.scalars(
        select(CourseProgress).where(CourseProgress.user_id == user_id).order_by(CourseProgress.updated_at.desc())
    ).all()

    return {
        "lessons": [serialize_lesson_progress(row) for row in lesson_rows],
        "openings": [serialize_opening_progress(row) for row in opening_rows],
        "courses": [serialize_course_progress(row) for row in course_rows],
    }


def upsert_lesson_progress(
    db: Session,
    user_id: int,
    *,
    lesson_id: str,
    status: str | None = None,
    completed: bool | None = None,
    mastery_score: float | None = None,
    last_step_index: int | None = None,
    last_position_fen: str | None = None,
) -> LessonProgress:
    row = db.scalar(
        select(LessonProgress).where(
            LessonProgress.user_id == user_id,
            LessonProgress.lesson_id == lesson_id,
        )
    )
    if row is None:
        row = LessonProgress(user_id=user_id, lesson_id=lesson_id)

    if status is not None:
        normalized_status = status.strip().lower()
        if normalized_status not in ALLOWED_LESSON_STATUSES:
            raise HTTPException(
                status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Lesson progress status must be new, learning, shaky, or mastered.",
            )
        row.status = normalized_status

    if completed is not None:
        row.completed = bool(completed)

    if mastery_score is not None:
        row.mastery_score = float(mastery_score)

    if last_step_index is not None:
        row.last_step_index = max(0, int(last_step_index))

    if last_position_fen is not None:
        row.last_position_fen = last_position_fen

    if row.completed and row.status != "mastered":
        row.status = "mastered"

    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def upsert_opening_progress(
    db: Session,
    user_id: int,
    *,
    opening_key: str,
    branch_key: str,
    move_index: int,
    completed: bool | None = None,
    mastery_score: float | None = None,
) -> OpeningProgress:
    row = db.scalar(
        select(OpeningProgress).where(
            OpeningProgress.user_id == user_id,
            OpeningProgress.opening_key == opening_key,
            OpeningProgress.branch_key == branch_key,
        )
    )
    if row is None:
        row = OpeningProgress(
            user_id=user_id,
            opening_key=opening_key,
            branch_key=branch_key,
        )

    row.move_index = max(0, int(move_index))

    if completed is not None:
        row.completed = bool(completed)

    if mastery_score is not None:
        row.mastery_score = float(mastery_score)

    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def upsert_course_progress(
    db: Session,
    user_id: int,
    *,
    course_id: str,
    completed_lessons: int,
    completion_percent: float,
) -> CourseProgress:
    row = db.scalar(
        select(CourseProgress).where(
            CourseProgress.user_id == user_id,
            CourseProgress.course_id == course_id,
        )
    )
    if row is None:
        row = CourseProgress(
            user_id=user_id,
            course_id=course_id,
        )

    row.completed_lessons = max(0, int(completed_lessons))
    row.completion_percent = max(0.0, min(100.0, float(completion_percent)))

    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def serialize_lesson_progress(row: LessonProgress) -> dict[str, Any]:
    return {
        "id": row.id,
        "lesson_id": row.lesson_id,
        "status": row.status,
        "completed": row.completed,
        "mastery_score": row.mastery_score,
        "last_step_index": row.last_step_index,
        "last_position_fen": row.last_position_fen,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def serialize_opening_progress(row: OpeningProgress) -> dict[str, Any]:
    return {
        "id": row.id,
        "opening_key": row.opening_key,
        "branch_key": row.branch_key,
        "move_index": row.move_index,
        "completed": row.completed,
        "mastery_score": row.mastery_score,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def serialize_course_progress(row: CourseProgress) -> dict[str, Any]:
    return {
        "id": row.id,
        "course_id": row.course_id,
        "completed_lessons": row.completed_lessons,
        "completion_percent": row.completion_percent,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }
