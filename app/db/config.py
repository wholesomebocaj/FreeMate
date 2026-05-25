from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if database_url:
        if database_url.startswith("postgres://"):
            return "postgresql+psycopg2://" + database_url.removeprefix("postgres://")
        return database_url

    fallback_path = (Path(__file__).resolve().parents[2] / "freemate.db").as_posix()
    return f"sqlite:///{fallback_path}"
