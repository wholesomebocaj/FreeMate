const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const progressKey = "freemate.completedLessons";
const stepKey = "freemate.lessonSteps";

let course = null;
let activeLessonId = null;
let activeStepIndex = 0;
let completedLessons = loadSet(progressKey);
let savedSteps = loadObject(stepKey);
let currentRookSquare = "d4";

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

function squareName(fileIndex, rank) {
  return `${files[fileIndex]}${rank}`;
}

function getAllLessons() {
  if (!course) {
    return [];
  }

  return course.categories.flatMap((category) =>
    category.skills.flatMap((skill) =>
      skill.lessons.map((lesson) => ({
        ...lesson,
        category,
        skill,
      }))
    )
  );
}

function getLessonById(lessonId) {
  return getAllLessons().find((lesson) => lesson.id === lessonId);
}

function getLessonIndex(lessonId) {
  return getAllLessons().findIndex((lesson) => lesson.id === lessonId);
}

function isLessonUnlocked(lessonId) {
  const index = getLessonIndex(lessonId);
  if (index <= 0) {
    return true;
  }

  const lesson = getLessonById(lessonId);
  if (lesson.locked && !completedLessons.has(getAllLessons()[index - 1].id)) {
    return false;
  }

  return completedLessons.has(getAllLessons()[index - 1].id) || !lesson.locked;
}

function nextAvailableLesson() {
  return getAllLessons().find((lesson) => !completedLessons.has(lesson.id) && isLessonUnlocked(lesson.id))
    || getAllLessons()[0];
}

function updateGlobalProgress() {
  const lessons = getAllLessons();
  const completeCount = lessons.filter((lesson) => completedLessons.has(lesson.id)).length;
  const percent = lessons.length ? Math.round((completeCount / lessons.length) * 100) : 0;

  setText("#progress-count", `${completeCount} of ${lessons.length} complete`);
  setText("#completed-number", completeCount);
  setText("#course-percent", `${percent}%`);

  document.querySelectorAll("#progress-fill").forEach((fill) => {
    fill.style.width = `${percent}%`;
  });

  const current = getLessonById(activeLessonId) || nextAvailableLesson();
  if (current) {
    setText("#current-focus", current.skill.title);
    const next = getAllLessons().find((lesson) => !completedLessons.has(lesson.id) && lesson.id !== current.id);
    setText("#next-lesson", next ? `Next: ${next.title}` : "Course complete. Beautiful work.");
  }
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = value;
  }
}

function lessonStateLabel(lesson) {
  if (completedLessons.has(lesson.id)) {
    return "Done";
  }

  return isLessonUnlocked(lesson.id) ? "Open" : "Locked";
}

function renderRoadmap(targetSelector) {
  const target = document.querySelector(targetSelector);
  if (!target || !course) {
    return;
  }

  target.innerHTML = "";
  course.categories.forEach((category) => {
    const lessons = category.skills.flatMap((skill) => skill.lessons);
    const complete = lessons.every((lesson) => completedLessons.has(lesson.id));
    const unlocked = lessons.some((lesson) => isLessonUnlocked(lesson.id));
    const item = document.createElement("div");
    item.className = `roadmap-item ${complete ? "complete" : unlocked ? "current" : "locked"}`;
    item.textContent = category.title;
    target.appendChild(item);
  });
}

function renderCourseTree() {
  const tree = document.querySelector("#course-tree");
  if (!tree || !course) {
    return;
  }

  tree.innerHTML = "";

  course.categories.forEach((category) => {
    const group = document.createElement("section");
    group.className = "tree-category";
    group.innerHTML = `<h3>${category.title}</h3>`;

    category.skills.forEach((skill) => {
      const skillBlock = document.createElement("div");
      skillBlock.className = "tree-skill";
      skillBlock.innerHTML = `<p>${skill.title}</p>`;

      skill.lessons.forEach((lesson) => {
        const unlocked = isLessonUnlocked(lesson.id);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tree-lesson";
        button.disabled = !unlocked;
        button.setAttribute("aria-current", String(lesson.id === activeLessonId));
        button.innerHTML = `
          <span>${lessonStateLabel(lesson)}</span>
          <strong>${lesson.title}</strong>
        `;
        button.addEventListener("click", () => openLesson(lesson.id));
        skillBlock.appendChild(button);
      });

      group.appendChild(skillBlock);
    });

    tree.appendChild(group);
  });
}

