const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const progressKey = "freemate.completedLessons";
const stepKey = "freemate.lessonSteps";
const pieceAssets = {
    wK: "/static/assets/pieces/wK.svg",
    wQ: "/static/assets/pieces/wQ.svg",
    wR: "/static/assets/pieces/wR.svg",
    wB: "/static/assets/pieces/wB.svg",
    wN: "/static/assets/pieces/wN.svg",
    wP: "/static/assets/pieces/wP.svg",
    bK: "/static/assets/pieces/bK.svg",
    bQ: "/static/assets/pieces/bQ.svg",
    bR: "/static/assets/pieces/bR.svg",
    bB: "/static/assets/pieces/bB.svg",
    bN: "/static/assets/pieces/bN.svg",
    bP: "/static/assets/pieces/bP.svg",
};
const startingFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

let course = null;
let completedLessons = loadSet(progressKey);
let savedSteps = loadObject(stepKey);
let activeLesson = null;
let activeStepIndex = 0;
let activeBoard = null;
let audioContext = null;
let PracticeBoard = null;

function loadSet(key) {
    try {
        return new Set(JSON.parse(localStorage.getItem(key)) || []);
    } catch (error) {
        return new Set();
    }
}

function loadObject(key) {
    try {
        return JSON.parse(localStorage.getItem(key)) || {};
    } catch (error) {
        return {};
    }
}

function saveProgress() {
    localStorage.setItem(progressKey, JSON.stringify([...completedLessons]));
    localStorage.setItem(stepKey, JSON.stringify(savedSteps));
}

function playSound(type) {
    audioContext = audioContext || new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const tones = {
        move: [420, 0.045],
        capture: [260, 0.07],
        illegal: [130, 0.11],
        success: [620, 0.12],
    };
    const [frequency, duration] = tones[type] || tones.move;

    oscillator.frequency.value = frequency;
    oscillator.type = type === "illegal" ? "sawtooth" : "sine";
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(
        0.08,
        audioContext.currentTime + 0.01,
    );
    gain.gain.exponentialRampToValueAtTime(
        0.0001,
        audioContext.currentTime + duration,
    );
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
}

function allLessons() {
    if (!course) return [];
    return course.categories.flatMap((category) =>
        category.skills.flatMap((skill) =>
            skill.lessons.map((lesson) => ({ ...lesson, category, skill })),
        ),
    );
}

function lessonById(id) {
    return allLessons().find((lesson) => lesson.id === id);
}

function lessonIndex(id) {
    return allLessons().findIndex((lesson) => lesson.id === id);
}

function availableCourses() {
    if (!course) return [];

    const categoryById = Object.fromEntries(
        course.categories.map((category) => [category.id, category]),
    );
    const courseFromCategory = (
        id,
        title,
        description,
        difficulty = "Beginner",
    ) => ({
        id,
        title,
        description,
        difficulty,
        source: "category",
        categories: categoryById[id] ? [categoryById[id]] : [],
    });

    return [
        {
            id: "beginner-chess-course",
            title: "Beginner Chess Course",
            description: course.description,
            difficulty: "Beginner",
            source: "full",
            categories: course.categories,
        },
        courseFromCategory(
            "basic-tactics",
            "Basic Tactics",
            "Recognize simple patterns that win material or create checkmate threats.",
            "Beginner+",
        ),
        {
            id: "checkmate-patterns",
            title: "Checkmate Patterns",
            description:
                "Build pattern recognition for mate in 1 and common beginner checkmates.",
            difficulty: "Beginner+",
            source: "planned",
            categories: [],
        },
        courseFromCategory(
            "basic-opening-principles",
            "Opening Principles",
            "Learn calm first moves, center control, development, and king safety.",
            "Beginner",
        ),
        {
            id: "endgame-basics",
            title: "Endgame Basics",
            description:
                "Learn simple king activity, pawn promotion, and basic winning technique.",
            difficulty: "Beginner+",
            source: "planned",
            categories: [],
        },
    ];
}

