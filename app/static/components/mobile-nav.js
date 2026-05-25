const mobileNavQuery = window.matchMedia("(max-width: 720px)");

function getNavBars() {
    return Array.from(document.querySelectorAll(".navbar"));
}

function setNavState(navbar, open) {
    const button = navbar.querySelector("[data-mobile-nav-toggle]");
    const links = navbar.querySelector(".nav-links");
    if (!button || !links) return;

    navbar.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", String(open));
    links.setAttribute("aria-hidden", String(!open));
}

function removeMobileButton(navbar) {
    const button = navbar.querySelector("[data-mobile-nav-toggle]");
    if (button) {
        button.remove();
    }
    navbar.classList.remove("is-open");
    const links = navbar.querySelector(".nav-links");
    if (links) {
        links.removeAttribute("aria-hidden");
    }
}

function enhanceNavBar(navbar) {
    if (!(navbar instanceof HTMLElement)) return;

    const links = navbar.querySelector(".nav-links");
    if (!links) return;

    if (!links.id) links.id = `nav-links-${Math.random().toString(36).slice(2, 8)}`;

    let button = navbar.querySelector("[data-mobile-nav-toggle]");
    if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "nav-toggle";
        button.setAttribute("data-mobile-nav-toggle", "true");
        button.setAttribute("aria-controls", links.id);
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-label", "Open navigation menu");
        button.innerHTML =
            '<span class="nav-toggle-icon" aria-hidden="true"><span></span></span><span class="nav-toggle-label">Menu</span>';
        navbar.appendChild(button);
    }

    button.addEventListener("click", () => {
        if (!mobileNavQuery.matches) return;
        const nextOpen = !navbar.classList.contains("is-open");
        setNavState(navbar, nextOpen);
    });

    links.addEventListener("click", (event) => {
        if (!mobileNavQuery.matches) return;
        const target = event.target;
        if (target instanceof HTMLElement && target.closest("a")) {
            setNavState(navbar, false);
        }
    });

    document.addEventListener("click", (event) => {
        if (!mobileNavQuery.matches) return;
        if (!navbar.classList.contains("is-open")) return;
        const target = event.target;
        if (target instanceof Node && navbar.contains(target)) return;
        setNavState(navbar, false);
    });

    setNavState(navbar, false);
}

function initMobileNav() {
    getNavBars().forEach((navbar) => {
        if (mobileNavQuery.matches) {
            enhanceNavBar(navbar);
        } else {
            removeMobileButton(navbar);
        }
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMobileNav);
} else {
    initMobileNav();
}

if (typeof mobileNavQuery.addEventListener === "function") {
    mobileNavQuery.addEventListener("change", initMobileNav);
} else if (typeof mobileNavQuery.addListener === "function") {
    mobileNavQuery.addListener(initMobileNav);
}