function openLesson(lessonId) {
  if (!isLessonUnlocked(lessonId)) {
    return;
  }

  activeLessonId = lessonId;
  activeStepIndex = savedSteps[lessonId] || 0;
  renderCourseTree();
  renderLessonPlayer();
  updateGlobalProgress();
  renderRoadmap("#lesson-roadmap");
}

function renderLessonPlayer() {
  const player = document.querySelector("#lesson-player");
  const lesson = getLessonById(activeLessonId);
  if (!player || !lesson) {
    return;
  }

  const steps = lesson.steps || [];
  const step = steps[activeStepIndex] || steps[0];
  const stepNumber = activeStepIndex + 1;
  const percent = steps.length ? Math.round((stepNumber / steps.length) * 100) : 0;

  player.innerHTML = `
    <div class="lesson-kicker">
      <span>${lesson.category.title}</span>
      <span>${lesson.difficulty}</span>
      <span>${lesson.ratingRange}</span>
      <span>${lesson.timeMinutes || 5} min</span>
    </div>
    <div class="lesson-title-row">
      <div>
        <p class="eyebrow">${lesson.skill.title}</p>
        <h2>${lesson.title}</h2>
      </div>
      <span class="completion-pill">${completedLessons.has(lesson.id) ? "Complete" : "In progress"}</span>
    </div>
    <p class="coach-note">${lesson.coachIntro || lesson.summary}</p>
    <div class="step-progress">
      <span>Step ${stepNumber} of ${steps.length}</span>
      <div class="progress-track"><div class="progress-fill" style="width: ${percent}%"></div></div>
    </div>
    <section class="lesson-step" id="lesson-step"></section>
    <div class="lesson-actions">
      <button class="button secondary" type="button" id="hint-button">Show Hint</button>
      <button class="button secondary" type="button" id="previous-step" ${activeStepIndex === 0 ? "disabled" : ""}>Back</button>
      <button class="button primary" type="button" id="next-step">${activeStepIndex === steps.length - 1 ? "Complete Lesson" : "Next Step"}</button>
    </div>
    <p class="result" id="step-feedback" role="status"></p>
  `;

  renderStep(step, lesson);
  bindLessonActions(lesson);
}

function renderStep(step, lesson) {
  const container = document.querySelector("#lesson-step");
  if (!container) {
    return;
  }

  if (step.type === "rook-practice" || step.type === "rook-challenge") {
    renderRookStep(container, step, lesson);
    return;
  }

  if (step.type === "move-validation") {
    renderMoveValidationStep(container, step);
    return;
  }

  if (step.type === "checklist") {
    container.innerHTML = `
      <div class="teaching-card">
        <h3>${step.title}</h3>
        <p>${step.body}</p>
        <ul class="exercise-checklist">
          ${step.tasks.map((task) => `<li>${task}</li>`).join("")}
        </ul>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="teaching-card">
      <h3>${step.title}</h3>
      <p>${step.body}</p>
      ${step.highlights ? `<div class="mini-board-wrap">${renderStaticBoard("d4", step.highlights)}</div>` : ""}
    </div>
  `;
}

function renderStaticBoard(pieceSquare, highlights = []) {
  let html = '<div class="lesson-board is-static">';
  for (let rank = 8; rank >= 1; rank -= 1) {
    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const square = squareName(fileIndex, rank);
      const classes = [
        "rook-square",
        (rank + fileIndex) % 2 === 0 ? "light" : "dark",
        highlights.includes(square) ? "highlighted" : "",
        square === pieceSquare ? "has-rook" : "",
      ].join(" ");
      html += `<div class="${classes}" aria-label="${square}">${square === pieceSquare ? "R" : ""}</div>`;
    }
  }
  html += "</div>";
  return html;
}

