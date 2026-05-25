const COURSE_SOURCES = ["/api/course"];
const BRACKET_SOURCES = ["/api/brackets", "/static/data/brackets.json"];

export async function loadCurriculumData() {
  const [courses, brackets] = await Promise.all([
    loadJsonArray(COURSE_SOURCES),
    loadJsonArray(BRACKET_SOURCES),
  ]);
  const normalizedCourses = normalizeCourses(courses);

  return {
    courses: normalizedCourses,
    brackets: hydrateBrackets(brackets, normalizedCourses),
  };
}

export function courseLessons(course) {
  if (!course?.categories) return [];
  return course.categories.flatMap((category) =>
    (category.skills || []).flatMap((skill) =>
      (skill.lessons || []).map((lesson, index) => ({
        ...lesson,
        category,
        skill,
        categoryIndex: course.categories.indexOf(category),
        skillIndex: category.skills.indexOf(skill),
        lessonIndex: index,
      }))
    )
  );
}

export function findCourseForLesson(courses, lessonId) {
  for (const course of courses || []) {
    const lesson = courseLessons(course).find((entry) => entry.id === lessonId);
    if (lesson) return { course, lesson };
  }
  return null;
}

export function findCourseById(courses, courseId) {
  return (courses || []).find((course) => course.id === courseId) || null;
}

export function findBracketByCourseId(brackets, courseId) {
  return (brackets || []).find((bracket) =>
    (bracket.items || []).some((item) => item.courseId === courseId || item.id === courseId)
  ) || null;
}

export function findBracketForLesson(brackets, lessonId) {
  for (const bracket of brackets || []) {
    for (const item of bracket.items || []) {
      if ((item.lessonIds || []).includes(lessonId)) {
        return { bracket, item };
      }
    }
  }
  return null;
}

export function hydrateBrackets(brackets, courses) {
  return (brackets || []).map((bracket) => ({
    ...bracket,
    items: (bracket.items || []).map((item) => hydrateBracketItem(item, courses)),
  }));
}

function hydrateBracketItem(item, courses) {
  if (!item?.courseId) return { ...item, lessonIds: item.lessonIds || [] };
  const course = findCourseById(courses, item.courseId);
  return {
    ...item,
    href: item.href || `/courses/${item.courseId}`,
    lessonIds: course ? courseLessons(course).map((lesson) => lesson.id) : [],
  };
}

function normalizeCourses(courses) {
  return (courses || []).filter((course) => course?.id && Array.isArray(course.categories));
}

export function courseProgress(course, completedLessons) {
  const lessons = courseLessons(course);
  if (!lessons.length) return 0;
  const done = lessons.filter((lesson) => completedLessons.has(lesson.id)).length;
  return Math.round((done / lessons.length) * 100);
}

export function nextUnlockedLesson(course, completedLessons) {
  const lessons = courseLessons(course);
  return lessons.find((lesson, index) => isCourseLessonUnlocked(course, lesson.id, completedLessons, index)) || lessons[0] || null;
}

export function isCourseLessonUnlocked(course, lessonId, completedLessons, lessonIndexOverride = null) {
  const lessons = courseLessons(course);
  const index = lessonIndexOverride ?? lessons.findIndex((lesson) => lesson.id === lessonId);
  if (index < 0) return false;
  const lesson = lessons[index];
  if (!lesson.locked || index === 0) return true;
  const previous = lessons[index - 1];
  return completedLessons.has(previous?.id);
}

export function flattenCourseLessons(course) {
  return courseLessons(course);
}

export function lessonStateLabel(course, lessonId, completedLessons) {
  const lessons = courseLessons(course);
  const index = lessons.findIndex((lesson) => lesson.id === lessonId);
  if (index < 0) return "Open";
  if (completedLessons.has(lessonId)) return "Done";
  return isCourseLessonUnlocked(course, lessonId, completedLessons, index) ? "Open" : "Locked";
}

async function loadJsonArray(sources) {
  for (const url of sources) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const data = await response.json();
      if (Array.isArray(data)) return data;
      return data ? [data] : [];
    } catch (error) {
      // Try the next source.
    }
  }

  return [];
}