function courseById(id) {
    return (
        availableCourses().find((courseItem) => courseItem.id === id) ||
        availableCourses()[0]
    );
}

function currentCourseIdFromUrl() {
    const parts = window.location.pathname.split("/");
    return parts[1] === "courses" ? parts[2] : "beginner-chess-course";
}

function courseLessons(courseItem) {
    return (courseItem?.categories || []).flatMap((category) =>
        category.skills.flatMap((skill) =>
            skill.lessons.map((lesson) => ({ ...lesson, category, skill })),
        ),
    );
}

function coursePercent(courseItem) {
    const lessons = courseLessons(courseItem);
    if (!lessons.length) return 0;
    return Math.round(
        (lessons.filter((lesson) => completedLessons.has(lesson.id)).length /
            lessons.length) *
            100,
    );
}

function nextLessonInCourse(courseItem) {
    const lessons = courseLessons(courseItem);
    return (
        lessons.find(
            (lesson) => !completedLessons.has(lesson.id) && isUnlocked(lesson),
        ) || lessons[0]
    );
}

function isUnlocked(lesson) {
    const index = lessonIndex(lesson.id);
    if (index <= 0) return true;
    const previous = allLessons()[index - 1];
    return !lesson.locked || completedLessons.has(previous.id);
}

function nextLesson() {
    return (
        allLessons().find(
            (lesson) => !completedLessons.has(lesson.id) && isUnlocked(lesson),
        ) || allLessons()[0]
    );
}

function progressPercent() {
    const lessons = allLessons();
    if (!lessons.length) return 0;
    return Math.round(
        (lessons.filter((lesson) => completedLessons.has(lesson.id)).length /
            lessons.length) *
            100,
    );
}

function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
}

/* Legacy ChessBoard removed. Use PracticeBoard from /static/components/PracticeBoard.js */

function updateProgressUI() {
    const lessons = allLessons();
    const completeCount = lessons.filter((lesson) =>
        completedLessons.has(lesson.id),
    ).length;
    const percent = progressPercent();
    setText(
        "#progress-count",
        `${completeCount} of ${lessons.length} complete`,
    );
    setText("#completed-number", completeCount);
    setText("#course-percent", `${percent}%`);
    document.querySelectorAll(".progress-fill").forEach((fill) => {
        if (fill.id !== "lesson-progress-fill")
            fill.style.width = `${percent}%`;
    });

    const next = nextLesson();
    if (next) {
        setText("#current-focus", next.skill.title);
        setText("#next-lesson", `Next: ${next.title}`);
    }
}

function renderRoadmap(targetId) {
    const target = document.querySelector(targetId);
    if (!target || !course) return;
    target.innerHTML = "";

    const currentCourse = document.querySelector("#course-detail")
        ? courseById(currentCourseIdFromUrl())
        : { categories: course.categories };

    currentCourse.categories.forEach((category) => {
        const lessons = category.skills.flatMap((skill) => skill.lessons);
        const complete = lessons.every((lesson) =>
            completedLessons.has(lesson.id),
        );
        const unlocked = lessons.some((lesson) =>
            isUnlocked(lessonById(lesson.id)),
        );
        const item = document.createElement("div");
        item.className = `roadmap-item ${complete ? "complete" : unlocked ? "current" : "locked"}`;
        item.textContent = category.title;
        target.appendChild(item);
    });
}