function renderRookStep(container, step) {
  currentRookSquare = step.startSquare || "d4";
  container.innerHTML = `
    <div class="board-lesson-layout">
      <div class="teaching-card">
        <h3>${step.title}</h3>
        <p>${step.body}</p>
        <p class="hint-text">Hint: rooks move in straight lines across ranks and files.</p>
        <button class="button secondary" type="button" id="reset-rook">Reset</button>
        <p class="result" id="rook-feedback" role="status"></p>
      </div>
      <div class="lesson-board" id="rook-board" aria-label="Interactive rook movement board"></div>
    </div>
  `;

  drawInteractiveBoard(step);
  document.querySelector("#reset-rook").addEventListener("click", () => {
    currentRookSquare = step.startSquare || "d4";
    setText("#rook-feedback", "");
    drawInteractiveBoard(step);
  });
}

function drawInteractiveBoard(step) {
  const board = document.querySelector("#rook-board");
  if (!board) {
    return;
  }

  const pieces = step.pieces || [];
  const highlights = step.type === "rook-practice"
    ? ["d1", "d2", "d3", "d5", "d6", "d7", "d8", "a4", "b4", "c4", "e4", "f4", "g4", "h4"]
    : [step.targetSquare];

  board.innerHTML = "";
  for (let rank = 8; rank >= 1; rank -= 1) {
    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const square = squareName(fileIndex, rank);
      const extraPiece = pieces.find((piece) => piece.square === square);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rook-square";
      button.dataset.square = square;
      button.setAttribute("aria-label", square);
      button.classList.add((rank + fileIndex) % 2 === 0 ? "light" : "dark");

      if (highlights.includes(square)) {
        button.classList.add("highlighted");
      }

      if (square === currentRookSquare) {
        button.classList.add("has-rook");
        button.textContent = "R";
        button.setAttribute("aria-label", `White rook on ${square}`);
      } else if (extraPiece) {
        button.classList.add("target-piece");
        button.textContent = extraPiece.piece;
      }

      button.addEventListener("click", () => tryRookMove(step, square));
      board.appendChild(button);
    }
  }
}

async function tryRookMove(step, toSquare) {
  const feedback = document.querySelector("#rook-feedback");
  if (!feedback || toSquare === currentRookSquare) {
    return;
  }

  feedback.textContent = "Checking with the coach...";
  feedback.className = "result";

  try {
    const response = await fetch("/api/rook-move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from_square: currentRookSquare,
        to_square: toSquare,
      }),
    });
    const data = await response.json();

    if (!data.is_correct) {
      feedback.textContent = data.message;
      feedback.classList.add("error");
      return;
    }

    if (step.targetSquare && toSquare !== step.targetSquare) {
      feedback.textContent = `That is legal, but the challenge is to move to ${step.targetSquare}.`;
      feedback.classList.add("error");
      return;
    }

    currentRookSquare = toSquare;
    feedback.textContent = step.successText || data.message;
    feedback.classList.add("success");
    drawInteractiveBoard(step);
    unlockNextButton();
  } catch (error) {
    feedback.textContent = "The coach cannot reach the backend right now.";
    feedback.classList.add("error");
  }
}

