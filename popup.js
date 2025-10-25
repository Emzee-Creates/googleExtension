document.addEventListener("DOMContentLoaded", () => {
  const modelStatuses = {
    summarizer: document.getElementById("summarizer-status"),
    writer: document.getElementById("writer-status"),
    proofreader: document.getElementById("proofreader-status"),
  };

  // Update model status indicators
  function updateModelStatus(modelName, status) {
    const element = modelStatuses[modelName];
    if (!element) return;

    let icon = "⌛"; // default loading
    switch (status) {
      case "available":
        icon = "✅";
        break;
      case "error":
        icon = "❌";
        break;
      case "downloading":
        icon = "📥";
        break;
    }
    element.textContent = `${modelName}: ${icon}`;
  }

  // Initialize buttons
  const buttons = {
    summarize: document.getElementById("summarize"),
    translate: document.getElementById("translate"),
    proofread: document.getElementById("proofread"),
    ask: document.getElementById("ask"),
  };

  // Add click handlers for buttons
  Object.entries(buttons).forEach(([action, button]) => {
    if (button) {
      button.addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: "TRIGGER_ACTION",
              data: { type: action },
            });
          }
        });
      });
    }
  });

  // Listen for status updates from background script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "MODEL_STATUS") {
      updateModelStatus(message.model, message.status);
    }
  });

  // Request initial model statuses
  chrome.runtime.sendMessage({ action: "GET_MODEL_STATUSES" });
});
