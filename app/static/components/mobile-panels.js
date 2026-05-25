const mobileQuery = window.matchMedia("(max-width: 900px)");

function syncMobilePanels() {
    document.querySelectorAll("[data-mobile-collapse]").forEach((panel) => {
        if (!(panel instanceof HTMLDetailsElement)) return;

        if (mobileQuery.matches) {
            panel.removeAttribute("open");
        } else {
            panel.setAttribute("open", "");
        }
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncMobilePanels);
} else {
    syncMobilePanels();
}

if (typeof mobileQuery.addEventListener === "function") {
    mobileQuery.addEventListener("change", syncMobilePanels);
} else if (typeof mobileQuery.addListener === "function") {
    mobileQuery.addListener(syncMobilePanels);
}
