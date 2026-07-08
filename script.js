const form = document.querySelector("#roomRequestForm");
const error = document.querySelector("#formError");
const confirmation = document.querySelector("#confirmation");
const newRequest = document.querySelector("#newRequest");
const submitButton = form.querySelector('button[type="submit"]');

function showConfirmation() {
  confirmation.hidden = false;
  confirmation.scrollIntoView({ behavior: "smooth", block: "start" });
}

function formDataToObject(data) {
  return Object.fromEntries([...data.entries()].map(([key, value]) => [key, String(value).trim()]));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.textContent = "";

  if (!form.reportValidity()) {
    error.textContent = "Please complete the required fields before submitting.";
    return;
  }

  const data = new FormData(form);
  const payload = {
    details: formDataToObject(data),
  };

  submitButton.disabled = true;
  submitButton.textContent = "Sending Request...";

  let timeout;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 20000);
    const response = await fetch("/api/room-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error("Request could not be sent.");
    }

    form.reset();
    showConfirmation();
  } catch (submitError) {
    error.textContent = "We could not send the request. Please try again or contact Cristina and Matthew directly.";
  } finally {
    clearTimeout(timeout);
    submitButton.disabled = false;
    submitButton.textContent = "Submit Room Request";
  }
});

newRequest.addEventListener("click", () => {
  confirmation.hidden = true;
});
