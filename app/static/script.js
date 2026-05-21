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

