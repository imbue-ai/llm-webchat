/**
 * conversation-search plugin
 *
 * Adds a search box to the sidebar via the "sidebar-before-list" slot.
 * Typing a query hits GET /api/search?q=... and displays matching
 * conversation snippets. Clicking a result navigates to that conversation
 * and scrolls to the matching response.
 */

window.addEventListener("load", function () {
  "use strict";

  var DEBOUNCE_DELAY_MS = 300;
  var MIN_QUERY_LENGTH = 2;

  // ── State ────────────────────────────────────────────────────

  var currentQuery = "";
  var results = [];
  var loading = false;
  var debounceTimer = null;

  // Claim the slot so mithril skips child reconciliation.
  $llm.claim("sidebar-before-list");

  // ── Styles ───────────────────────────────────────────────────

  var styleElement = document.createElement("style");
  styleElement.textContent = [
    ".search-container {",
    "  padding: 0 0 0.5rem;",
    "}",
    ".search-input {",
    "  width: 100%;",
    "  box-sizing: border-box;",
    "  padding: 0.4rem 0.6rem;",
    "  font-size: 0.8rem;",
    "  font-family: inherit;",
    "  border: 1px solid var(--color-border);",
    "  border-radius: 0.4rem;",
    "  background: var(--color-surface);",
    "  color: var(--color-text-primary);",
    "  outline: none;",
    "  transition: border-color 150ms;",
    "}",
    ".search-input:focus {",
    "  border-color: var(--color-accent);",
    "}",
    ".search-input::placeholder {",
    "  color: var(--color-text-secondary);",
    "}",
    ".search-results {",
    "  overflow-y: auto;",
    "  max-height: 60vh;",
    "}",
    ".search-result-item {",
    "  padding: 0.5rem 0.6rem;",
    "  border-radius: 0.4rem;",
    "  cursor: pointer;",
    "  transition: background-color 150ms;",
    "  border-bottom: 1px solid var(--color-border);",
    "}",
    ".search-result-item:last-child {",
    "  border-bottom: none;",
    "}",
    ".search-result-item:hover {",
    "  background: var(--color-surface-secondary);",
    "}",
    ".search-result-name {",
    "  font-size: 0.8rem;",
    "  font-weight: 600;",
    "  color: var(--color-text-primary);",
    "  white-space: nowrap;",
    "  overflow: hidden;",
    "  text-overflow: ellipsis;",
    "}",
    ".search-result-snippet {",
    "  font-size: 0.75rem;",
    "  color: var(--color-text-secondary);",
    "  margin-top: 0.2rem;",
    "  line-height: 1.4;",
    "  overflow: hidden;",
    "  display: -webkit-box;",
    "  -webkit-line-clamp: 2;",
    "  -webkit-box-orient: vertical;",
    "}",
    ".search-result-snippet mark {",
    "  background: transparent;",
    "  color: var(--color-accent);",
    "  font-weight: 600;",
    "}",
    ".search-result-field {",
    "  font-size: 0.65rem;",
    "  color: var(--color-text-secondary);",
    "  margin-top: 0.15rem;",
    "  text-transform: uppercase;",
    "  letter-spacing: 0.05em;",
    "}",
    ".search-status {",
    "  font-size: 0.75rem;",
    "  color: var(--color-text-secondary);",
    "  padding: 0.4rem 0.6rem;",
    "}",
  ].join("\n");
  document.head.appendChild(styleElement);

  // ── Helpers ──────────────────────────────────────────────────

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function highlightQuery(text, query) {
    if (!query) return escapeHtml(text);
    var escaped = escapeHtml(text);
    var regex = new RegExp(
      "(" + query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")",
      "gi"
    );
    return escaped.replace(regex, "<mark>$1</mark>");
  }

  // ── Rendering ────────────────────────────────────────────────

  function renderResults(resultsContainer) {
    if (!currentQuery || currentQuery.length < MIN_QUERY_LENGTH) {
      resultsContainer.style.display = "none";
      resultsContainer.innerHTML = "";
      return;
    }

    resultsContainer.style.display = "block";

    if (loading) {
      resultsContainer.innerHTML =
        '<div class="search-status">Searching\u2026</div>';
      return;
    }

    if (results.length === 0) {
      resultsContainer.innerHTML =
        '<div class="search-status">No results found.</div>';
      return;
    }

    var html = "";
    for (var i = 0; i < results.length; i++) {
      var result = results[i];
      html +=
        '<div class="search-result-item" data-conversation-id="' +
        escapeHtml(result.conversation_id) +
        '" data-response-id="' +
        escapeHtml(result.response_id) +
        '">' +
        '<div class="search-result-name">' +
        escapeHtml(result.conversation_name) +
        "</div>" +
        '<div class="search-result-snippet">' +
        highlightQuery(result.snippet, currentQuery) +
        "</div>" +
        '<div class="search-result-field">in ' +
        escapeHtml(result.field) +
        "</div>" +
        "</div>";
    }
    resultsContainer.innerHTML = html;
  }

  // ── Search API ───────────────────────────────────────────────

  function performSearch(query, resultsContainer) {
    loading = true;
    renderResults(resultsContainer);

    fetch("/api/search?q=" + encodeURIComponent(query) + "&limit=20")
      .then(function (response) {
        if (!response.ok) throw new Error("Search failed: " + response.status);
        return response.json();
      })
      .then(function (data) {
        if (currentQuery === query) {
          results = data.results;
          loading = false;
          renderResults(resultsContainer);
        }
      })
      .catch(function (error) {
        console.error("[conversation-search]", error);
        if (currentQuery === query) {
          results = [];
          loading = false;
          renderResults(resultsContainer);
        }
      });
  }

  // ── DOM setup (via "ready" hook, after mithril has rendered) ─

  $llm.on("ready", function () {
    var slot = document.querySelector('[data-slot="sidebar-before-list"]');
    if (!slot) {
      console.warn("[conversation-search] sidebar-before-list slot not found");
      return;
    }

    var searchContainer = document.createElement("div");
    searchContainer.className = "search-container";

    var searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "search-input";
    searchInput.placeholder = "Search conversations\u2026";
    searchContainer.appendChild(searchInput);

    var resultsContainer = document.createElement("div");
    resultsContainer.className = "search-results";
    resultsContainer.style.display = "none";

    slot.appendChild(searchContainer);
    slot.appendChild(resultsContainer);

    searchInput.addEventListener("input", function () {
      var query = searchInput.value.trim();
      currentQuery = query;

      if (debounceTimer) clearTimeout(debounceTimer);

      if (query.length < MIN_QUERY_LENGTH) {
        results = [];
        renderResults(resultsContainer);
        return;
      }

      debounceTimer = setTimeout(function () {
        performSearch(query, resultsContainer);
      }, DEBOUNCE_DELAY_MS);
    });

    searchInput.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        searchInput.value = "";
        currentQuery = "";
        results = [];
        renderResults(resultsContainer);
        searchInput.blur();
      }
    });

    resultsContainer.addEventListener("click", function (event) {
      var item = event.target.closest(".search-result-item");
      if (!item) return;

      var conversationId = item.getAttribute("data-conversation-id");
      var responseId = item.getAttribute("data-response-id");

      if (conversationId) {
        var path = "/conversations/" + conversationId;
        if (responseId) {
          path += "#" + responseId;
        }
        window.location.href = path;

        searchInput.value = "";
        currentQuery = "";
        results = [];
        renderResults(resultsContainer);
      }
    });
  });
});
