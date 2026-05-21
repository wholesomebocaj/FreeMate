import { PracticeBoard } from "/static/components/practice-board.js";

export class LessonRenderer {
  constructor(container, lesson) {
    this.container = container;
    this.lesson = lesson;
    this.currentStepIndex = 0;
  }

  render() {
    this.renderStep();
  }

  renderStep() {
    const step = this.lesson.steps[this.currentStepIndex];

    if (!step) {
      this.renderComplete();
      return;
    }

    this.container.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "lesson-step";

    const title = document.createElement("h2");
    title.className = "lesson-step-title";
    title.textContent = step.title || "";

    const body = document.createElement("p");
    body.className = "lesson-step-body";
    body.textContent = step.body || "";

    wrapper.appendChild(title);
    wrapper.appendChild(body);

    switch (step.type) {
      case "explain":
        this.renderExplainStep(wrapper, step);
        break;

      case "checklist":
        this.renderChecklistStep(wrapper, step);
        break;

      case "rook-practice":
        this.renderBoardStep(wrapper, step);
        break;

      case "rook-challenge":
        this.renderBoardStep(wrapper, step);
        break;

      default:
        wrapper.innerHTML += `
          <p>Unsupported lesson step type: ${step.type}</p>
        `;
    }

    const controls = document.createElement("div");
    controls.className = "lesson-controls";

    if (this.currentStepIndex > 0) {
      const backButton = document.createElement("button");
      backButton.textContent = "Back";
      backButton.onclick = () => {
        this.currentStepIndex--;
        this.renderStep();
      };

      controls.appendChild(backButton);
    }

    const nextButton = document.createElement("button");
    nextButton.textContent =
      this.currentStepIndex === this.lesson.steps.length - 1
        ? "Finish"
        : "Next";

    nextButton.onclick = () => {
      this.currentStepIndex++;
      this.renderStep();
    };

    controls.appendChild(nextButton);

    wrapper.appendChild(controls);

    this.container.appendChild(wrapper);
  }

  renderExplainStep(wrapper, step) {
    if (!step.fen) return;

    const boardContainer = document.createElement("div");
    boardContainer.className = "lesson-board";

    wrapper.appendChild(boardContainer);

    new PracticeBoard(boardContainer, {
      fen: step.fen,
      interactive: false,
      highlightSquares: step.highlights || [],
    });
  }

  renderChecklistStep(wrapper, step) {
    const list = document.createElement("ul");
    list.className = "lesson-checklist";

    (step.tasks || []).forEach((task) => {
      const item = document.createElement("li");
      item.textContent = task;
      list.appendChild(item);
    });

    wrapper.appendChild(list);
  }

  renderBoardStep(wrapper, step) {
    const boardContainer = document.createElement("div");
    boardContainer.className = "lesson-board";

    wrapper.appendChild(boardContainer);

    new PracticeBoard(boardContainer, {
      fen: step.fen,
      mode: "lesson",
      interactive: true,
      allowedMoves: this.buildAllowedMoves(step),
      lockToAllowedMoves: true,
    });

    if (step.successText) {
      const success = document.createElement("div");
      success.className = "lesson-success-text";
      success.textContent = step.successText;

      wrapper.appendChild(success);
    }
  }

  buildAllowedMoves(step) {
    if (step.highlights && step.startSquare) {
      return step.highlights.map(
        (square) => `${step.startSquare}${square}`
      );
    }

    if (step.targetSquare && step.startSquare) {
      return [`${step.startSquare}${step.targetSquare}`];
    }

    return [];
  }

  renderComplete() {
    this.container.innerHTML = `
      <div class="lesson-complete">
        <h2>Lesson Complete</h2>
        <p>Great work. Continue to the next lesson.</p>
      </div>
    `;
  }
}