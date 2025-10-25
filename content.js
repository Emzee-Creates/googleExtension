let resultPopup = null;

// Create and show result popup
function showResult(result) {
  // Remove existing popup if any
  if (resultPopup) {
    resultPopup.remove();
  }

  // Create new popup
  resultPopup = document.createElement("div");
  resultPopup.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    max-width: 400px;
    padding: 15px;
    background: white;
    border: 1px solid #ccc;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    z-index: 10000;
  `;

  // Add content based on result
  if (result.success === false) {
    resultPopup.innerHTML = `
      <div style="color: #dc3545;">❌ Error: ${result.error}</div>
      <button style="margin-top: 10px;">Close</button>
    `;
  } else {
    resultPopup.innerHTML = `
      <div style="color: #28a745;">✅ Result:</div>
      <div style="margin: 10px 0;">${result.data || result}</div>
      <button style="margin-top: 10px;">Close</button>
    `;
  }

  // Add close button handler
  const closeButton = resultPopup.querySelector("button");
  closeButton.onclick = () => resultPopup.remove();

  // Add to page
  document.body.appendChild(resultPopup);

  // Auto-hide after 10 seconds
  setTimeout(() => {
    if (resultPopup) {
      resultPopup.remove();
    }
  }, 10000);
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "AI_RESULT") {
    showResult(message.data);
  }
});
