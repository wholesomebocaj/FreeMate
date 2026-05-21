const form = document.querySelector("#move-form");
const moveInput = document.querySelector("#move-input");
const result = document.querySelector("#move-result");

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const move = moveInput.value.trim();
    result.textContent = "Checking move...";
    result.className = "result";

    try {
      const response = await fetch("/api/validate-move", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ move }),
      });

      const data = await response.json();
      result.textContent = data.san
        ? `${data.message} Chess notation: ${data.san}`
        : data.message;
      result.classList.add(data.is_valid ? "success" : "error");
    } catch (error) {
      result.textContent = "The move checker is unavailable. Make sure the server is running.";
      result.classList.add("error");
    }
  });
}

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const progressKey = "freemate.completedLessons";
let course = null;
let activeCategoryId = null;
let activeLessonId = null;
let completedLessons = loadCompletedLessons();

function squareName(fileIndex, rank) {
  return `${files[fileIndex]}${rank}`;
}

function loadCompletedLessons() {
  try {
    return new Set(JSON.parse(localStorage.getItem(progressKey)) || []);
  } catch (error) {
    return new Set();
  }
}

function saveCompletedLessons() {
  localStorage.setItem(progressKey, JSON.stringify([...completedLessons]));
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

function updateProgress() {
  const progressCount = document.querySelector("#progress-count");
  const progressFill = document.querySelector("#progress-fill");
  if (!progressCount || !progressFill) {
    return;
  }

  const lessons = getAllLessons();
  const completedCount = lessons.filter((lesson) => completedLessons.has(lesson.id)).length;
  const percent = lessons.length ? Math.round((completedCount / lessons.length) * 100) : 0;

  progressCount.textContent = `${completedCount} of ${lessons.length} lessons complete`;
  progressFill.style.width = `${percent}%`;
}

function renderCategoryTabs() {
  const categoryTabs = document.querySelector("#category-tabs");
  if (!categoryTabs || !course) {
    return;
  }

  categoryTabs.innerHTML = "";

  course.categories.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-tab";
    button.textContent = category.title;
    button.setAttribute("aria-pressed", String(category.id === activeCategoryId));
    button.addEventListener("click", () => {
      activeCategoryId = category.id;
      activeLessonId = null;
      renderCategoryTabs();
      renderLessons();
      renderEmptyExercise();
    });
    categoryTabs.appendChild(button);
  });
}

function renderLessons() {
  const lessonList = document.querySelector("#lesson-list");
  if (!lessonList || !course) {
    return;
  }

  const activeCategory = course.categories.find((category) => category.id === activeCategoryId);
  lessonList.innerHTML = "";

  activeCategory.skills.forEach((skill) => {
    const skillSection = document.createElement("section");
    skillSection.className = "skill-section";

    const skillTitle = document.createElement("h2");
    skillTitle.textContent = skill.title;

    const subskills = document.createElement("p");
    subskills.className = "subskill-list";
    subskills.textContent = `Subskills: ${skill.subskills.join(", ")}`;

    skillSection.append(skillTitle, subskills);

    skill.lessons.forEach((lesson) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "curriculum-card";
      card.setAttribute("aria-pressed", String(lesson.id === activeLessonId));
      card.innerHTML = `
        <span class="lesson-status">${completedLessons.has(lesson.id) ? "Complete" : "Start"}</span>
        <strong>${lesson.title}</strong>
        <span>${lesson.summary}</span>
        <span class="lesson-meta">${lesson.difficulty} · ${lesson.ratingRange}</span>
      `;
      card.addEventListener("click", () => {
        activeLessonId = lesson.id;
        renderLessons();
        renderExercise({ ...lesson, skill, category: activeCategory });
      });
      skillSection.appendChild(card);
    });

    lessonList.appendChild(skillSection);
  });
}

function renderEmptyExercise() {
  const exercisePanel = document.querySelector("#exercise-panel");
  if (!exercisePanel) {
    return;
  }

  exercisePanel.innerHTML = `
    <p class="eyebrow">Interactive exercise</p>
    <h2>Select a lesson</h2>
    <p>Choose a lesson card to see its skill focus, difficulty, rating range, and exercise.</p>
  `;
}

function renderExercise(lesson) {
  const exercisePanel = document.querySelector("#exercise-panel");
  if (!exercisePanel) {
    return;
  }

  const isComplete = completedLessons.has(lesson.id);
  exercisePanel.innerHTML = `
    <p class="eyebrow">${lesson.category.title} · ${lesson.skill.title}</p>
    <h2>${lesson.title}</h2>
    <p>${lesson.summary}</p>
    <div class="detail-row">
      <span>${lesson.difficulty}</span>
      <span>${lesson.ratingRange}</span>
    </div>
    <div class="exercise-body" id="exercise-body"></div>
    <button class="button primary" type="button" id="complete-lesson">
      ${isComplete ? "Mark incomplete" : "Mark complete"}
    </button>
  `;

  const completeButton = document.querySelector("#complete-lesson");
  completeButton.addEventListener("click", () => {
    if (completedLessons.has(lesson.id)) {
      completedLessons.delete(lesson.id);
    } else {
      completedLessons.add(lesson.id);
    }

    saveCompletedLessons();
    updateProgress();
    renderLessons();
    renderExercise(lesson);
  });

  if (lesson.exercise.type === "rook-movement") {
    renderRookExercise(lesson);
  } else if (lesson.exercise.type === "move-validation") {
    renderMoveValidationExercise(lesson);
  } else {
    renderChecklistExercise(lesson);
  }
}

