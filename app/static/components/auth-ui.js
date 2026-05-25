const AUTH_ME_URL = "/api/auth/me";

let authStatePromise = null;

function displayName(user) {
    if (!user) return "Account";
    if (user.username) return `@${user.username}`;
    if (user.email) return user.email.split("@")[0];
    return "Account";
}

async function loadAuthState(force = false) {
    if (!authStatePromise || force) {
        authStatePromise = fetch(AUTH_ME_URL, {
            credentials: "same-origin",
        })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error("Failed to load auth state");
                }
                return response.json();
            })
            .catch(() => ({ authenticated: false, user: null }));
    }

    return authStatePromise;
}

function updateNavAuth(state) {
    document.querySelectorAll(".navbar").forEach((navbar) => {
        const links = navbar.querySelector(".nav-links");
        if (!links) return;

        let authLink = links.querySelector("[data-auth-link]");
        if (!authLink) {
            authLink = document.createElement("a");
            authLink.className = "nav-auth";
            authLink.setAttribute("data-auth-link", "true");
            links.appendChild(authLink);
        }

        if (state.authenticated && state.user) {
            authLink.textContent = `Logout · ${displayName(state.user)}`;
            authLink.href = "#";
            authLink.dataset.mode = "logout";
            authLink.setAttribute("title", `Signed in as ${displayName(state.user)}`);
            authLink.setAttribute("aria-label", `Log out of ${displayName(state.user)}`);
            authLink.classList.add("is-authenticated");
        } else {
            authLink.textContent = "Sign in";
            authLink.href = "/auth";
            authLink.dataset.mode = "login";
            authLink.removeAttribute("title");
            authLink.removeAttribute("aria-label");
            authLink.classList.remove("is-authenticated");
        }

        if (authLink.dataset.bound !== "true") {
            authLink.addEventListener("click", async (event) => {
                if (authLink.dataset.mode !== "logout") return;
                event.preventDefault();
                try {
                    await fetch("/api/auth/logout", {
                        method: "POST",
                        credentials: "same-origin",
                    });
                } catch (error) {
                    // If logout fails, fall back to a hard reload.
                }

                authStatePromise = null;
                window.location.href = "/";
            });
            authLink.dataset.bound = "true";
        }
    });
}

async function initNavbarAuth() {
    const state = await loadAuthState();
    updateNavAuth(state);
}

function setResult(resultNode, message, kind = "") {
    if (!resultNode) return;
    resultNode.textContent = message;
    resultNode.classList.remove("success", "error");
    if (kind) resultNode.classList.add(kind);
}

async function postJson(url, payload) {
    const response = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(extractErrorMessage(data));
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

async function initAuthPage() {
    const authPage = document.querySelector("[data-auth-page]");
    if (!authPage) return;

    const forms = document.querySelector("[data-auth-forms]");
    const statusCard = document.querySelector("[data-auth-status]");
    const loginForm = document.querySelector("[data-login-form]");
    const signupForm = document.querySelector("[data-signup-form]");
    const loginResult = document.querySelector("[data-login-result]");
    const signupResult = document.querySelector("[data-signup-result]");
    const logoutButton = document.querySelector("[data-auth-logout]");

    const state = await loadAuthState();
    if (state.authenticated && state.user) {
        if (forms) forms.hidden = true;
        if (statusCard) {
            statusCard.hidden = false;
            statusCard.querySelector("[data-status-name]")?.replaceChildren(
                document.createTextNode(displayName(state.user)),
            );
            statusCard.querySelector("[data-status-email]")?.replaceChildren(
                document.createTextNode(state.user.email || ""),
            );
        }
    } else {
        if (forms) forms.hidden = false;
        if (statusCard) statusCard.hidden = true;
    }

    loginForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        setResult(loginResult, "Signing in...");
        const formData = new FormData(loginForm);
        const payload = {
            identifier: String(formData.get("identifier") || "").trim(),
            password: String(formData.get("password") || ""),
        };

        try {
            await postJson("/api/auth/login", payload);
            authStatePromise = null;
            window.location.href = "/";
        } catch (error) {
            setResult(loginResult, error.message, "error");
        }
    });

    signupForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        setResult(signupResult, "Creating account...");
        const formData = new FormData(signupForm);
        const payload = {
            email: String(formData.get("email") || "").trim(),
            username: String(formData.get("username") || "").trim() || null,
            password: String(formData.get("password") || ""),
        };

        try {
            await postJson("/api/auth/signup", payload);
            authStatePromise = null;
            window.location.href = "/";
        } catch (error) {
            setResult(signupResult, error.message, "error");
        }
    });

    logoutButton?.addEventListener("click", async () => {
        try {
            await fetch("/api/auth/logout", {
                method: "POST",
                credentials: "same-origin",
            });
        } catch (error) {
            // Continue with a redirect even if the network is flaky.
        }

        authStatePromise = null;
        window.location.href = "/";
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        initNavbarAuth();
        initAuthPage();
    });
} else {
    initNavbarAuth();
    initAuthPage();
}
