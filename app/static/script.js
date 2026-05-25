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
let brackets = null;
let completedLessons = loadSet(progressKey);
let savedSteps = loadObject(stepKey, "freemate.savedSteps");
let activeLesson = null;
let activeStepIndex = 0;
let activeBoard = null;
let audioContext = null;
let progressSyncModulePromise = null;
let progressSaveTimer = null;
let courseLibraryState = {
  query: "",
  bracket: "all",
  topic: "all",
  color: "all",
  type: "all",
  status: "all",
  sort: "recommended",
};

function loadSet(key) {
  try {
    return new Set(JSON.parse(localStorage.getItem(key)) || []);
  } catch (error) {
    return new Set();
  }
}

function loadObject(key, fallbackKey = null) {
  const merged = {};
  [fallbackKey, key]
    .filter(Boolean)
    .forEach((sourceKey) => {
      try {
        Object.assign(merged, JSON.parse(localStorage.getItem(sourceKey)) || {});
      } catch (error) {
        // Ignore malformed storage and keep the other source.
      }
    });

  try {
    return merged;
  } catch (error) {
    return {};
  }
}

function saveProgress() {
  localStorage.setItem(progressKey, JSON.stringify([...completedLessons]));
  localStorage.setItem(stepKey, JSON.stringify(savedSteps));
  localStorage.setItem("freemate.savedSteps", JSON.stringify(savedSteps));
  scheduleRemoteProgressSave();
}

function loadProgressSyncModule() {
  if (!progressSyncModulePromise) {
    progressSyncModulePromise = import("/static/components/progress-sync.js");
  }

  return progressSyncModulePromise;
}

function scheduleRemoteProgressSave() {
  if (!activeLesson) return;

  window.clearTimeout(progressSaveTimer);
  progressSaveTimer = window.setTimeout(() => {
    void flushRemoteProgressSave();
  }, 250);
}