function renderCourseCards() {
    const browser = document.querySelector("#course-cards");
    if (!browser || !course) return;

    const beginnerCourse = courseById("beginner-chess-course");
    const next = nextLesson();
    if (next) {
        document.querySelector("#continue-card-button").href =
            `/courses/beginner-chess-course`;
        setText("#continue-title", next.title);
        setText(
            "#continue-description",
            `${next.category.title} · ${next.skill.title} · ${next.timeMinutes || 5} min`,
        );
    }

    browser.innerHTML = "";
    availableCourses().forEach((courseItem) => {
        const lessons = courseLessons(courseItem);
        const percent = coursePercent(courseItem);
        const lessonLabel =
            lessons.length === 1 ? "1 lesson" : `${lessons.length} lessons`;
        const buttonText =
            percent > 0
                ? "Continue"
                : courseItem.source === "planned"
                  ? "Preview"
                  : "Start";
        const card = document.createElement("article");
        card.className = `course-card ${courseItem.source === "planned" ? "is-planned" : ""}`;
        card.innerHTML = `
      <div>
        <span class="lesson-state">${courseItem.difficulty}</span>
        <h2>${courseItem.title}</h2>
        <p>${courseItem.description}</p>
      </div>
      <div class="course-card-meta">
        <span>${lessonLabel}</span>
        <span>${percent}% complete</span>
      </div>
      <div class="lesson-row-progress">
        <div class="progress-track"><div class="progress-fill" style="width: ${percent}%"></div></div>
        <span>${percent}%</span>
      </div>
      <a class="button primary" href="/courses/${courseItem.id}">${buttonText}</a>
    `;
        browser.appendChild(card);
    });

    setText(
        "#progress-count",
        `${courseLessons(beginnerCourse).filter((lesson) => completedLessons.has(lesson.id)).length} lessons complete`,
    );
}

function renderCourseDetail() {
    const browser = document.querySelector("#course-detail");
    if (!browser || !course) return;

    const currentCourse = courseById(currentCourseIdFromUrl());
    const lessonsInCourse = courseLessons(currentCourse);
    const completeCount = lessonsInCourse.filter((lesson) =>
        completedLessons.has(lesson.id),
    ).length;
    const percent = coursePercent(currentCourse);
    const next = nextLessonInCourse(currentCourse);

    setText("#course-title", currentCourse.title);
    setText("#course-description", currentCourse.description);
    setText(
        "#progress-count",
        `${completeCount} of ${lessonsInCourse.length} complete`,
    );
    document.querySelector("#progress-fill").style.width = `${percent}%`;

    if (next) {
        document.querySelector("#continue-learning").href =
            `/lessons/${next.id}`;
        document.querySelector("#continue-card-button").href =
            `/lessons/${next.id}`;
        setText("#continue-title", next.title);
        setText(
            "#continue-description",
            `${next.category.title} · ${next.skill.title} · ${next.timeMinutes || 5} min`,
        );
    } else {
        document.querySelector("#continue-learning").href = "/lessons";
        document.querySelector("#continue-card-button").href = "/lessons";
        setText("#continue-title", "This course is coming soon");
        setText(
            "#continue-description",
            "FreeMate will add these lessons after the beginner path is solid.",
        );
    }

    browser.innerHTML = "";

    if (!currentCourse.categories.length) {
        browser.innerHTML = `
      <section class="course-category-card">
        <div class="category-heading">
          <p class="eyebrow">Planned course</p>
          <h2>${currentCourse.title}</h2>
          <p>This course is part of the FreeMate roadmap. For now, continue with the Beginner Chess Course.</p>
        </div>
        <a class="button primary" href="/courses/beginner-chess-course">Open Beginner Course</a>
      </section>
    `;
        return;
    }

    currentCourse.categories.forEach((category) => {
        const section = document.createElement("section");
        section.className = "course-category-card";
        section.innerHTML = `
      <div class="category-heading">
        <div>
          <p class="eyebrow">Category</p>
          <h2>${category.title}</h2>
          <p>${category.description}</p>
        </div>
      </div>
      <div class="lesson-row-list"></div>
    `;

        const list = section.querySelector(".lesson-row-list");
        category.skills.forEach((skill) => {
            skill.lessons.forEach((lessonData) => {
                const lesson = lessonById(lessonData.id);
                const complete = completedLessons.has(lesson.id);
                const unlocked = isUnlocked(lesson);
                const stepCount = lesson.steps?.length || 1;
                const lessonProgress = complete
                    ? 100
                    : Math.round(
                          ((savedSteps[lesson.id] || 0) / stepCount) * 100,
                      );
                const row = document.createElement("article");
                row.className = `lesson-row ${unlocked ? "" : "is-locked"}`;
                row.innerHTML = `
          <div class="lesson-row-main">
            <span class="lesson-state">${complete ? "Complete" : unlocked ? "Unlocked" : "Locked"}</span>
            <h3>${lesson.title}</h3>
            <p>${lesson.summary}</p>
          </div>
          <div class="lesson-row-meta">
            <span>${lesson.difficulty}</span>
            <span>${lesson.timeMinutes || 5} min</span>
            <span>${lesson.ratingRange}</span>
          </div>
          <div class="lesson-row-progress">
            <div class="progress-track"><div class="progress-fill" style="width: ${lessonProgress}%"></div></div>
            <span>${lessonProgress}%</span>
          </div>
          <a class="button ${unlocked ? "primary" : "secondary"}" href="${unlocked ? `/lessons/${lesson.id}` : "#"}">${complete ? "Review" : "Continue"}</a>
        `;
                list.appendChild(row);
            });
        });

        browser.appendChild(section);
    });
}