function renderMoveValidationStep(container, step) {
  container.innerHTML = `
    <div class="teaching-card">
      <h3>${step.title}</h3>
      <p>${step.body}</p>
      <form class="move-form" id="lesson-move-form">
        <label for="lesson-move-input">Your move</label>
        <div class="input-row">
          <input id="lesson-move-input" name="move" type="text" placeholder="${step.placeholder || "e2e4"}" required>
          <button class="button primary" type="submit">Validate</button>
        </div>
        <p class="result" id="lesson-move-result" role="status"></p>
      </form>
    </div>
  `;

  const form = document.querySelector("#lesson-move-form");
  const input = document.querySelector("#lesson-move-input");
  const result = document.querySelector("#lesson-move-result");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    result.textContent = "Checking move...";
    result.className = "result";

    try {
      const response = await fetch(step.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ move: input.value.trim() }),
      });
      const data = await response.json();
      result.textContent = data.san ? `${data.message} Chess notation: ${data.san}` : data.message;
      result.classList.add(data.is_valid ? "success" : "error");
      if (data.is_valid) {
        unlockNextButton();
      }
    } catch (error) {
      result.textContent = "The coach cannot reach the backend right now.";
      result.classList.add("error");
    }
  });
}

function bindLessonActions(lesson) {
  const steps = lesson.steps || [];
  const currentStep = steps[activeStepIndex];
  const nextButton = document.querySelector("#next-step");

  if (["rook-practice", "rook-challenge", "move-validation"].includes(currentStep.type)) {
    nextButton.disabled = true;
  }

  document.querySelector("#previous-step").addEventListener("click", () => {
    activeStepIndex = Math.max(0, activeStepIndex - 1);
    savedSteps[lesson.id] = activeStepIndex;
    saveProgress();
    renderLessonPlayer();
  });

  nextButton.addEventListener("click", () => {
    if (activeStepIndex >= steps.length - 1) {
      completeLesson(lesson.id);
      return;
    }

    activeStepIndex += 1;
    savedSteps[lesson.id] = activeStepIndex;
    saveProgress();
    renderLessonPlayer();
  });

  document.querySelector("#hint-button").addEventListener("click", () => {
    const feedback = document.querySelector("#step-feedback");
    feedback.textContent = hintForStep(currentStep);
    feedback.className = "result success";
  });
}

function unlockNextButton() {
  const nextButton = document.querySelector("#next-step");
  if (nextButton) {
    nextButton.disabled = false;
  }
}

function hintForStep(step) {
  if (step.type === "rook-challenge") {
    return `The pawn is on ${step.targetSquare}. Stay on the same file as the rook.`;
  }

  if (step.type === "rook-practice") {
    return "Try any square on the same row or column as the rook.";
  }

  if (step.type === "move-validation") {
    return "Try e2e4 or g1f3. Both are legal first moves.";
  }

  return "Read the coach note, then move forward when the idea feels clear.";
}

function completeLesson(lessonId) {
  completedLessons.add(lessonId);
  savedSteps[lessonId] = 0;
  saveProgress();
  updateGlobalProgress();
  renderCourseTree();
  renderRoadmap("#lesson-roadmap");

  const next = nextAvailableLesson();
  const feedback = document.querySelector("#step-feedback");
  if (feedback) {
    feedback.textContent = next && next.id !== lessonId
      ? `Lesson complete. Next up: ${next.title}.`
      : "Lesson complete. You finished the current path.";
    feedback.className = "result success";
  }
}

async function loadCourse() {
  const needsCourse = document.querySelector("#course-tree") || document.querySelector("#home-roadmap");
  if (!needsCourse) {
    return;
  }

  try {
    const response = await fetch("/api/course");
    course = await response.json();
    setText("#course-title", course.title);
    setText("#course-description", course.description);
    activeLessonId = (nextAvailableLesson() || getAllLessons()[0]).id;
    renderRoadmap("#home-roadmap");
    renderRoadmap("#lesson-roadmap");
    renderCourseTree();
    updateGlobalProgress();
    renderLessonPlayer();
  } catch (error) {
    const player = document.querySelector("#lesson-player");
    if (player) {
      player.innerHTML = "<h2>Course data could not be loaded.</h2><p>Make sure the FastAPI server is running.</p>";
    }
  }
}

loadCourse();