async function flushRemoteProgressSave() {
  if (!activeLesson) return;

  try {
    const progressSync = await loadProgressSyncModule();
    const activeCourse = activeLesson.course || null;
    const lessonCount = activeCourse ? courseLessons(activeCourse).length : allLessons().length;
    const completedCount = activeCourse
      ? courseLessons(activeCourse).filter((lesson) => completedLessons.has(lesson.id)).length
      : allLessons().filter((lesson) => completedLessons.has(lesson.id)).length;
    const percent = lessonCount ? Math.round((completedCount / lessonCount) * 100) : 0;
    await progressSync.saveLessonProgress({
      lesson_id: activeLesson.id,
      status: completedLessons.has(activeLesson.id) ? "mastered" : "learning",
      completed: completedLessons.has(activeLesson.id),
      mastery_score: Math.max(
        percent,
        activeStepIndex > 0 ? Math.round((activeStepIndex / Math.max(activeLesson.steps.length, 1)) * 100) : 0,
      ),
      last_step_index: savedSteps[activeLesson.id] || 0,
    });
    if (activeCourse) {
      await progressSync.saveCourseProgress({
        course_id: activeCourse.id,
        completed_lessons: completedCount,
        completion_percent: percent,
      });
    }
  } catch (error) {
    // Keep localStorage as the fallback if remote sync is unavailable.
  }
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
  gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function allLessons() {
  return allCourses().flatMap((courseItem) => courseLessons(courseItem));
}

function allBrackets() {
  return Array.isArray(brackets) ? brackets : [];
}

function allCourses() {
  return Array.isArray(course) ? course : course ? [course] : [];
}

function lessonById(id) {
  return allLessons().find((lesson) => lesson.id === id);
}

function lessonIndex(id) {
  return allLessons().findIndex((lesson) => lesson.id === id);
}

function bracketById(id) {
  return allBrackets().find((bracket) => bracket.id === id || bracket.slug === id);
}

function bracketLessonIds(bracket) {
  return [...new Set((bracket?.items || []).flatMap((item) => itemLessonIds(item)))];
}

function bracketItemProgress(item) {
  const lessonIds = [...new Set(itemLessonIds(item))];
  if (!lessonIds.length) return 0;
  const done = lessonIds.filter((lessonId) => completedLessons.has(lessonId)).length;
  return Math.round((done / lessonIds.length) * 100);
}

function itemLessonIds(item) {
  if (item?.lessonIds?.length) return item.lessonIds;
  if (!item?.courseId) return [];
  return courseLessons(courseById(item.courseId)).map((lesson) => lesson.id);
}

function bracketProgress(bracket) {
  const lessonIds = bracketLessonIds(bracket);
  if (!lessonIds.length) return 0;
  const done = lessonIds.filter((lessonId) => completedLessons.has(lessonId)).length;
  return Math.round((done / lessonIds.length) * 100);
}

function nextBracket() {
  return allBrackets().find((bracket) => bracketProgress(bracket) < 100) || allBrackets()[0];
}

function nextBracketItem(bracket) {
  if (!bracket) return null;
  return (bracket.items || []).find((item) => bracketItemProgress(item) < 100) || bracket.items?.[0] || null;
}

function currentBracketSlugFromUrl() {
  const parts = window.location.pathname.split("/");
  if (parts[1] === "lessons" && parts[2] && !lessonById(parts[2])) {
    return parts[2];
  }
  return null;
}

function availableCourses() {
  return allCourses();
}

function courseById(id) {
  return availableCourses().find((courseItem) => courseItem.id === id) || availableCourses()[0];
}

function currentCourseIdFromUrl() {
  const parts = window.location.pathname.split("/");
  if (parts[1] === "courses" || parts[1] === "course") return parts[2];
  return "beginner-fundamentals";
}

function courseLessons(courseItem) {
  return (courseItem?.categories || []).flatMap((category) =>
    (category.skills || []).flatMap((skill) =>
      (skill.lessons || []).map((lesson) => ({ ...lesson, category, skill, course: courseItem }))
    )
  );
}

function coursePercent(courseItem) {
  const lessons = courseLessons(courseItem);
  if (!lessons.length) return 0;
  return Math.round((lessons.filter((lesson) => completedLessons.has(lesson.id)).length / lessons.length) * 100);
}

function courseLibraryMeta(courseItem) {
  const lessons = courseLessons(courseItem);
  const bracket = allBrackets().find((entry) => {
    return (entry.items || []).some((item) => item.courseId === courseItem.id || item.id === courseItem.id);
  }) || null;
  const progress = coursePercent(courseItem);
  const completed = lessons.filter((lesson) => completedLessons.has(lesson.id)).length;
  const status = progress >= 100 ? "completed" : completed > 0 ? "in-progress" : "not-started";
  const topic = inferCourseTopic(courseItem);
  const color = inferCourseColor(courseItem);
  const type = inferCourseType(courseItem);
  const estimatedMinutes = lessons.reduce((total, lesson) => total + (lesson.timeMinutes || 5), 0);

  return {
    course: courseItem,
    bracket,
    bracketLabel: bracket?.title || courseItem.difficulty || "Course",
    bracketRange: bracket?.range || courseItem.difficulty || "Course",
    topic,
    color,
    type,
    status,
    statusLabel: status === "completed" ? "Completed" : status === "in-progress" ? "In progress" : "Not started",
    progress,
    lessonCount: lessons.length,
    estimatedMinutes,
    nextLesson: nextLessonInCourse(courseItem),
  };
}

function inferCourseTopic(courseItem) {
  const text = `${courseItem?.title || ""} ${courseItem?.description || ""} ${courseItem?.id || ""}`.toLowerCase();
  if (/(endgame|opposition|promotion|rook endgame|king and pawn|pawn endgame)/.test(text)) return "Endgame";
  if (/(checkmate|mate|fork|pin|skewer|tactics|blunder)/.test(text)) return "Tactics";
  if (/(opening|defense|gambit|repertoire|english|italian|london|scandinavian|caro|french|sicilian|pirc|modern|nimzo|slav|vienna|scotch|queen.?s gambit|queens gambit)/.test(text)) return "Openings";
  if (/(strategy|planning|positional|pawn structure|candidate move|practical|checks|captures|threats|before you move)/.test(text)) return "Strategy";
  return "Fundamentals";
}

function inferCourseColor(courseItem) {
  const text = `${courseItem?.title || ""} ${courseItem?.description || ""} ${courseItem?.id || ""}`.toLowerCase();
  if (/(defense|scandinavian|caro|sicilian|french|pirc|modern|nimzo|slav|king'?s indian|kings indian)/.test(text)) return "Black";
  if (/(italian|london|queen.?s gambit|queens gambit|english|vienna|scotch|four knights|queen.?s pawn opening|queens pawn opening)/.test(text)) return "White";
  return "Both";
}

function inferCourseType(courseItem) {
  const topic = inferCourseTopic(courseItem);
  const text = `${courseItem?.title || ""} ${courseItem?.description || ""} ${courseItem?.id || ""}`.toLowerCase();
  if (topic === "Openings") return "Opening course";
  if (/blunder/.test(text)) return "Quiz";
  if (/checkmate|mate|fork|pin|skewer|tactic/.test(text)) return "Drill";
  if (/practice/.test(text)) return "Practice";
  return "Interactive lesson";
}

function courseLibrarySortValue(meta) {
  const bracketIndex = allBrackets().findIndex((entry) => entry.id === meta.bracket?.id || entry.slug === meta.bracket?.slug || entry.title === meta.bracketLabel);
  const difficultyOrder = {
    Beginner: 0,
    "Beginner+": 1,
    Novice: 2,
    Intermediate: 3,
    "Advanced Beginner": 4,
    Advanced: 5,
  };
  return {
    recommended: [meta.status === "in-progress" ? 0 : meta.status === "not-started" ? 1 : 2, bracketIndex < 0 ? 99 : bracketIndex, meta.course.order || 99, meta.course.title.toLowerCase()],
    progress: [-meta.progress, bracketIndex < 0 ? 99 : bracketIndex, meta.course.order || 99, meta.course.title.toLowerCase()],
    title: [meta.course.title.toLowerCase()],
    level: [difficultyOrder[meta.course.difficulty] ?? 99, meta.progress, meta.course.title.toLowerCase()],
    time: [-meta.estimatedMinutes, meta.progress, meta.course.title.toLowerCase()],
  };
}

function courseLibraryMatchesFilter(meta) {
  const query = courseLibraryState.query.trim().toLowerCase();
  if (query) {
    const haystack = [
      meta.course.title,
      meta.course.description,
      meta.course.id,
      meta.bracketLabel,
      meta.bracketRange,
      meta.topic,
      meta.color,
      meta.type,
      meta.statusLabel,
      ...(meta.course.categories || []).map((category) => category.title),
    ].join(" ").toLowerCase();
    if (!haystack.includes(query)) return false;
  }

  if (courseLibraryState.bracket !== "all" && meta.bracket?.id !== courseLibraryState.bracket && meta.bracket?.slug !== courseLibraryState.bracket) return false;
  if (courseLibraryState.topic !== "all" && meta.topic.toLowerCase() !== courseLibraryState.topic) return false;
  if (courseLibraryState.color !== "all" && meta.color.toLowerCase() !== courseLibraryState.color) return false;
  if (courseLibraryState.type !== "all" && meta.type.toLowerCase() !== courseLibraryState.type) return false;
  if (courseLibraryState.status !== "all" && meta.status !== courseLibraryState.status) return false;
  return true;
}

function prettyCourseTag(value) {
  if (!value) return "";
  return String(value)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function nextLessonInCourse(courseItem) {
  const lessons = courseLessons(courseItem);
  return lessons.find((lesson) => !completedLessons.has(lesson.id) && isUnlocked(lesson)) || lessons[0];
}

function isUnlocked(lesson) {
  const index = lessonIndex(lesson.id);
  if (index <= 0) return true;
  const previous = allLessons()[index - 1];
  return !lesson.locked || completedLessons.has(previous.id);
}

function nextLesson() {
  return allLessons().find((lesson) => !completedLessons.has(lesson.id) && isUnlocked(lesson))
    || allLessons()[0];
}

function progressPercent() {
  const lessons = allLessons();
  if (!lessons.length) return 0;
  return Math.round((lessons.filter((lesson) => completedLessons.has(lesson.id)).length / lessons.length) * 100);
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

class ChessBoard {
  constructor(element, options = {}) {
    this.element = element;
    this.orientation = options.orientation || "white";
    this.fen = options.fen || startingFen;
    this.position = parseFen(this.fen);
    this.selectedSquare = null;
    this.legalSquares = options.legalSquares || [];
    this.instructionalSquares = options.legalSquares || [];
    this.lastMove = [];
    this.draggedSquare = null;
    this.targetSquare = options.targetSquare || null;
    this.onMove = options.onMove || (() => {});
    this.render();
  }

  setLegalSquares(squares) {
    this.legalSquares = squares;
    this.render();
  }

  pieceAt(square) {
    return this.position[square];
  }

  render() {
    this.element.innerHTML = "";
    this.element.className = "modern-board";

    const ranks = this.orientation === "white" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
    const boardFiles = this.orientation === "white" ? files : [...files].reverse();

    ranks.forEach((rank) => {
      boardFiles.forEach((file, fileIndex) => {
        const square = `${file}${rank}`;
        const piece = this.pieceAt(square);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "board-square";
        button.dataset.square = square;
        button.setAttribute("aria-label", square);
        button.classList.add((rank + files.indexOf(file)) % 2 === 0 ? "light" : "dark");
        if (this.legalSquares.includes(square)) button.classList.add("legal");
        if (this.selectedSquare === square) button.classList.add("selected");
        if (this.lastMove.includes(square)) button.classList.add("last-move");
        if (this.targetSquare === square) button.classList.add("target-square");

        if (piece) {
          const image = document.createElement("img");
          image.className = "piece-img";
          image.src = pieceAssets[piece];
          image.alt = pieceName(piece);
          image.draggable = true;
          image.addEventListener("dragstart", () => {
            this.draggedSquare = square;
            this.select(square);
          });
          button.appendChild(image);
        }

        button.addEventListener("click", () => this.handleClick(square));
        button.addEventListener("dragover", (event) => event.preventDefault());
        button.addEventListener("drop", (event) => {
          event.preventDefault();
          this.tryMove(this.draggedSquare, square);
        });
        this.element.appendChild(button);
      });
    });
  }

  async select(square) {
    if (!this.pieceAt(square)) return;
    this.selectedSquare = square;
    await this.loadLegalSquares(square);
    this.render();
  }

  handleClick(square) {
    if (this.pieceAt(square)) {
      this.select(square);
      return;
    }

    if (this.selectedSquare) {
      this.tryMove(this.selectedSquare, square);
    }
  }

  async loadLegalSquares(square) {
    try {
      const response = await fetch("/api/legal-moves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: this.fen, from_square: square }),
      });
      const data = await response.json();
      this.legalSquares = data.legal_squares || [];
    } catch (error) {
      this.legalSquares = this.instructionalSquares;
    }
  }

  async tryMove(fromSquare, toSquare) {
    if (!fromSquare || !toSquare || fromSquare === toSquare) return;
    await this.onMove({ board: this, fromSquare, toSquare, move: `${fromSquare}${toSquare}` });
  }

  applyMove(fromSquare, toSquare) {
    const movingPiece = this.position[fromSquare];
    delete this.position[fromSquare];
    this.position[toSquare] = movingPiece;
    this.selectedSquare = null;
    this.legalSquares = [];
    this.lastMove = [fromSquare, toSquare];
    this.fen = positionToFen(this.position);
    this.render();
  }

  clearSelection() {
    this.selectedSquare = null;
    this.render();
  }
}

function parseFen(fen) {
  const placement = fen.split(" ")[0];
  const position = {};
  const ranks = placement.split("/");
  ranks.forEach((rankText, rankIndex) => {
    let fileIndex = 0;
    const rank = 8 - rankIndex;
    [...rankText].forEach((char) => {
      if (Number.isInteger(Number(char)) && char !== "0") {
        fileIndex += Number(char);
        return;
      }
      const color = char === char.toUpperCase() ? "w" : "b";
      position[`${files[fileIndex]}${rank}`] = `${color}${char.toUpperCase()}`;
      fileIndex += 1;
    });
  });
  return position;
}

function positionToFen(position) {
  const ranks = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    let row = "";
    let empty = 0;
    files.forEach((file) => {
      const piece = position[`${file}${rank}`];
      if (!piece) {
        empty += 1;
        return;
      }
      if (empty) {
        row += empty;
        empty = 0;
      }
      const pieceLetter = piece[1];
      row += piece[0] === "w" ? pieceLetter : pieceLetter.toLowerCase();
    });
    if (empty) row += empty;
    ranks.push(row);
  }
  return `${ranks.join("/")} w - - 0 1`;
}

function pieceName(pieceCode) {
  const color = pieceCode[0] === "w" ? "White" : "Black";
  const names = { K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight", P: "pawn" };
  return `${color} ${names[pieceCode[1]]}`;
}

function updateProgressUI() {
  const lessons = allLessons();
  const completeCount = lessons.filter((lesson) => completedLessons.has(lesson.id)).length;
  const percent = progressPercent();
  setText("#progress-count", `${completeCount} of ${lessons.length} complete`);
  setText("#completed-number", completeCount);
  setText("#course-percent", `${percent}%`);
  document.querySelectorAll(".progress-fill").forEach((fill) => {
    if (fill.id !== "lesson-progress-fill") fill.style.width = `${percent}%`;
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
    : { categories: allCourses().flatMap((courseItem) => courseItem.categories || []) };

  currentCourse.categories.forEach((category) => {
    const lessons = category.skills.flatMap((skill) => skill.lessons);
    const complete = lessons.every((lesson) => completedLessons.has(lesson.id));
    const unlocked = lessons.some((lesson) => isUnlocked(lessonById(lesson.id)));
    const item = document.createElement("div");
    item.className = `roadmap-item ${complete ? "complete" : unlocked ? "current" : "locked"}`;
    item.textContent = category.title;
    target.appendChild(item);
  });
}

function renderCourseCards() {
  const browser = document.querySelector("#course-cards");
  if (!browser || !course) return;

  const beginnerCourse = courseById("beginner-fundamentals");
  const next = nextLesson();
  if (next) {
    document.querySelector("#continue-card-button").href = `/courses/beginner-fundamentals`;
    setText("#continue-title", next.title);
    setText("#continue-description", `${next.category.title} · ${next.skill.title} · ${next.timeMinutes || 5} min`);
  }

  browser.innerHTML = "";
  availableCourses().forEach((courseItem) => {
    const lessons = courseLessons(courseItem);
    const percent = coursePercent(courseItem);
    const lessonLabel = lessons.length === 1 ? "1 lesson" : `${lessons.length} lessons`;
    const buttonText = percent > 0 ? "Continue" : courseItem.source === "planned" ? "Preview" : "Start";
    const coverText = courseItem.title
      .split(" ")
      .map((word) => word[0])
      .join("")
      .slice(0, 3)
      .toUpperCase();
    const card = document.createElement("article");
    card.className = `course-card ${courseItem.source === "planned" ? "is-planned" : ""}`;
    card.innerHTML = `
      <div class="course-card-thumb" aria-hidden="true">
        <span>${coverText}</span>
      </div>
      <div class="course-card-main">
        <span class="lesson-state">${courseItem.difficulty}</span>
        <div>
          <h2>${courseItem.title}</h2>
          <p>${courseItem.description}</p>
        </div>
      </div>
      <div class="course-card-side">
        <div class="course-card-meta">
          <span>${lessonLabel}</span>
          <span>${percent}% complete</span>
        </div>
        <div class="lesson-row-progress compact">
          <div class="progress-track"><div class="progress-fill" style="width: ${percent}%"></div></div>
          <span>${percent}%</span>
        </div>
      </div>
      <div class="course-card-actions">
        <a class="button secondary" href="/courses/${courseItem.id}">Open</a>
        <a class="button primary" href="/courses/${courseItem.id}">${buttonText}</a>
      </div>
    `;
    browser.appendChild(card);
  });

  setText("#progress-count", `${courseLessons(beginnerCourse).filter((lesson) => completedLessons.has(lesson.id)).length} lessons complete`);
}

function setSelectOptions(select, options, currentValue) {
  if (!select) return;
  const markup = options.map((option) => `<option value="${option.value}">${option.label}</option>`).join("");
  if (select.dataset.options !== markup) {
    select.innerHTML = markup;
    select.dataset.options = markup;
  }
  select.value = options.some((option) => option.value === currentValue) ? currentValue : options[0]?.value || "all";
}

function renderCourseLibraryControls() {
  const bracketSelect = document.querySelector("#course-filter-bracket");
  const topicSelect = document.querySelector("#course-filter-topic");
  const colorSelect = document.querySelector("#course-filter-color");
  const typeSelect = document.querySelector("#course-filter-type");
  const statusSelect = document.querySelector("#course-filter-status");
  const sortSelect = document.querySelector("#course-sort");
  const searchInput = document.querySelector("#course-search");
  const resetButton = document.querySelector("#course-filter-reset");

  setSelectOptions(bracketSelect, [
    { value: "all", label: "All levels" },
    ...allBrackets().map((bracket) => ({ value: bracket.id || bracket.slug, label: `${bracket.title} (${bracket.range})` })),
  ], courseLibraryState.bracket);

  setSelectOptions(topicSelect, [
    { value: "all", label: "All topics" },
    { value: "fundamentals", label: "Fundamentals" },
    { value: "openings", label: "Openings" },
    { value: "tactics", label: "Tactics" },
    { value: "endgame", label: "Endgame" },
    { value: "strategy", label: "Strategy" },
  ], courseLibraryState.topic);

  setSelectOptions(colorSelect, [
    { value: "all", label: "All colors" },
    { value: "white", label: "White" },
    { value: "black", label: "Black" },
    { value: "both", label: "Both" },
  ], courseLibraryState.color);

  setSelectOptions(typeSelect, [
    { value: "all", label: "All types" },
    { value: "interactive lesson", label: "Interactive lesson" },
    { value: "opening course", label: "Opening course" },
    { value: "drill", label: "Drill" },
    { value: "quiz", label: "Quiz" },
    { value: "practice", label: "Practice" },
  ], courseLibraryState.type);

  setSelectOptions(statusSelect, [
    { value: "all", label: "All status" },
    { value: "not-started", label: "Not started" },
    { value: "in-progress", label: "In progress" },
    { value: "completed", label: "Completed" },
  ], courseLibraryState.status);

  setSelectOptions(sortSelect, [
    { value: "recommended", label: "Recommended" },
    { value: "progress", label: "Progress" },
    { value: "title", label: "Title" },
    { value: "level", label: "Level" },
    { value: "time", label: "Time" },
  ], courseLibraryState.sort);

  if (searchInput && !searchInput.dataset.bound) {
    searchInput.addEventListener("input", () => {
      courseLibraryState.query = searchInput.value || "";
      renderCourseLibrary();
    });
    searchInput.dataset.bound = "1";
  }

  [
    [bracketSelect, "bracket"],
    [topicSelect, "topic"],
    [colorSelect, "color"],
    [typeSelect, "type"],
    [statusSelect, "status"],
    [sortSelect, "sort"],
  ].forEach(([select, key]) => {
    if (!select || select.dataset.bound) return;
    select.addEventListener("change", () => {
      courseLibraryState[key] = select.value;
      renderCourseLibrary();
    });
    select.dataset.bound = "1";
  });

  if (resetButton && !resetButton.dataset.bound) {
    resetButton.addEventListener("click", () => {
      courseLibraryState = {
        query: "",
        bracket: "all",
        topic: "all",
        color: "all",
        type: "all",
        status: "all",
        sort: "recommended",
      };
      if (searchInput) searchInput.value = "";
      renderCourseLibraryControls();
      renderCourseLibrary();
    });
    resetButton.dataset.bound = "1";
  }
}

function renderCourseLibrary() {
  const browser = document.querySelector("#course-library");
  if (!browser || !course) return;

  renderCourseLibraryControls();

  const allEntries = availableCourses().map((courseItem) => courseLibraryMeta(courseItem));
  const visibleEntries = allEntries.filter(courseLibraryMatchesFilter);
  const sortValue = courseLibraryState.sort;
  const sortPriority = (meta) => courseLibrarySortValue(meta)[sortValue] || courseLibrarySortValue(meta).recommended;
  visibleEntries.sort((a, b) => {
    const left = sortPriority(a);
    const right = sortPriority(b);
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      const l = left[index];
      const r = right[index];
      if (l === r) continue;
      if (typeof l === "number" && typeof r === "number") return l - r;
      return String(l).localeCompare(String(r));
    }
    return 0;
  });

  const recommended = visibleEntries[0] || allEntries.slice().sort((a, b) => {
    const left = courseLibrarySortValue(a).recommended;
    const right = courseLibrarySortValue(b).recommended;
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      const l = left[index];
      const r = right[index];
      if (l === r) continue;
      if (typeof l === "number" && typeof r === "number") return l - r;
      return String(l).localeCompare(String(r));
    }
    return 0;
  })[0];

  if (recommended) {
    const continueButton = document.querySelector("#continue-card-button");
    if (continueButton) {
      continueButton.href = `/courses/${recommended.course.id}`;
      continueButton.textContent = recommended.status === "completed"
        ? "Review"
        : recommended.status === "in-progress"
          ? "Continue"
          : "Start";
    }
  }

  setText("#course-library-count", `${visibleEntries.length} course${visibleEntries.length === 1 ? "" : "s"} shown`);

  const tags = document.querySelector("#course-library-tags");
  if (tags) {
    const activeTags = [
      courseLibraryState.bracket !== "all"
        ? allBrackets().find((item) => item.id === courseLibraryState.bracket || item.slug === courseLibraryState.bracket)?.title || courseLibraryState.bracket
        : null,
      courseLibraryState.topic !== "all" ? prettyCourseTag(courseLibraryState.topic) : null,
      courseLibraryState.color !== "all" ? prettyCourseTag(courseLibraryState.color) : null,
      courseLibraryState.type !== "all" ? prettyCourseTag(courseLibraryState.type) : null,
      courseLibraryState.status !== "all" ? prettyCourseTag(courseLibraryState.status) : null,
    ].filter(Boolean);
    tags.innerHTML = activeTags.length
      ? activeTags.map((tag) => `<span class="course-library-tag">${tag}</span>`).join("")
      : '<span class="course-library-tag is-muted">All courses</span>';
  }

  browser.innerHTML = "";

  if (!visibleEntries.length) {
    browser.innerHTML = `
      <article class="course-library-empty">
        <p class="eyebrow">No matches</p>
        <h2>No courses match these filters.</h2>
        <p>Try a different topic, level, or search term.</p>
        <button class="button primary" type="button" id="reset-course-library-empty">Reset filters</button>
      </article>
    `;
    const resetEmpty = document.querySelector("#reset-course-library-empty");
    if (resetEmpty && !resetEmpty.dataset.bound) {
      resetEmpty.addEventListener("click", () => {
        const resetButton = document.querySelector("#course-filter-reset");
        if (resetButton) resetButton.click();
      });
      resetEmpty.dataset.bound = "1";
    }
    return;
  }

  visibleEntries.forEach((meta) => {
    const courseItem = meta.course;
    const lessons = courseLessons(courseItem);
    const buttonText = meta.status === "completed" ? "Review" : meta.status === "in-progress" ? "Continue" : "Open";
    const coverText = courseItem.title
      .split(" ")
      .map((word) => word[0])
      .join("")
      .slice(0, 3)
      .toUpperCase();
    const card = document.createElement("article");
    card.className = `course-card course-library-row ${meta.status === "completed" ? "is-complete" : ""}`;
    card.innerHTML = `
      <div class="course-card-thumb course-library-thumb" aria-hidden="true">
        <span>${coverText}</span>
      </div>
      <div class="course-card-main">
        <div class="course-library-title-row">
          <div class="course-library-title-stack">
            <span class="lesson-state">${meta.bracketLabel}</span>
            <h2>${courseItem.title}</h2>
          </div>
          <span class="course-library-status ${meta.status}">${meta.statusLabel}</span>
        </div>
        <p>${courseItem.description}</p>
        <div class="course-library-chip-row">
          <span class="course-library-chip">${meta.bracketRange}</span>
          <span class="course-library-chip">${meta.topic}</span>
          <span class="course-library-chip">${meta.color}</span>
          <span class="course-library-chip">${meta.type}</span>
        </div>
      </div>
      <div class="course-card-side">
        <div class="course-card-meta">
          <span>${lessons.length} lessons</span>
          <span>${meta.progress}% complete</span>
        </div>
        <div class="lesson-row-progress compact">
          <div class="progress-track"><div class="progress-fill" style="width: ${meta.progress}%"></div></div>
          <span>${meta.progress}%</span>
        </div>
      </div>
      <div class="course-card-actions">
        <a class="button primary" href="/courses/${courseItem.id}">${buttonText}</a>
      </div>
    `;
    browser.appendChild(card);
  });
}

function renderCourseDetail() {
  const browser = document.querySelector("#course-detail");
  if (!browser || !course) return;

  const currentCourse = courseById(currentCourseIdFromUrl());
  const lessonsInCourse = courseLessons(currentCourse);
  const completeCount = lessonsInCourse.filter((lesson) => completedLessons.has(lesson.id)).length;
  const percent = coursePercent(currentCourse);
  const next = nextLessonInCourse(currentCourse);

  setText("#course-title", currentCourse.title);
  setText("#course-description", currentCourse.description);
  setText("#progress-count", `${completeCount} of ${lessonsInCourse.length} complete`);
  document.querySelector("#progress-fill").style.width = `${percent}%`;

  if (next) {
    document.querySelector("#continue-learning").href = `/lessons/${next.id}`;
    document.querySelector("#continue-card-button").href = `/lessons/${next.id}`;
    setText("#continue-title", next.title);
    setText("#continue-description", `${next.category.title} · ${next.skill.title} · ${next.timeMinutes || 5} min`);
  } else {
    document.querySelector("#continue-learning").href = "/lessons";
    document.querySelector("#continue-card-button").href = "/lessons";
    setText("#continue-title", "This course is coming soon");
    setText("#continue-description", "FreeMate will add these lessons after the beginner path is solid.");
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
        <a class="button primary" href="/courses/beginner-fundamentals">Open Beginner Course</a>
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
        const lessonProgress = complete ? 100 : Math.round(((savedSteps[lesson.id] || 0) / stepCount) * 100);
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

  const activeCourse = activeLesson?.course || courseById(currentCourseIdFromUrl()) || availableCourses()[0];
  (activeCourse?.categories || []).forEach((category) => {
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
        link.setAttribute("aria-current", String(activeLesson && lesson.id === activeLesson.id));
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

function renderBracketOverview() {
  const browser = document.querySelector("#bracket-cards");
  if (!browser || !course) return;

  const bracketsList = allBrackets();
  if (!bracketsList.length) return;

  const next = nextBracket();
  if (next) {
    setText("#continue-title", next.title);
    setText("#continue-description", `${next.range} · ${next.description}`);
    const continueButton = document.querySelector("#continue-card-button");
    if (continueButton) continueButton.href = `/lessons/${next.slug}`;
    setText("#current-focus", next.title);
    setText("#next-lesson", next.learn?.[0] || next.description);
    setText("#next-bracket", nextBracket()?.slug === next.slug ? "Next bracket" : "Next up");
    setText("#next-bracket-description", next.learn?.slice(0, 2).join(" · ") || next.description);
  }

  browser.innerHTML = "";

  bracketsList.forEach((bracket) => {
    const percent = bracketProgress(bracket);
    const courseCount = (bracket.items || []).length;
    const nextItem = nextBracketItem(bracket);
    const isCurrent = next && next.id === bracket.id;
    const card = document.createElement("article");
    card.className = `bracket-card ${isCurrent ? "is-current" : ""}`;
    card.innerHTML = `
      <div class="bracket-card-main">
        <div class="bracket-card-heading">
          <div>
            <span class="lesson-state">${bracket.range}</span>
            <h2>${bracket.title}</h2>
            <p>${bracket.description}</p>
          </div>
          ${isCurrent ? '<span class="bracket-current-pill">Recommended next</span>' : ""}
        </div>
        <div class="bracket-learn-list">
          ${(bracket.learn || []).map((item) => `<span>${item}</span>`).join("")}
        </div>
      </div>
      <div class="bracket-card-side">
        <div class="course-card-meta">
          <span>${courseCount} courses</span>
          <span>${percent}% complete</span>
        </div>
        <div class="lesson-row-progress compact">
          <div class="progress-track"><div class="progress-fill" style="width: ${percent}%"></div></div>
          <span>${percent}%</span>
        </div>
        <a class="button primary" href="/lessons/${bracket.slug}">${percent > 0 ? "Continue" : "Start"}</a>
      </div>
    `;
    browser.appendChild(card);
  });

  const overall = allLessons().filter((lesson) => completedLessons.has(lesson.id)).length;
  const total = allLessons().length;
  setText("#progress-count", `${overall} lessons complete`);
  setText("#completed-number", overall);
  setText("#course-percent", `${total ? Math.round((overall / total) * 100) : 0}%`);
  const fill = document.querySelector("#progress-fill");
  if (fill) fill.style.width = `${total ? Math.round((overall / total) * 100) : 0}%`;
}

function renderBracketDetail() {
  const browser = document.querySelector("#bracket-courses");
  if (!browser || !course) return;

  const slug = currentBracketSlugFromUrl();
  const bracket = bracketById(slug);
  if (!bracket) return;

  const percent = bracketProgress(bracket);
  const bracketsList = allBrackets();
  const currentIndex = bracketsList.findIndex((entry) => entry.id === bracket.id);
  const next = bracketsList[currentIndex + 1] || nextBracket();
  const nextItem = nextBracketItem(bracket);

  setText("#bracket-title", bracket.title);
  setText("#bracket-range", bracket.range);
  setText("#bracket-description", bracket.description);
  setText("#bracket-learn", (bracket.learn || []).join(" · "));
  setText("#progress-count", `${bracketLessonIds(bracket).filter((lessonId) => completedLessons.has(lessonId)).length} of ${bracketLessonIds(bracket).length} complete`);
  setText("#completed-number", bracketLessonIds(bracket).filter((lessonId) => completedLessons.has(lessonId)).length);
  setText("#course-percent", `${percent}%`);
  const fill = document.querySelector("#progress-fill");
  if (fill) fill.style.width = `${percent}%`;

  if (nextItem) {
    setText("#continue-title", nextItem.title);
    setText("#continue-description", nextItem.description);
    const nextHref = nextItem.href || "/lessons";
    const continueLearning = document.querySelector("#continue-learning");
    const continueCardButton = document.querySelector("#continue-card-button");
    if (continueLearning) continueLearning.href = nextHref;
    if (continueCardButton) continueCardButton.href = nextHref;
  }

  if (next) {
    setText("#next-bracket", next.title);
    setText("#next-bracket-description", next.description);
  }

  browser.innerHTML = "";

  (bracket.items || []).forEach((item) => {
    const itemPercent = bracketItemProgress(item);
    const courseItem = item.kind === "course" || item.kind === "track"
      ? courseById(item.courseId || item.id)
      : null;
    const title = item.title || courseItem?.title || "Course";
    const description = item.description || courseItem?.description || "";
    const actionLabel = item.kind === "preview"
      ? "Preview"
      : itemPercent > 0
        ? "Continue"
        : "Open";
    const card = document.createElement("article");
    card.className = `course-card bracket-course-card ${item.kind === "preview" ? "is-planned" : ""}`;
    card.innerHTML = `
      <div class="course-card-thumb" aria-hidden="true">
        <span>${(item.kind || "COURSE").toUpperCase().slice(0, 3)}</span>
      </div>
      <div class="course-card-main">
        <span class="lesson-state">${item.kind === "preview" ? "Preview" : item.kind === "track" ? "Track" : "Course"}</span>
        <div>
          <h2>${title}</h2>
          <p>${description}</p>
        </div>
      </div>
      <div class="course-card-side">
        <div class="course-card-meta">
          <span>${(item.lessonIds || []).length ? `${(item.lessonIds || []).length} lessons` : "Coming soon"}</span>
          <span>${itemPercent}% complete</span>
        </div>
        <div class="lesson-row-progress compact">
          <div class="progress-track"><div class="progress-fill" style="width: ${itemPercent}%"></div></div>
          <span>${itemPercent}%</span>
        </div>
      </div>
      <div class="course-card-actions">
        <a class="button secondary" href="${item.href || "/lessons"}">Open</a>
        <a class="button primary" href="${item.href || "/lessons"}">${actionLabel}</a>
      </div>
    `;
    browser.appendChild(card);
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
  activeLesson = requestedLesson && isUnlocked(requestedLesson) ? requestedLesson : nextLesson();
  activeStepIndex = savedSteps[activeLesson.id] || 0;
  renderCourseTree();
  renderLessonStep();
}

function renderLessonStep() {
  const player = document.querySelector("#lesson-player");
  const step = activeLesson.steps[activeStepIndex];
  const stepNumber = activeStepIndex + 1;
  const stepPercent = Math.round((stepNumber / activeLesson.steps.length) * 100);

  setText("#lesson-objective", activeLesson.title);
  setText("#lesson-goal", activeLesson.coachIntro || activeLesson.summary);
  setText("#lesson-progress-label", `Step ${stepNumber} of ${activeLesson.steps.length}`);
  document.querySelector("#lesson-progress-fill").style.width = `${stepPercent}%`;

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

  if (step.type === "rook-practice" || step.type === "rook-challenge" || step.highlights) {
    boardArea.innerHTML = '<div class="modern-board" id="modern-board" aria-label="Interactive chessboard"></div>';
    renderReusableBoard(step);
  } else {
    boardArea.innerHTML = '<div class="modern-board" id="modern-board" aria-label="Chessboard"></div>';
    activeBoard = new ChessBoard(document.querySelector("#modern-board"), { fen: startingFen });
  }

  if (step.type === "checklist") {
    card.insertAdjacentHTML("beforeend", `
      <ul class="exercise-checklist">
        ${step.tasks.map((task) => `<li>${task}</li>`).join("")}
      </ul>
    `);
  }

  if (step.type === "move-validation") {
    card.insertAdjacentHTML("beforeend", `
      <form class="move-form" id="lesson-move-form">
        <label for="lesson-move-input">Try a move</label>
        <div class="input-row">
          <input id="lesson-move-input" name="move" type="text" placeholder="${step.placeholder || "e2e4"}" required>
          <button class="button primary" type="submit">Validate</button>
        </div>
      </form>
    `);
    document.querySelector("#lesson-move-form").addEventListener("submit", (event) => validateTypedMove(event, step));
  }
}

function rookLegalSquares(fromSquare) {
  return files.flatMap((file) => `${file}${fromSquare[1]}`)
    .concat([1, 2, 3, 4, 5, 6, 7, 8].map((rank) => `${fromSquare[0]}${rank}`))
    .filter((square) => square !== fromSquare);
}

function renderReusableBoard(step) {
  const boardElement = document.querySelector("#modern-board");
  const startSquare = step.startSquare || "d4";
  const legalSquares = step.highlights || (step.type === "rook-challenge" ? [step.targetSquare] : rookLegalSquares(startSquare));
  activeBoard = new ChessBoard(boardElement, {
    fen: step.fen || startingFen,
    legalSquares,
    targetSquare: step.targetSquare,
    onMove: ({ board, fromSquare, toSquare, move }) => attemptBoardMove(step, board, fromSquare, toSquare, move),
  });
}

async function attemptBoardMove(step, board, fromSquare, toSquare, move) {
  if (!fromSquare || fromSquare === toSquare) return;
  const feedback = document.querySelector("#step-feedback");
  const sideFeedback = document.querySelector("#side-feedback");
  feedback.textContent = "Checking move...";
  const captured = Boolean(board.pieceAt(toSquare));

  try {
    const response = await fetch("/api/validate-move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ move, fen: board.fen }),
    });
    const data = await response.json();
    if (!data.is_valid || (step.targetSquare && toSquare !== step.targetSquare)) {
      const message = step.targetSquare && toSquare !== step.targetSquare
        ? `Legal rook move, but the goal is ${step.targetSquare}.`
        : data.message;
      feedback.textContent = message;
      sideFeedback.textContent = message;
      feedback.className = "result error";
      playSound("illegal");
      board.clearSelection();
      return;
    }

    board.applyMove(fromSquare, toSquare);
    if (data.resulting_fen) {
      board.fen = data.resulting_fen;
    }
    feedback.textContent = step.successText || data.message;
    sideFeedback.textContent = feedback.textContent;
    feedback.className = "result success";
    playSound(captured ? "capture" : "move");
    unlockNextStep();
  } catch (error) {
    feedback.textContent = "The coach cannot reach the backend right now.";
    feedback.className = "result error";
    playSound("illegal");
  }
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
    feedback.textContent = data.san ? `${data.message} Chess notation: ${data.san}` : data.message;
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
  const interactive = ["rook-practice", "rook-challenge", "move-validation"].includes(step.type);
  next.disabled = interactive;
  if (activeStepIndex === activeLesson.steps.length - 1) next.textContent = "Complete Lesson";

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
      void flushRemoteProgressSave();
      playSound("success");
      document.querySelector("#side-feedback").textContent = "Lesson complete. Your next lesson is unlocked.";
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
  try {
    const progressSync = await loadProgressSyncModule();
    const snapshot = await progressSync.loadProgressSnapshot();
    progressSync.hydrateLessonProgressStorage(snapshot, {
      completedLessons,
      savedSteps,
      progressKey,
      stepKeys: [stepKey, "freemate.savedSteps"],
    });
  } catch (error) {
    // Continue with localStorage-only progress if the DB is unavailable.
  }

  const needsBracket = document.querySelector("#bracket-cards")
    || document.querySelector("#bracket-courses");
  if (needsBracket) {
    course = await loadCourseData();
    brackets = await loadBracketData();
    renderBracketOverview();
    renderBracketDetail();
    return;
  }

  const needsLibrary = document.querySelector("#course-library");
  if (needsLibrary) {
    course = await loadCourseData();
    brackets = await loadBracketData();
    updateProgressUI();
    renderCourseLibrary();
    return;
  }

  const needsCourse = document.querySelector("#course-cards")
    || document.querySelector("#course-detail")
    || document.querySelector("#course-tree")
    || document.querySelector("#home-roadmap");
  if (!needsCourse) return;

  course = await loadCourseData();
  renderRoadmap("#home-roadmap");
  renderRoadmap("#lesson-roadmap");
  updateProgressUI();
  renderCourseCards();
  renderCourseDetail();
  renderLessonMode();
}

async function loadCourseData() {
  const sources = ["/api/course"];

  for (const url of sources) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) continue;
      const data = await response.json();
      return Array.isArray(data) ? data : data ? [data] : [];
    } catch (error) {
      // Try the next source.
    }
  }

  return [];
}

async function loadBracketData() {
  const sources = ["/api/brackets", "/static/data/brackets.json"];

  for (const url of sources) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) continue;
      const data = await response.json();
      return hydrateBrackets(Array.isArray(data) ? data : []);
    } catch (error) {
      // Try the next source.
    }
  }

  return [];
}

function hydrateBrackets(bracketsList) {
  return (bracketsList || []).map((bracket) => ({
    ...bracket,
    items: (bracket.items || []).map((item) => ({
      ...item,
      href: item.href || (item.courseId ? `/courses/${item.courseId}` : undefined),
      lessonIds: item.lessonIds?.length ? item.lessonIds : itemLessonIds(item),
    })),
  }));
}

init();