function renderCourseTree() {
    const tree = document.querySelector("#course-tree");
    if (!tree || !course) return;
    tree.innerHTML = "";

    course.categories.forEach((category) => {
        const group = document.createElement("section");
        group.className = "tree-category";
        group.innerHTML = `<h3>${category.title}</h3>`;

        category.skills.forEach((skill) => {
            const block = document.createElement("div");
            block.className = "tree-skill";
            block.innerHTML = `<p>${skill.title}</p>`;
            skill.lessons.forEach((lessonData) => {
                const lesson = lessonById(lessonData.id);
                const unlocked = isUnlocked(lesson);
                const link = document.createElement("a");
                link.className = `tree-lesson ${unlocked ? "" : "is-locked"}`;
                link.href = unlocked ? `/lessons/${lesson.id}` : "#";
                link.setAttribute(
                    "aria-current",
                    String(activeLesson && lesson.id === activeLesson.id),
                );
                link.innerHTML = `
          <span>${completedLessons.has(lesson.id) ? "Done" : unlocked ? "Open" : "Locked"}</span>
          <strong>${lesson.title}</strong>
        `;
                block.appendChild(link);
            });
            group.appendChild(block);
        });

        tree.appendChild(group);
    });
}

function currentLessonIdFromUrl() {
    const parts = window.location.pathname.split("/");
    if (parts[1] === "lessons" && parts[2]) return parts[2];
    if (parts[1] === "lesson") return parts[2];
    return null;
}

function renderLessonMode() {
    const player = document.querySelector("#lesson-player");
    if (!player || !course) return;

    const requestedLesson = lessonById(currentLessonIdFromUrl());
    activeLesson =
        requestedLesson && isUnlocked(requestedLesson)
            ? requestedLesson
            : nextLesson();
    activeStepIndex = savedSteps[activeLesson.id] || 0;
    renderCourseTree();
    renderLessonStep();
}

function renderLessonStep() {
    const player = document.querySelector("#lesson-player");
    const step = activeLesson.steps[activeStepIndex];
    const stepNumber = activeStepIndex + 1;
    const stepPercent = Math.round(
        (stepNumber / activeLesson.steps.length) * 100,
    );

    setText("#lesson-objective", activeLesson.title);
    setText("#lesson-goal", activeLesson.coachIntro || activeLesson.summary);
    setText(
        "#lesson-progress-label",
        `Step ${stepNumber} of ${activeLesson.steps.length}`,
    );
    document.querySelector("#lesson-progress-fill").style.width =
        `${stepPercent}%`;

    player.innerHTML = `
    <div class="lesson-kicker">
      <span>${activeLesson.category.title}</span>
      <span>${activeLesson.skill.title}</span>
      <span>${activeLesson.difficulty}</span>
      <span>${activeLesson.timeMinutes || 5} min</span>
    </div>
    <div class="lesson-title-row">
      <div>
        <p class="eyebrow">Learning mode</p>
        <h1>${activeLesson.title}</h1>
      </div>
      <span class="completion-pill">${completedLessons.has(activeLesson.id) ? "Complete" : "Training"}</span>
    </div>
    <p class="coach-note">${activeLesson.coachIntro || activeLesson.summary}</p>
    <section class="lesson-focus-grid">
      <div class="board-area" id="board-area"></div>
      <div class="instruction-card" id="instruction-card"></div>
    </section>
    <div class="lesson-actions">
      <button class="button secondary" type="button" id="hint-button">Show Hint</button>
      <button class="button secondary" type="button" id="previous-step" ${activeStepIndex === 0 ? "disabled" : ""}>Back</button>
      <button class="button primary" type="button" id="next-step">Next Step</button>
    </div>
  `;

    renderStepContent(step);
    bindStepControls(step);
}

