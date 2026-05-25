const AUTH_URL = "/api/auth/me";
const PROGRESS_URL = "/api/progress";

let authStatePromise = null;
let progressSnapshotPromise = null;

async function fetchJson(url, options) {
    const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(extractErrorMessage(data));
        error.status = response.status;
        throw error;
    }

    return data;
}

function extractErrorMessage(data) {
    const detail = data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length) {
        const first = detail[0];
        if (typeof first === "string") return first;
        if (first?.msg) return first.msg;
    }
    if (typeof data?.message === "string") return data.message;
    return "Something went wrong.";
}

async function loadAuthState(force = false) {
    if (!authStatePromise || force) {
        authStatePromise = fetchJson(AUTH_URL).catch(() => ({
            authenticated: false,
            user: null,
        }));
    }

    return authStatePromise;
}

export async function loadProgressSnapshot(force = false) {
    if (!progressSnapshotPromise || force) {
        progressSnapshotPromise = (async () => {
            const auth = await loadAuthState(force);
            if (!auth?.authenticated || !auth?.user) {
                return null;
            }

            return fetchJson(PROGRESS_URL).catch(() => null);
        })();
    }

    return progressSnapshotPromise;
}

export function hydrateLessonProgressStorage(snapshot, options = {}) {
    if (!snapshot) {
        return {
            completedLessons: options.completedLessons || new Set(),
            savedSteps: options.savedSteps || {},
        };
    }

    const completedLessons = options.completedLessons instanceof Set
        ? options.completedLessons
        : new Set(options.completedLessons || []);
    const savedSteps = options.savedSteps && typeof options.savedSteps === "object"
        ? options.savedSteps
        : {};
    const progressKey = options.progressKey || "freemate.completedLessons";
    const stepKeys = Array.isArray(options.stepKeys)
        ? options.stepKeys.filter(Boolean)
        : [options.stepKey, options.legacyStepKey].filter(Boolean);

    for (const row of snapshot.lessons || []) {
        if (row.completed || row.status === "mastered") {
            completedLessons.add(row.lesson_id);
        }

        if (Number.isInteger(row.last_step_index)) {
            savedSteps[row.lesson_id] = row.last_step_index;
        }
    }

    localStorage.setItem(progressKey, JSON.stringify([...completedLessons]));
    stepKeys.forEach((key) => {
        localStorage.setItem(key, JSON.stringify(savedSteps));
    });

    if (options.completedLessons instanceof Set) {
        options.completedLessons.clear();
        completedLessons.forEach((value) => options.completedLessons.add(value));
    }

    if (options.savedSteps && typeof options.savedSteps === "object") {
        Object.keys(options.savedSteps).forEach((key) => delete options.savedSteps[key]);
        Object.assign(options.savedSteps, savedSteps);
    }

    return { completedLessons, savedSteps };
}

export function hydrateOpeningProgressStorage(snapshot, openingId, options = {}) {
    const openingRows = (snapshot?.openings || []).filter((row) => row.opening_key === openingId);
    const branchCompletions = options.branchCompletions && typeof options.branchCompletions === "object"
        ? options.branchCompletions
        : {};
    const openingProgress = options.openingProgress && typeof options.openingProgress === "object"
        ? options.openingProgress
        : { lines: {} };
    const completionKey = options.completionKey;
    const progressKey = options.progressKey;

    openingProgress.lines = openingProgress.lines && typeof openingProgress.lines === "object"
        ? openingProgress.lines
        : {};

    for (const row of openingRows) {
        branchCompletions[row.branch_key] = {
            completed: row.completed,
            completedAt: row.updated_at,
        };

        openingProgress.lines[row.branch_key] = {
            ...(openingProgress.lines[row.branch_key] || {}),
            moveIndex: row.move_index || 0,
            completed: row.completed,
            masteryScore: row.mastery_score || 0,
            updatedAt: row.updated_at,
        };
    }

    if (!openingProgress.activeLineId && openingRows[0]?.branch_key) {
        openingProgress.activeLineId = openingRows[0].branch_key;
    }

    if (progressKey) {
        localStorage.setItem(progressKey, JSON.stringify(openingProgress));
    }

    if (completionKey) {
        localStorage.setItem(completionKey, JSON.stringify(branchCompletions));
    }

    return { branchCompletions, openingProgress };
}

export async function saveLessonProgress(payload) {
    const auth = await loadAuthState();
    if (!auth?.authenticated) return null;
    return fetchJson("/api/progress/lesson", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });
}

export async function saveOpeningProgress(payload) {
    const auth = await loadAuthState();
    if (!auth?.authenticated) return null;
    return fetchJson("/api/progress/opening", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });
}

export async function saveCourseProgress(payload) {
    const auth = await loadAuthState();
    if (!auth?.authenticated) return null;
    return fetchJson("/api/progress/course", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });
}
