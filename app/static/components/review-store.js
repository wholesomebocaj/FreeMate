const REVIEW_KEY = "freemate.reviewQueue";
const STATE_RANK = {
  shaky: 0,
  learning: 1,
  new: 2,
  mastered: 3,
};

export function reviewItemKey(item) {
  return [item.type, item.id, item.branchId].filter(Boolean).join(":");
}

export function loadReviewState() {
  try {
    const data = JSON.parse(localStorage.getItem(REVIEW_KEY)) || {};
    return typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch (error) {
    return {};
  }
}

export function saveReviewState(state) {
  localStorage.setItem(REVIEW_KEY, JSON.stringify(state));
}

export function recordReviewFailure(item) {
  const state = loadReviewState();
  const key = reviewItemKey(item);
  const existing = state[key] || {};
  const now = new Date().toISOString();

  state[key] = {
    ...existing,
    ...cleanItem(item),
    key,
    state: "shaky",
    failures: (existing.failures || 0) + 1,
    attempts: (existing.attempts || 0) + 1,
    successStreak: 0,
    lastFailedAt: now,
    updatedAt: now,
    dueAt: now,
  };

  saveReviewState(state);
  return state[key];
}

export function recordReviewSuccess(item) {
  const state = loadReviewState();
  const key = reviewItemKey(item);
  const existing = state[key] || {};
  const now = new Date().toISOString();
  const successStreak = (existing.successStreak || 0) + 1;

  state[key] = {
    ...existing,
    ...cleanItem(item),
    key,
    state: "mastered",
    attempts: (existing.attempts || 0) + 1,
    successes: (existing.successes || 0) + 1,
    successStreak,
    lastSucceededAt: now,
    updatedAt: now,
    dueAt: null,
  };

  saveReviewState(state);
  return state[key];
}

export function getReviewQueue(state = loadReviewState()) {
  const now = Date.now();
  return Object.values(state)
    .filter((item) => item && item.state !== "mastered")
    .filter((item) => !item.dueAt || Date.parse(item.dueAt) <= now)
    .sort((a, b) => {
      const rank = (STATE_RANK[a.state] ?? 9) - (STATE_RANK[b.state] ?? 9);
      if (rank !== 0) return rank;
      return Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0);
    });
}

export function reviewHref(item) {
  if (item.type === "opening") {
    const line = item.branchId ? `?line=${encodeURIComponent(item.branchId)}` : "";
    return `/openings/${item.id}/train${line}`;
  }
  return `/lessons/${item.id}`;
}

export function reviewLabel(item) {
  if (item.state === "shaky") return "Review soon";
  if (item.state === "learning") return "Practice again";
  if (item.state === "mastered") return "Mastered";
  return "New";
}

function cleanItem(item) {
  return {
    type: item.type,
    id: item.id,
    branchId: item.branchId || null,
    title: item.title || item.id,
    subtitle: item.subtitle || "",
    href: item.href || reviewHref(item),
  };
}