function renderChecklistExercise(lesson) {
  const exerciseBody = document.querySelector("#exercise-body");
  exerciseBody.innerHTML = `
    <p>${lesson.exercise.prompt}</p>
    <ul class="exercise-checklist">
      ${lesson.exercise.tasks.map((task) => `<li>${task}</li>`).join("")}
    </ul>
  `;
}

function renderMoveValidationExercise(lesson) {
  const exerciseBody = document.querySelector("#exercise-body");
  exerciseBody.innerHTML = `
    <form class="move-form" id="lesson-move-form">
      <label for="lesson-move-input">${lesson.exercise.prompt}</label>
      <div class="input-row">
        <input id="lesson-move-input" name="move" type="text" placeholder="${lesson.exercise.placeholder}" required>
        <button class="button primary" type="submit">Validate</button>
      </div>
      <p class="result" id="lesson-move-result" role="status"></p>
    </form>
  `;

  const lessonForm = document.querySelector("#lesson-move-form");
  const lessonInput = document.querySelector("#lesson-move-input");
  const lessonResult = document.querySelector("#lesson-move-result");

  lessonForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    lessonResult.textContent = "Checking move...";
    lessonResult.className = "result";

    try {
      const response = await fetch(lesson.exercise.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ move: lessonInput.value.trim() }),
      });
      const data = await response.json();
      lessonResult.textContent = data.san
        ? `${data.message} Chess notation: ${data.san}`
        : data.message;
      lessonResult.classList.add(data.is_valid ? "success" : "error");
    } catch (error) {
      lessonResult.textContent = "The move checker is unavailable. Make sure the server is running.";
      lessonResult.classList.add("error");
    }
  });
}

function renderRookExercise(lesson) {
  const exerciseBody = document.querySelector("#exercise-body");
  let rookSquare = lesson.exercise.startSquare;

  exerciseBody.innerHTML = `
    <p>${lesson.exercise.prompt}</p>
    <button class="button secondary" type="button" id="reset-rook">Reset rook</button>
    <p class="result" id="rook-feedback" role="status">Rook starts on ${rookSquare}.</p>
    <div class="rook-board" id="rook-board" aria-label="Interactive rook movement board"></div>
  `;

  const rookBoard = document.querySelector("#rook-board");
  const rookFeedback = document.querySelector("#rook-feedback");
  const resetRookButton = document.querySelector("#reset-rook");

  function drawBoard() {
    rookBoard.innerHTML = "";

    for (let rank = 8; rank >= 1; rank -= 1) {
      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const square = squareName(fileIndex, rank);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "rook-square";
        button.dataset.square = square;
        button.setAttribute("aria-label", square);

        if ((rank + fileIndex) % 2 === 0) {
          button.classList.add("light");
        } else {
          button.classList.add("dark");
        }

        if (square === rookSquare) {
          button.classList.add("has-rook");
          button.textContent = "R";
          button.setAttribute("aria-label", `White rook on ${square}`);
        }

        rookBoard.appendChild(button);
      }
    }
  }

  async function tryRookMove(toSquare) {
    if (toSquare === rookSquare) {
      return;
    }

    rookFeedback.textContent = "Checking rook move...";
    rookFeedback.className = "result";

    try {
      const response = await fetch(lesson.exercise.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from_square: rookSquare,
          to_square: toSquare,
        }),
      });

      const data = await response.json();
      rookFeedback.textContent = data.message;
      rookFeedback.classList.add(data.is_correct ? "success" : "error");

      if (data.is_correct) {
        rookSquare = toSquare;
        drawBoard();
      }
    } catch (error) {
      rookFeedback.textContent = "The rook lesson is unavailable. Make sure the server is running.";
      rookFeedback.classList.add("error");
    }
  }

  rookBoard.addEventListener("click", (event) => {
    const square = event.target.closest(".rook-square");
    if (!square) {
      return;
    }

    tryRookMove(square.dataset.square);
  });

  resetRookButton.addEventListener("click", () => {
    rookSquare = lesson.exercise.startSquare;
    drawBoard();
    rookFeedback.textContent = `Rook starts on ${rookSquare}.`;
    rookFeedback.className = "result";
  });

  drawBoard();
}

async function loadCourse() {
  const lessonList = document.querySelector("#lesson-list");
  if (!lessonList) {
    return;
  }

  try {
    const response = await fetch("/api/course");
    course = await response.json();
    activeCategoryId = course.categories[0].id;
    document.querySelector("#course-title").textContent = course.title;
    renderCategoryTabs();
    renderLessons();
    updateProgress();
  } catch (error) {
    lessonList.innerHTML = "<p>Course data could not be loaded. Make sure the server is running.</p>";
  }
}

loadCourse();
