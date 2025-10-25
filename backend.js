// backend.js

// Store sessions dynamically
const aiSessions = {};
const MODELS_TO_PRELOAD = ["summarizer", "writer", "proofreader"];

// Add constants at the top
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const MODEL_TIMEOUT = 5000;
const MAX_TEXT_LENGTH = 5000;

// -------- General Init Function --------
async function initModel(modelName) {
  if (aiSessions[modelName]) return aiSessions[modelName];
  if (typeof chrome.ai === "undefined") {
    console.error(
      "❌ chrome.ai API is not available. Check permissions, Chrome version, and flags."
    );
    return null;
  }
  let retries = 0;
  while (retries < MAX_RETRIES) {
    try {
      const api = chrome.ai[modelName];
      if (!api) {
        console.warn(`❌ API not found for ${modelName}`);
        return null;
      }

      // Add timeout to availability check
      const statusPromise = api.availability();
      const status = await Promise.race([
        statusPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), MODEL_TIMEOUT)
        ),
      ]);

      if (status === "downloadable" || status === "downloading") {
        console.log(`📥 Waiting for ${modelName} to download...`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        retries++;
        continue;
      }

      if (status !== "available") {
        console.warn(`⚠️ ${modelName} not ready (status: ${status})`);
        return null;
      }

      // Add timeout to create session
      const sessionPromise = api.create();
      const session = await Promise.race([
        sessionPromise,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Session creation timeout")),
            MODEL_TIMEOUT
          )
        ),
      ]);

      aiSessions[modelName] = session;

      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon128.png",
        title: "Research Copilot",
        message: `✅ ${modelName} is ready`,
      });

      console.log(`✅ ${modelName} initialized`);
      return session;
    } catch (err) {
      console.error(`❌ Attempt ${retries + 1} failed for ${modelName}:`, err);
      if (retries === MAX_RETRIES - 1) {
        return null;
      }
      retries++;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
    }
  }
  return null;
}

// -------- Preload Models --------
async function preloadModels() {
  for (const model of MODELS_TO_PRELOAD) {
    console.log(`⚡ Preloading ${model}...`);
    await initModel(model);
  }
}

// Run preload once extension starts
chrome.runtime.onStartup.addListener(preloadModels);
chrome.runtime.onInstalled.addListener(preloadModels);

// -------- Context Menus --------
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "summarize",
    title: "Summarize with AI",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "translate",
    title: "Translate with AI",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "proofread",
    title: "Proofread with AI",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "multimodal",
    title: "Ask AI (Text/Image)",
    contexts: ["selection", "image"],
  });
});

// -------- Menu Handling --------
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) {
    console.error("No valid tab found");
    return;
  }

  let result;

  try {
    switch (info.menuItemId) {
      case "summarize":
        result = await summarize(info.selectionText);
        break;
      case "translate":
        result = await translate(info.selectionText);
        break;
      case "proofread":
        result = await proofread(info.selectionText);
        break;
      case "multimodal":
        result = await multimodal(info.selectionText, info.srcUrl);
        break;
    }

    chrome.tabs
      .sendMessage(tab.id, {
        action: "AI_RESULT",
        data: result,
      })
      .catch((err) => {
        console.error("Failed to send message to tab:", err);
      });
  } catch (err) {
    console.error("Operation failed:", err);
    chrome.tabs
      .sendMessage(tab.id, {
        action: "AI_RESULT",
        data: { success: false, error: "Operation failed unexpectedly." },
      })
      .catch(console.error);
  }
});

// Helper function for input validation
function validateInput(text) {
  if (!text) {
    return { isValid: false, error: "No text selected." };
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return {
      isValid: false,
      error: `Text too long (${text.length} chars). Maximum is ${MAX_TEXT_LENGTH} chars.`,
    };
  }
  return { isValid: true };
}

// -------- AI Functions --------
async function summarize(text) {
  const validation = validateInput(text);
  if (!validation.isValid) return { success: false, error: validation.error };

  try {
    const summarizer = await initModel("summarizer");
    if (!summarizer) {
      console.error("Summarizer model is not available.");
      return { success: false, error: "Summarizer not available." };
    }

    const result = await summarizer.summarize(text);
    if (!result?.summaries?.[0]?.text) {
      return { success: false, error: "No summary available." };
    }

    return {
      success: true,
      data: result.summaries[0].text,
    };
  } catch (err) {
    console.error("Summarization error:", err);
    return { success: false, error: "Failed to generate summary." };
  }
}

async function translate(text, targetLang = "en") {
  const validation = validateInput(text); // Use your helper!
  if (!validation.isValid) return { success: false, error: validation.error };

  try {
    const writer = await initModel("writer");
    if (!writer) {
      console.error("Writer model is not available.");
      return { success: false, error: "Writer model not available." };
    }

    const prompt = `Translate this into ${targetLang}: ${text}`;
    const result = await writer.write(prompt);

    if (!result?.output) {
      return { success: false, error: "Translation failed to generate." };
    }

    return { success: true, data: result.output };
  } catch (err) {
    console.error("Translation error:", err);
    return { success: false, error: "Failed to generate translation." };
  }
}
async function proofread(text) {
  if (!text) return "No text selected.";
  const proofreader = await initModel("proofreader");
  if (!proofreader) {
    console.error("Proofreader model is not available.");
    return "Proofreader not available.";
  }
  const result = await proofreader.proofread(text);
  if (!result?.corrections?.length) return "No issues found.";
  return result.corrections.map((c) => c.replacement).join(" ");
}

async function multimodal(text, imgUrl) {
  if (text) {
    const writer = await initModel("writer");
    if (!writer) return "Writer not available.";
    const prompt = `Explain the meaning of the following passage:\n\n${text}`;
    const result = await writer.write(prompt);
    return result?.output || "No response.";
  } else if (imgUrl) {
    return `🖼️ Image reasoning not supported locally. Image URL: ${imgUrl}`;
  }
  return "No valid input provided.";
}

// Add this near your other message listeners
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "GET_MODEL_STATUSES") {
    // Check and send status for each model
    MODELS_TO_PRELOAD.forEach(async (modelName) => {
      try {
        const api = chrome.ai[modelName];
        if (api) {
          const status = await api.availability();
          chrome.runtime.sendMessage({
            action: "MODEL_STATUS",
            model: modelName,
            status: status,
          });
        }
      } catch (err) {
        chrome.runtime.sendMessage({
          action: "MODEL_STATUS",
          model: modelName,
          status: "error",
        });
      }
    });
  }
});
