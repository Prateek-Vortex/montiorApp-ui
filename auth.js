const API_BASE = "https://focusbee-cloud.onrender.com";
const form = document.getElementById("authForm");
const message = document.getElementById("message");

async function auth(path) {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    const res = await fetch(`${API_BASE}/auth/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (res.ok) {
      window.electronAPI.storeToken(data.access_token); // via preload
      message.textContent = "✅ Auth success!";
    } else {
      message.textContent = "❌ " + (data.detail || "Failed");
    }
  } catch (err) {
    message.textContent = "Error: " + err.message;
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  auth("login");
});

document.getElementById("signupBtn").addEventListener("click", () => {
  auth("register");
});

