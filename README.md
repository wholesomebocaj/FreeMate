# FreeMate

FreeMate is an interactive chess learning platform built to make high-quality chess education completely free and beginner friendly.

Inspired by platforms like Chessable, Chess.com, and Lichess, FreeMate focuses on guided learning, structured progression, interactive lessons, and playable opening repertoires without paywalls or overwhelming theory.

The goal is simple:

> Teach players what to do, why they are doing it, and how to survive real games.

---

# Features

## Interactive Lessons

* Step-by-step beginner lessons
* Visual board demonstrations
* Guided move validation
* Progression-based learning
* Interactive board tasks
* Tactical exercises
* Checkmate training
* Opening principles
* Endgame basics

---

## Opening Trainer

A fully playable opening training system inspired by Chessable-style repertoires.

Features include:

* Branching opening trees
* Main lines and opponent responses
* Interactive move training
* Coach explanations
* Move-by-move guidance
* Common beginner mistakes
* Progress tracking
* Playable variations
* Auto-play opponent responses
* Smooth board animations

---

## Beginner-Focused Teaching

FreeMate prioritizes:

* understanding over memorization
* practical chess plans
* beginner confidence
* simple explanations
* real-game usability

The platform teaches:

* what moves do
* why they are played
* what each side is trying to achieve
* what plans come next after the opening

---

# Tech Stack

## Frontend

* HTML
* CSS
* JavaScript

## Backend

* Python
* FastAPI

## Chess Systems

* Chessground
* python-chess
* Lichess Opening Explorer API

---

# Current Learning Systems

## Beginner Courses

* Board Basics
* Piece Movement
* Legal Moves
* Checkmate vs Stalemate
* Basic Tactics
* Opening Principles
* Endgame Basics

---

## Opening Repertoires

### White

* Italian Game
* London System
* Queen’s Gambit
* Vienna Game
* Four Knights Game
* Scotch Game
* English Opening
* King’s Indian Attack
* Jobava London

### Black

* Scandinavian Defense
* Caro-Kann Defense
* French Defense
* Sicilian Defense
* King’s Indian Defense
* Pirc Defense
* Slav Defense
* Nimzo-Indian Defense
* Modern Defense

---

# Opening Training Philosophy

FreeMate does not try to force users to memorize long engine lines.

Instead, the opening trainer focuses on:

* center control
* development
* king safety
* practical plans
* common reactions
* realistic beginner positions

Example structure:

```text id="mjlwmv"
Main Line
├── If opponent plays c5
├── If opponent plays e6
├── If opponent plays d5
└── Common mistakes
```

The system teaches:

> “If your opponent does this, here’s the practical beginner response.”

---

# Interactive Board System

All lessons and openings use a shared interactive PracticeBoard system with:

* drag-and-drop movement
* click-to-move support
* move validation
* highlighted squares
* guided interactions
* sounds
* animations
* lesson restrictions
* playable training lines

---

# Progression System

Lessons are grouped into skill brackets:

* Beginner (0–100)
* Beginner+ (100–400)
* Novice (400–600)
* Intermediate (600–900)
* Advanced Beginner (900–1200)

The goal is to create a structured learning journey instead of a flat course list.

---

# Open Source Chess Data

FreeMate uses open chess resources including:

* Lichess Opening Explorer
* ECO opening data
* PGN move trees
* python-chess

All educational explanations and lesson flows are original and beginner-focused.

---

# Running Locally

## 1. Clone the repository

```bash id="2lrq90"
git clone https://github.com/wholesomebocaj/FreeMate.git
cd FreeMate
```

---

## 2. Create virtual environment

```bash id="p6r17c"
python -m venv .venv
```

Activate it:

### Mac/Linux

```bash id="yeg0b6"
source .venv/bin/activate
```

### Windows

```bash id="73j5v8"
.venv\Scripts\activate
```

---

## 3. Install dependencies

```bash id="jv3fb5"
pip install -r requirements.txt
```

---

## 4. Start the server

```bash id="9cc8q0"
python app/main.py
```

---

## 5. Open in browser

```text id="h0xg5d"
http://localhost:8000
```

---

# Roadmap

Planned features:

* Spaced repetition opening review
* Puzzle rating system
* User accounts
* Progress sync
* Stockfish analysis
* Game review tools
* Adaptive training
* AI coaching
* Daily lessons
* Real-game import analysis
* Mobile responsiveness improvements
* Achievement/progression systems

---

# Vision

FreeMate aims to become:

* a genuinely free chess learning platform
* beginner friendly
* modern and interactive
* educational without being overwhelming
* an alternative to expensive chess learning subscriptions

Core philosophy:

> Learn chess with understanding, not memorization.

---

# License

This project uses open chess data and open-source libraries where applicable.

Educational content and lesson systems are original to FreeMate.
