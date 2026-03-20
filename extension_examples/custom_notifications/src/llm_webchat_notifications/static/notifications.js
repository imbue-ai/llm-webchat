window.addEventListener("load", function () {
  "use strict";

  var NOTIFICATION_DISMISS_DELAY_MS = 8000;

  var notifiedConversationIds = new Set();
  var notificationStyleElement = document.createElement("style");
  document.head.appendChild(notificationStyleElement);

  var animationStyleElement = document.createElement("style");
  animationStyleElement.textContent = [
    "@keyframes notification-badge-fade-in {",
    "  from { opacity: 0; transform: scale(0.5); }",
    "  to   { opacity: 1; transform: scale(1); }",
    "}",
  ].join("\n");
  document.head.appendChild(animationStyleElement);

  function getActiveConversationId() {
    var match = window.location.href.match(/\/conversations\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function updateNotificationStyles() {
    var rules = [];
    notifiedConversationIds.forEach(function (conversationId) {
      var escapedId = CSS.escape(conversationId);
      rules.push(
        '[data-slot="conversation-selector-item"][data-conversation-id="' +
          escapedId +
          '"] .conversation-selector-item-name::after {' +
          '  content: " \\25CF";' +
          "  color: var(--color-accent);" +
          "  font-size: 0.6rem;" +
          "  vertical-align: middle;" +
          "  margin-left: 0.35rem;" +
          "  animation: notification-badge-fade-in 200ms ease-out;" +
          "}"
      );
    });
    notificationStyleElement.textContent = rules.join("\n");
  }

  $llm.on("stream_event", function (data) {
    if (data.event.type === "response_complete") {
      var completedConversationId = data.event.content;
      if (completedConversationId && completedConversationId !== getActiveConversationId()) {
        notifiedConversationIds.add(completedConversationId);
        updateNotificationStyles();
        setTimeout(function () {
          notifiedConversationIds.delete(completedConversationId);
          updateNotificationStyles();
        }, NOTIFICATION_DISMISS_DELAY_MS);
      }
    }
    return data;
  });

  $llm.on("get_conversation", function (data) {
    if (notifiedConversationIds.has(data.conversationId)) {
      notifiedConversationIds.delete(data.conversationId);
      updateNotificationStyles();
    }
    return data;
  });
});
