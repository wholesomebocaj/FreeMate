# FreeMate

FreeMate is a beginner-friendly chess learning web app built with HTML, CSS, JavaScript, and Python FastAPI.

## Features

- Homepage with a simple chess learning introduction
- Lessons page with beginner lesson cards
- Navigation bar shared across pages
- FastAPI backend serving static frontend files
- API endpoint for validating chess moves
- Move validation powered by `python-chess`

## Project Structure

```text
FreeMate/
├── app/
│   ├── main.py
│   └── static/
│       ├── index.html
│       ├── lessons.html
│       ├── styles.css
│       └── script.js
├── requirements.txt
└── README.md
```

## Setup

1. Create and activate a virtual environment:

```bash
python -m venv .venv
source .venv/bin/activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Run the server:

```bash
uvicorn app.main:app --reload
```

4. Open the app:

```text
http://127.0.0.1:8000
```

## Move Validation API

Send a POST request to `/api/validate-move`:

```json
{
  "move": "e2e4"
}
```

Optional custom board positions can be supplied with FEN:

```json
{
  "move": "g1f3",
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
}
```

