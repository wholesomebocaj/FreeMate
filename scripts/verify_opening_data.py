from __future__ import annotations

import argparse
import csv
import io
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import chess
import chess.pgn


ROOT_DIR = Path(__file__).resolve().parents[1]
OPENINGS_DIR = ROOT_DIR / "app" / "static" / "data" / "openings"
OPENINGS_INDEX_PATH = OPENINGS_DIR / "index.json"
RAW_OPENINGS_DIRS = [
    ROOT_DIR / "app" / "data" / "openings" / "raw",
    ROOT_DIR / "app" / "static" / "data" / "openings" / "raw",
]

REFERENCE_FAMILIES = {
    "caro kann": "Caro-Kann",
    "english": "English",
    "four knights": "Four Knights",
    "french": "French",
    "italian": "Italian",
    "jobava": "Jobava",
    "rapport jobava": "Jobava",
    "king indian attack": "King's Indian Attack",
    "kings indian attack": "King's Indian Attack",
    "king indian defense": "King's Indian Defense",
    "kings indian defense": "King's Indian Defense",
    "london": "London",
    "modern": "Modern",
    "nimzo indian": "Nimzo-Indian",
    "petrov": "Petrov",
    "pirc": "Pirc",
    "queen gambit": "Queen's Gambit",
    "queens gambit": "Queen's Gambit",
    "queen pawn": "Queen's Pawn",
    "queens pawn": "Queen's Pawn",
    "scandinavian": "Scandinavian",
    "scotch": "Scotch",
    "sicilian": "Sicilian",
    "slav": "Slav",
    "three knights": "Three Knights",
    "vienna": "Vienna",
}

SEMANTIC_PROFILES = {
    "italian-game": {
        "mainline_branch": "main-line",
        "mainline_prefix": ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"],
        "branches": {
            "main-line": {
                "expected_prefix": ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"],
                "expected_family": "Italian",
                "forbidden_text": [],
            },
            "final-review": {
                "expected_prefix": ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"],
                "expected_family": "Italian",
                "forbidden_text": [],
            },
            "vs-sicilian": {
                "expected_prefix": ["e2e4", "c7c5"],
                "expected_family": "Sicilian",
                "forbidden_text": ["after the italian setup", "prepare c3 d4 or pressure on f7"],
            },
            "vs-caro-kann": {
                "expected_prefix": ["e2e4", "c7c6"],
                "expected_family": "Caro-Kann",
                "forbidden_text": ["after the italian setup", "prepare c3 d4 or pressure on f7"],
            },
            "vs-french": {
                "expected_prefix": ["e2e4", "e7e6"],
                "expected_family": "French",
                "forbidden_text": ["after the italian setup", "prepare c3 d4 or pressure on f7"],
            },
            "vs-scandinavian": {
                "expected_prefix": ["e2e4", "d7d5"],
                "expected_family": "Scandinavian",
                "forbidden_text": ["after the italian setup", "prepare c3 d4 or pressure on f7"],
            },
        },
    }
}


@dataclass(frozen=True)
class ReferenceEntry:
    source: str
    eco: str
    name: str
    line: str


