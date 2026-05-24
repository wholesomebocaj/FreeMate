import { courseLessons, loadCurriculumData } from "/static/components/curriculum.js";
import { getReviewQueue, loadReviewState, reviewHref, reviewLabel } from "/static/components/review-store.js";

const list = document.querySelector("#review-list");
const count = document.querySelector("#review-count");
const fill = document.querySelector("#review-fill");

initReviewPage();

async function initReviewPage() {
  const [curriculum, openings] = await Promise.all([
    loadCurriculumData().catch(() => ({ courses: [] })),
    fetchJson("/api/openings").catch(() => []),
  ]);
  const queue = hydrateQueue(getReviewQueue(loadReviewState()), curriculum.courses || [], openings || []);

  count.textContent = queue.length
    ? `${queue.length} item${queue.length === 1 ? "" : "s"} ready`
    : "Nothing due";
  if (fill) fill.style.width = queue.length ? `${Math.min(100, queue.length * 18)}%` : "100%";

  if (!queue.length) {
    list.innerHTML = `
      <article class="review-empty-card">
        <p class="eyebrow">Clear</p>
        <h2>No shaky items right now.</h2>
        <p>Missed lesson tasks and opening branches will appear here automatically.</p>
        <div class="review-actions">
          <a class="button primary" href="/lessons">Continue lessons</a>
          <a class="button secondary" href="/openings">Train openings</a>
        </div>
      </article>
    `;
    return;
  }

  list.innerHTML = queue.map((item, index) => `
    <article class="review-row">
      <div class="review-row-index">${index + 1}</div>
      <div class="review-row-main">
        <p class="eyebrow">${item.type === "opening" ? "Opening branch" : "Lesson"} · ${reviewLabel(item)}</p>
        <h2>${escapeHtml(item.title)}</h2>
        <p>${escapeHtml(item.subtitle || "Practice this once, then move on.")}</p>
        <div class="review-meta">
          <span>${item.state}</span>
          <span>${item.failures || 0} miss${item.failures === 1 ? "" : "es"}</span>
          <span>${item.successStreak || 0} correct in a row</span>
        </div>
      </div>
      <a class="button primary" href="${item.href || reviewHref(item)}">Review</a>
    </article>
  `).join("");
}

function hydrateQueue(queue, courses, openings) {
  const lessons = new Map();
  (courses || []).forEach((course) => {
    courseLessons(course).forEach((lesson) => {
      lessons.set(lesson.id, { lesson, course });
    });
  });
  const openingNames = new Map((openings || []).map((opening) => [opening.id, opening.name]));

  return queue.map((item) => {
    if (item.type === "lesson" && lessons.has(item.id)) {
      const { lesson, course } = lessons.get(item.id);
      return {
        ...item,
        title: item.title || lesson.title,
        subtitle: item.subtitle || course.title,
        href: `/lessons/${lesson.id}`,
      };
    }
    if (item.type === "opening") {
      const name = openingNames.get(item.id) || item.id;
      return {
        ...item,
        title: item.title || name,
        subtitle: item.subtitle || name,
        href: reviewHref(item),
      };
    }
    return {
      ...item,
      href: item.href || reviewHref(item),
    };
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}`);
  return response.json();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
