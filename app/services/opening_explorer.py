import hashlib
import json
import ssl
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


BASE_URL = "https://explorer.lichess.ovh"
CACHE_TTL_SECONDS = 60 * 60 * 24
CACHE_PATH = Path(__file__).resolve().parents[1] / "cache" / "opening_explorer_cache.json"
ALLOWED_DATABASES = {"lichess", "masters"}


def get_explorer_data(database: str = "lichess", **params) -> dict:
    database_name = database if database in ALLOWED_DATABASES else "lichess"
    clean_params = _clean_params(params)
    cache_key = _cache_key(database_name, clean_params)
    cache = _read_cache()

    cached = cache.get(cache_key)
    if cached and time.time() - cached.get("timestamp", 0) < CACHE_TTL_SECONDS:
        data = cached.get("data", {})
        data["cache"] = {"hit": True, "ageSeconds": int(time.time() - cached["timestamp"])}
        return data

    url = f"{BASE_URL}/{database_name}"
    if clean_params:
        url = f"{url}?{urlencode(clean_params)}"

    try:
        request = Request(url, headers={"User-Agent": "FreeMate Opening Trainer"})
        with urlopen(request, timeout=8, context=_ssl_context()) as response:
            raw = json.loads(response.read().decode("utf-8"))
        normalized = normalize_explorer_response(raw, database_name, clean_params)
        normalized["cache"] = {"hit": False, "ageSeconds": 0}
        cache[cache_key] = {"timestamp": time.time(), "data": normalized}
        _write_cache(cache)
        return normalized
    except Exception as exc:
        if cached:
            data = cached.get("data", {})
            data["cache"] = {
                "hit": True,
                "stale": True,
                "ageSeconds": int(time.time() - cached.get("timestamp", 0)),
            }
            data["error"] = "Live explorer unavailable. Showing cached opening data."
            return data
        return {
            "database": database_name,
            "query": clean_params,
            "opening": None,
            "moves": [],
            "topGames": [],
            "recentGames": [],
            "totals": {"white": 0, "draws": 0, "black": 0, "games": 0},
            "cache": {"hit": False},
            "error": f"Live explorer unavailable: {exc}",
        }


def normalize_explorer_response(raw: dict, database: str, query: dict | None = None) -> dict:
    moves = []
    for move in raw.get("moves", []) or []:
        white = int(move.get("white", 0) or 0)
        draws = int(move.get("draws", 0) or 0)
        black = int(move.get("black", 0) or 0)
        games = white + draws + black
        moves.append(
            {
                "uci": move.get("uci"),
                "san": move.get("san"),
                "white": white,
                "draws": draws,
                "black": black,
                "games": games,
                "averageOpponentRating": move.get("averageOpponentRating"),
            }
        )

    totals = {
        "white": int(raw.get("white", 0) or 0),
        "draws": int(raw.get("draws", 0) or 0),
        "black": int(raw.get("black", 0) or 0),
    }
    totals["games"] = totals["white"] + totals["draws"] + totals["black"]

    opening = raw.get("opening")
    if opening:
        opening = {"eco": opening.get("eco"), "name": opening.get("name")}

    return {
        "database": database,
        "query": query or {},
        "opening": opening,
        "moves": moves,
        "topGames": raw.get("topGames", []) or [],
        "recentGames": raw.get("recentGames", []) or [],
        "totals": totals,
    }


def _clean_params(params: dict) -> dict:
    allowed = {"play", "fen", "speeds", "ratings", "moves", "topGames", "recentGames"}
    clean = {}
    for key, value in params.items():
        if key not in allowed or value in (None, ""):
            continue
        clean[key] = value
    return clean


def _cache_key(database: str, params: dict) -> str:
    payload = json.dumps({"database": database, "params": params}, sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _read_cache() -> dict:
    try:
        with CACHE_PATH.open(encoding="utf-8") as cache_file:
            return json.load(cache_file)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _write_cache(cache: dict) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CACHE_PATH.open("w", encoding="utf-8") as cache_file:
        json.dump(cache, cache_file, indent=2)


def _ssl_context():
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()