@dataclass
class Finding:
    severity: str
    path: str
    message: str


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify FreeMate opening JSON against local ECO/Lichess references.")
    parser.add_argument("--fix-san", action="store_true", help="Rewrite incorrect SAN strings when UCI moves are legal.")
    parser.add_argument("--verbose", action="store_true", help="Show reference traces for each opening branch.")
    args = parser.parse_args()

    raw_dir = find_raw_dir()
    references = build_reference_index(raw_dir)
    findings: list[Finding] = []
    changed_files: set[Path] = set()

    openings = load_opening_files()
    branch_count = 0
    move_count = 0
    known_positions = 0

    for opening_path, opening in openings:
        changed, stats = verify_opening(opening_path, opening, references, findings, fix_san=args.fix_san, verbose=args.verbose)
        branch_count += stats["branches"]
        move_count += stats["moves"]
        known_positions += stats["known_positions"]
        if changed:
            with opening_path.open("w", encoding="utf-8") as file:
                json.dump(opening, file, indent=2, ensure_ascii=False)
                file.write("\n")
            changed_files.add(opening_path)

    print("FreeMate opening verification")
    print(f"  Reference root: {raw_dir.relative_to(ROOT_DIR)}")
    print(f"  Reference positions: {len(references):,}")
    print(f"  Openings checked: {len(openings)}")
    print(f"  Branches checked: {branch_count}")
    print(f"  Moves replayed: {move_count}")
    print(f"  Branch positions with a local reference hit: {known_positions}")

    if changed_files:
        print("  Files rewritten:")
        for path in sorted(changed_files):
            print(f"    - {path.relative_to(ROOT_DIR)}")

    if findings:
        print("\nFindings:")
        for finding in findings:
            print(f"  [{finding.severity}] {finding.path}: {finding.message}")
    else:
        print("\nNo opening correctness findings.")

    error_count = sum(1 for finding in findings if finding.severity == "ERROR")
    return 1 if error_count else 0


def find_raw_dir() -> Path:
    for raw_dir in RAW_OPENINGS_DIRS:
        if (raw_dir / "eco-json").exists() and (raw_dir / "lichess-chess-openings").exists():
            return raw_dir
    expected = " or ".join(str(path.relative_to(ROOT_DIR)) for path in RAW_OPENINGS_DIRS)
    raise SystemExit(f"Could not find local raw opening datasets under {expected}.")


def build_reference_index(raw_dir: Path) -> dict[str, list[ReferenceEntry]]:
    index: dict[str, list[ReferenceEntry]] = defaultdict(list)
    load_eco_json_references(raw_dir / "eco-json", index)
    load_lichess_tsv_references(raw_dir / "lichess-chess-openings", index)
    return {key: dedupe_entries(entries) for key, entries in index.items()}