function renderStepContent(step) {
    const boardArea = document.querySelector("#board-area");
    const card = document.querySelector("#instruction-card");
    card.innerHTML = `
    <p class="eyebrow">Step ${activeStepIndex + 1}</p>
    <h2>${step.title}</h2>
    <p>${step.body}</p>
    <p class="result" id="step-feedback" role="status"></p>
  `;

    if (
        step.type === "rook-practice" ||
        step.type === "rook-challenge" ||
        step.highlights
    ) {
        boardArea.innerHTML =
            '<div class="modern-board" id="modern-board" aria-label="Interactive chessboard"></div>';
        renderReusableBoard(step);
    } else {
        boardArea.innerHTML =
            '<div class="modern-board" id="modern-board" aria-label="Chessboard"></div>';
        activeBoard = new PracticeBoard(
            document.querySelector("#modern-board"),
            {
                mode: "free",
                initialFen: startingFen,
                orientation: "white",
            },
        );
    }

    if (step.type === "checklist") {
        card.insertAdjacentHTML(
            "beforeend",
            `
      <ul class="exercise-checklist">
        ${step.tasks.map((task) => `<li>${task}</li>`).join("")}
      </ul>
    `,
        );
    }

    if (step.type === "move-validation") {
        card.insertAdjacentHTML(
            "beforeend",
            `
      <form class="move-form" id="lesson-move-form">
        <label for="lesson-move-input">Try a move</label>
        <div class="input-row">
          <input id="lesson-move-input" name="move" type="text" placeholder="${step.placeholder || "e2e4"}" required>
          <button class="button primary" type="submit">Validate</button>
        </div>
      </form>
    `,
        );
        document
            .querySelector("#lesson-move-form")
            .addEventListener("submit", (event) =>
                validateTypedMove(event, step),
            );
    }
}

function rookLegalSquares(fromSquare) {
    return files
        .flatMap((file) => `${file}${fromSquare[1]}`)
        .concat(
            [1, 2, 3, 4, 5, 6, 7, 8].map((rank) => `${fromSquare[0]}${rank}`),
        )
        .filter((square) => square !== fromSquare);
}

function renderReusableBoard(step) {
    const boardElement = document.querySelector("#modern-board");
    const startSquare = step.startSquare || "d4";
    const legalSquares =
        step.highlights ||
        (step.type === "rook-challenge"
            ? [step.targetSquare]
            : rookLegalSquares(startSquare));

    const allowedMoves = convertHighlightsToMoves(startSquare, legalSquares);

    activeBoard = new PracticeBoard(boardElement, {
        mode: "lesson",
        initialFen: step.fen || startingFen,
        orientation: "white",
        allowedMoves,
        lockToAllowedMoves: true,
        highlightLegalMoves: true,
        onMoveSuccess: ({ move, san, captured }) => {
            if (step.targetSquare && !moveReachesTarget(step, move)) {
                activeBoard.rejectMove(
                    move,
                    `Legal move, but the goal is ${step.targetSquare}.`,
                );
                return;
            }
            completeMoveInLesson(step);
        },
        onMoveError: ({ message }) => {
            showMoveError(message);
        },
    });
}