def load_eco_json_references(eco_dir: Path, index: dict[str, list[ReferenceEntry]]) -> None:
    for path in sorted(eco_dir.glob("eco*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for fen, entry in data.items():
            if not isinstance(entry, dict):
                continue
            add_reference(
                index,
                fen,
                ReferenceEntry(
                    source=f"eco-json/{path.name}",
                    eco=str(entry.get("eco", "")),
                    name=str(entry.get("name", "")),
                    line=str(entry.get("moves", "")),
                ),
            )


def load_lichess_tsv_references(lichess_dir: Path, index: dict[str, list[ReferenceEntry]]) -> None:
    for path in sorted(lichess_dir.glob("?.tsv")):
        with path.open(encoding="utf-8", newline="") as file:
            reader = csv.DictReader(file, delimiter="\t")
            for row in reader:
                pgn = row.get("pgn", "")
                board = replay_pgn(pgn)
                if not board:
                    continue
                for key in position_keys(board):
                    index[key].append(
                        ReferenceEntry(
                            source=f"lichess-chess-openings/{path.name}",
                            eco=row.get("eco", ""),
                            name=row.get("name", ""),
                            line=pgn,
                        )
                    )


def add_reference(index: dict[str, list[ReferenceEntry]], fen: str, entry: ReferenceEntry) -> None:
    try:
        board = chess.Board(fen)
    except ValueError:
        return
    for key in position_keys(board):
        index[key].append(entry)


def replay_pgn(pgn: str) -> chess.Board | None:
    try:
        game = chess.pgn.read_game(io.StringIO(pgn))
    except (AssertionError, ValueError):
        return None
    if game is None:
        return None
    board = game.board()
    try:
        for move in game.mainline_moves():
            board.push(move)
    except (AssertionError, ValueError):
        return None
    return board


def load_opening_files() -> list[tuple[Path, dict[str, Any]]]:
    index = json.loads(OPENINGS_INDEX_PATH.read_text(encoding="utf-8"))
    openings: list[tuple[Path, dict[str, Any]]] = []
    for entry in index:
        path = (OPENINGS_DIR / entry["path"]).resolve()
        if not path.is_relative_to(OPENINGS_DIR.resolve()):
            raise SystemExit(f"Opening path escapes data directory: {entry['path']}")
        opening = json.loads(path.read_text(encoding="utf-8"))
        openings.append((path, opening))
    return openings


def verify_opening(
    opening_path: Path,
    opening: dict[str, Any],
    references: dict[str, list[ReferenceEntry]],
    findings: list[Finding],
    *,
    fix_san: bool,
    verbose: bool,
) -> tuple[bool, dict[str, int]]:
    changed = False
    stats = {"branches": 0, "moves": 0, "known_positions": 0}
    source = str(opening_path.relative_to(ROOT_DIR))
    starting_fen = opening.get("training", {}).get("startingFen", "startpos")
    sections = opening.get("sections", [])
    main_refs: list[ReferenceEntry] = []
    branch_records: dict[str, dict[str, Any]] = {}

    for section_index, section in enumerate(sections):
        for branch_index, branch in enumerate(section.get("branches") or section.get("lessons") or []):
            stats["branches"] += 1
            branch_path = f"{source}.sections[{section_index}].branches[{branch_index}]"
            branch_id = str(branch.get("id", f"branch-{section_index}-{branch_index}"))
            branch_records[branch_id] = {
                "path": branch_path,
                "branch": branch,
                "moves": branch_uci_moves(branch),
            }
            branch_stats, branch_refs, branch_changed = verify_branch(
                branch_path,
                branch,
                starting_fen,
                references,
                findings,
                fix_san=fix_san,
                verbose=verbose,
            )
            stats["moves"] += branch_stats["moves"]
            stats["known_positions"] += branch_stats["known_positions"]
            changed = changed or branch_changed
            if branch.get("isMainLine") or branch.get("id") == "main-line":
                main_refs.extend(branch_refs)
            verify_branch_label(branch_path, branch, branch_refs, findings)

    verify_opening_identity(source, opening, main_refs, findings)
    verify_semantic_profile(source, opening, branch_records, references, findings)
    return changed, stats


def verify_branch(
    branch_path: str,
    branch: dict[str, Any],
    starting_fen: str,
    references: dict[str, list[ReferenceEntry]],
    findings: list[Finding],
    *,
    fix_san: bool,
    verbose: bool,
) -> tuple[dict[str, int], list[ReferenceEntry], bool]:
    try:
        board = chess.Board() if starting_fen == "startpos" else chess.Board(starting_fen)
    except ValueError as exc:
        findings.append(Finding("ERROR", f"{branch_path}.training.startingFen", f"Invalid starting FEN: {exc}"))
        return {"moves": 0, "known_positions": 0}, [], False

    changed = False
    seen_refs: list[ReferenceEntry] = []
    known_positions = 0
    moves = branch.get("moves", [])

    for move_index, move_data in enumerate(moves):
        move_path = f"{branch_path}.moves[{move_index}]"
        uci = str(move_data.get("uci", "")).lower()
        try:
            move = chess.Move.from_uci(uci)
        except ValueError as exc:
            findings.append(Finding("ERROR", f"{move_path}.uci", f"Invalid UCI '{uci}': {exc}"))
            break

        if move not in board.legal_moves:
            findings.append(Finding("ERROR", f"{move_path}.uci", f"Illegal move '{uci}' from {board.fen()}"))
            break

        expected_san = board.san(move)
        current_san = move_data.get("san")
        if current_san != expected_san:
            severity = "FIXED" if fix_san else "ERROR"
            findings.append(Finding(severity, f"{move_path}.san", f"Expected '{expected_san}' for {uci}, found '{current_san}'"))
            if fix_san:
                move_data["san"] = expected_san
                changed = True

        board.push(move)
        refs = lookup_references(board, references)
        if refs:
            known_positions += 1
            seen_refs.extend(refs)
            if verbose:
                compact = ", ".join(f"{entry.eco} {entry.name}" for entry in refs[:3])
                findings.append(Finding("INFO", f"{move_path}.position", f"Reference hit after {uci}: {compact}"))

    return {"moves": len(moves), "known_positions": known_positions}, dedupe_entries(seen_refs), changed


def verify_opening_identity(source: str, opening: dict[str, Any], refs: list[ReferenceEntry], findings: list[Finding]) -> None:
    opening_name = opening.get("name", "")
    opening_eco = opening.get("eco", "")
    if not refs:
        findings.append(Finding("WARN", source, f"No local reference positions found for main line '{opening_name}'."))
        return

    family_matches = [entry for entry in refs if family_matches_name(opening_name, entry.name)]
    eco_matches = [entry for entry in refs if entry.eco == opening_eco]
    if not family_matches:
        sample = summarize_refs(refs)
        findings.append(Finding("WARN", source, f"Main line did not map to the declared family '{opening_name}'. Reference sample: {sample}"))
        return
    if opening_eco and not any(entry.eco == opening_eco for entry in family_matches):
        sample = summarize_refs(family_matches)
        findings.append(Finding("ERROR", f"{source}.eco", f"Declared ECO '{opening_eco}' does not match family reference positions: {sample}"))
    elif opening_eco and not eco_matches:
        sample = summarize_refs(refs)
        findings.append(Finding("WARN", f"{source}.eco", f"Declared ECO '{opening_eco}' was not found in any main-line reference hit. Reference sample: {sample}"))


def verify_branch_label(branch_path: str, branch: dict[str, Any], refs: list[ReferenceEntry], findings: list[Finding]) -> None:
    expected_family = expected_family_from_branch(branch)
    if not expected_family or not refs:
        return
    if not any(family_matches_name(expected_family, entry.name) for entry in refs):
        sample = summarize_refs(refs)
        findings.append(
            Finding(
                "WARN",
                branch_path,
                f"Branch label suggests '{expected_family}', but replayed positions matched: {sample}",
            )
        )


def expected_family_from_branch(branch: dict[str, Any]) -> str | None:
    primary = normalize_name(" ".join(str(branch.get(key, "")) for key in ("id", "title")))
    for key, label in REFERENCE_FAMILIES.items():
        if key in primary:
            return label
    haystack = normalize_name(str(branch.get("description", "")))
    for key, label in REFERENCE_FAMILIES.items():
        if key in haystack:
            return label
    return None


def branch_uci_moves(branch: dict[str, Any]) -> list[str]:
    return [str(move.get("uci", "")).lower() for move in branch.get("moves", [])]


def verify_semantic_profile(
    source: str,
    opening: dict[str, Any],
    branch_records: dict[str, dict[str, Any]],
    references: dict[str, list[ReferenceEntry]],
    findings: list[Finding],
) -> None:
    profile = SEMANTIC_PROFILES.get(str(opening.get("id", "")))
    if not profile:
        return

    mainline_branch_id = profile.get("mainline_branch")
    if mainline_branch_id:
        record = branch_records.get(mainline_branch_id)
        if not record:
            findings.append(Finding("ERROR", source, f"Semantic profile expects main line branch '{mainline_branch_id}', but it is missing."))
        else:
            expected = profile.get("mainline_prefix", [])
            verify_expected_prefix(record["path"], record["moves"], expected, findings, "main line checkpoint")

    for branch_id, branch_profile in profile.get("branches", {}).items():
        record = branch_records.get(branch_id)
        if not record:
            findings.append(Finding("WARN", source, f"Semantic profile expects branch '{branch_id}', but it is missing."))
            continue

        moves = record["moves"]
        expected_prefix = branch_profile.get("expected_prefix", [])
        verify_expected_prefix(record["path"], moves, expected_prefix, findings, "branch attachment")

        expected_family = branch_profile.get("expected_family")
        if expected_family and expected_prefix and moves[: len(expected_prefix)] == expected_prefix:
            refs = references_after_moves(expected_prefix, references)
            if refs and not any(family_matches_name(expected_family, entry.name) for entry in refs):
                findings.append(
                    Finding(
                        "WARN",
                        record["path"],
                        f"Expected '{expected_family}' after curated prefix {format_line(expected_prefix)}, but reference data shows: {summarize_refs(refs)}",
                    )
                )

        text = semantic_text(record["branch"])
        for forbidden in branch_profile.get("forbidden_text", []):
            if forbidden in text:
                findings.append(
                    Finding(
                        "WARN",
                        record["path"],
                        f"Coach text may be mismatched for this branch: found '{forbidden}'.",
                    )
                )


def verify_expected_prefix(branch_path: str, moves: list[str], expected: list[str], findings: list[Finding], label: str) -> None:
    if not expected:
        return
    actual = moves[: len(expected)]
    if actual != expected:
        expected_fen = fen_after_moves(expected[:-1]) if len(expected) > 1 else chess.Board().fen()
        findings.append(
            Finding(
                "ERROR",
                branch_path,
                f"Unexpected {label}. Expected prefix {format_line(expected)}, found {format_line(actual)}. Parent FEN before divergence: {expected_fen}",
            )
        )


def references_after_moves(moves: list[str], references: dict[str, list[ReferenceEntry]]) -> list[ReferenceEntry]:
    board = chess.Board()
    for uci in moves:
        move = chess.Move.from_uci(uci)
        if move not in board.legal_moves:
            return []
        board.push(move)
    return lookup_references(board, references)


def fen_after_moves(moves: list[str]) -> str:
    board = chess.Board()
    for uci in moves:
        move = chess.Move.from_uci(uci)
        if move not in board.legal_moves:
            break
        board.push(move)
    return board.fen()


def semantic_text(branch: dict[str, Any]) -> str:
    chunks = [
        str(branch.get("title", "")),
        str(branch.get("description", "")),
        " ".join(str(note) for note in branch.get("coachingNotes", [])),
    ]
    for move in branch.get("moves", []):
        chunks.append(str(move.get("title", "")))
        chunks.append(str(move.get("explanation", "")))
    return normalize_name(" ".join(chunks))


def format_line(moves: list[str]) -> str:
    return ", ".join(moves) if moves else "none"


def lookup_references(board: chess.Board, references: dict[str, list[ReferenceEntry]]) -> list[ReferenceEntry]:
    entries: list[ReferenceEntry] = []
    for key in position_keys(board):
        entries.extend(references.get(key, []))
    return dedupe_entries(entries)


def position_keys(board: chess.Board) -> set[str]:
    keys: set[str] = set()
    for fen in {board.fen(), board.fen(en_passant="fen")}:
        fields = fen.split()
        keys.add(" ".join(fields[:4]))
        keys.add(" ".join(fields[:6]))
    return keys


def dedupe_entries(entries: list[ReferenceEntry]) -> list[ReferenceEntry]:
    seen: set[tuple[str, str, str]] = set()
    unique: list[ReferenceEntry] = []
    for entry in entries:
        key = (entry.source, entry.eco, entry.name)
        if key in seen:
            continue
        seen.add(key)
        unique.append(entry)
    return unique


def family_matches_name(expected: str, reference_name: str) -> bool:
    expected_norm = normalize_name(expected)
    reference_norm = normalize_name(reference_name)
    if expected_norm and expected_norm in reference_norm:
        return True
    expected_words = [word for word in expected_norm.split() if word not in {"game", "defense", "opening", "system"}]
    return bool(expected_words) and all(word in reference_norm for word in expected_words)


def normalize_name(value: str) -> str:
    normalized = value.lower()
    normalized = normalized.replace("’", "'").replace("-", " ")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def summarize_refs(refs: list[ReferenceEntry], limit: int = 5) -> str:
    if not refs:
        return "none"
    counter = Counter((entry.eco, entry.name) for entry in refs)
    return "; ".join(f"{eco} {name} ({count})" for (eco, name), count in counter.most_common(limit))


if __name__ == "__main__":
    raise SystemExit(main())