function convertHighlightsToMoves(fromSquare, toSquares) {
    return toSquares.map((toSquare) => `${fromSquare}${toSquare}`);
}

function moveReachesTarget(step, move) {
    if (!step.targetSquare) return true;
    const toSquare = move.substring(2, 4);
    return toSquare === step.targetSquare;
}

function completeMoveInLesson(step) {
    const feedback = document.querySelector("#step-feedback");
    const sideFeedback = document.querySelector("#side-feedback");

    feedback.textContent =
        step.successText || "Correct! Move made successfully.";
    sideFeedback.textContent = feedback.textContent;
    feedback.className = "result success";
    unlockNextStep();
}

function showMoveError(message) {
    const feedback = document.querySelector("#step-feedback");
    const sideFeedback = document.querySelector("#side-feedback");

    feedback.textContent = message;
    sideFeedback.textContent = message;
    feedback.className = "result error";
}

async function validateTypedMove(event, step) {
    event.preventDefault();
    const input = document.querySelector("#lesson-move-input");
    const feedback = document.querySelector("#step-feedback");
    feedback.textContent = "Checking move...";
    feedback.className = "result";

    try {
        const response = await fetch(step.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ move: input.value.trim() }),
        });
        const data = await response.json();
        feedback.textContent = data.san
            ? `${data.message} Chess notation: ${data.san}`
            : data.message;
        feedback.className = `result ${data.is_valid ? "success" : "error"}`;
        playSound(data.is_valid ? "success" : "illegal");
        if (data.is_valid) unlockNextStep();
    } catch (error) {
        feedback.textContent = "The coach cannot reach the backend right now.";
        feedback.className = "result error";
    }
}

function bindStepControls(step) {
    const previous = document.querySelector("#previous-step");
    const next = document.querySelector("#next-step");
    const hint = document.querySelector("#hint-button");
    const interactive = [
        "rook-practice",
        "rook-challenge",
        "move-validation",
    ].includes(step.type);
    next.disabled = interactive;
    if (activeStepIndex === activeLesson.steps.length - 1)
        next.textContent = "Complete Lesson";

    previous.addEventListener("click", () => {
        activeStepIndex = Math.max(0, activeStepIndex - 1);
        savedSteps[activeLesson.id] = activeStepIndex;
        saveProgress();
        renderLessonStep();
    });

    next.addEventListener("click", () => {
        if (activeStepIndex === activeLesson.steps.length - 1) {
            completedLessons.add(activeLesson.id);
            savedSteps[activeLesson.id] = 0;
            saveProgress();
            playSound("success");
            document.querySelector("#side-feedback").textContent =
                "Lesson complete. Your next lesson is unlocked.";
            updateProgressUI();
            renderCourseTree();
            return;
        }
        activeStepIndex += 1;
        savedSteps[activeLesson.id] = activeStepIndex;
        saveProgress();
        renderLessonStep();
    });

    hint.addEventListener("click", () => {
        const message = step.targetSquare
            ? `Aim for ${step.targetSquare}. Stay on the same file or rank.`
            : "Look for a straight rook line or follow the checklist one item at a time.";
        document.querySelector("#step-feedback").textContent = message;
        document.querySelector("#side-feedback").textContent = message;
    });
}

function unlockNextStep() {
    const next = document.querySelector("#next-step");
    if (next) next.disabled = false;
}

async function init() {
    PracticeBoard = window.PracticeBoard;

    const needsCourse =
        document.querySelector("#course-cards") ||
        document.querySelector("#course-detail") ||
        document.querySelector("#course-tree") ||
        document.querySelector("#home-roadmap");
    if (!needsCourse) return;

    const response = await fetch("/api/course");
    course = await response.json();
    renderRoadmap("#home-roadmap");
    renderRoadmap("#lesson-roadmap");
    updateProgressUI();
    renderCourseCards();
    renderCourseDetail();
    renderLessonMode();
}

init();
