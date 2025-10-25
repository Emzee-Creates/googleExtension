// ==============================
// backend.js — Research Copilot
// Optimized & Production-ready
// ==============================

// -------- Constants --------
const MODELS_TO_PRELOAD = ["summarizer", "writer", "proofreader"];
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const MODEL_TIMEOUT = 5000;
const MAX_TEXT_LENGTH = 5000;
const DEBUG = true;

// -------- Utilities --------
const aiSessions = {};
const initLocks = {};

const MENU_IDS = {
  SUMMARIZE: "summarize",
  TRANSLATE: "translate",
  PROOFREAD: "proofread",
  MULTIMODAL: "multimodal",
};

function log(...args) {
  if (DEBUG) console.log(...args);
}

// -------- Core Init Function --------
async function initModel(modelName) {
  if (aiSessions[modelName]) return aiSessions[modelName];
  if (initLocks[modelName]) return initLocks[modelName];

  if (typeof chrome.ai?.[modelName] === "undefined") {
    console.warn(`❌ ${modelName} API not supported on this Chrome version.`);
    return null;
  }

  initLocks[modelName] = (async () => {
    let retries = 0;
    while (retries < MAX_RETRIES) {
      try {
        const api = chrome.ai[modelName];
        if (!api) {
          console.warn(`❌ API not found for ${modelName}`);
          return null;
        }

        // Timeout-wrapped availability check
        const status = await Promise.race([
          api.availability(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Availability timeout")),
              MODEL_TIMEOUT
            )
          ),
        ]);

        if (["downloadable", "downloading"].includes(status)) {
          log(`📥 Waiting for ${modelName} to download...`);
          await new Promise((r) => setTimeout(r, RETRY_DELAY));
          retries++;
          continue;
        }

        if (status !== "available") {
          console.warn(`⚠️ ${modelName} not ready (status: ${status})`);
          return null;
        }

        // Timeout-wrapped session creation
        const session = await Promise.race([
          api.create(),
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

        log(`✅ ${modelName} initialized`);
        return session;
      } catch (err) {
        console.error(
          `❌ Attempt ${retries + 1} failed for ${modelName}:`,
          err
        );
        if (retries === MAX_RETRIES - 1) return null;
        retries++;
        await new Promise((r) => setTimeout(r, RETRY_DELAY));
      }
    }
    return null;
  })();

  const session = await initLocks[modelName];
  delete initLocks[modelName];
  return session;
}

// -------- Preload Models --------
async function preloadModels() {
  log("⚡ Preloading AI models...");
  await Promise.all(MODELS_TO_PRELOAD.map(initModel));
  log("✅ All models preloaded");
}

chrome.runtime.onStartup.addListener(preloadModels);
chrome.runtime.onInstalled.addListener(preloadModels);

// -------- Context Menus --------
chrome.runtime.onInstalled.addListener(() => {
  const menus = [
    { id: MENU_IDS.SUMMARIZE, title: "Summarize with AI" },
    { id: MENU_IDS.TRANSLATE, title: "Translate with AI" },
    { id: MENU_IDS.PROOFREAD, title: "Proofread with AI" },
    {
      id: MENU_IDS.MULTIMODAL,
      title: "Ask AI (Text/Image)",
      contexts: ["selection", "image"],
    },
  ];

  menus.forEach(({ id, title, contexts = ["selection"] }) =>
    chrome.contextMenus.create({ id, title, contexts })
  );
});

// -------- Message Helper --------
async function safeSendMessage(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    if (!err.message.includes("Receiving end does not exist")) {
      console.error("sendMessage error:", err);
    }
  }
}

// -------- Menu Handling --------
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) {
    console.error("❌ No valid tab found");
    return;
  }

  let result;
  try {
    switch (info.menuItemId) {
      case MENU_IDS.SUMMARIZE:
        result = await summarize(info.selectionText);
        break;
      case MENU_IDS.TRANSLATE:
        result = await translate(info.selectionText);
        break;
      case MENU_IDS.PROOFREAD:
        result = await proofread(info.selectionText);
        break;
      case MENU_IDS.MULTIMODAL:
        result = await multimodal(info.selectionText, info.srcUrl);
        break;
      default:
        return;
    }

    await safeSendMessage(tab.id, { action: "AI_RESULT", data: result });
  } catch (err) {
    console.error("Operation failed:", err);
    await safeSendMessage(tab.id, {
      action: "AI_RESULT",
      data: { success: false, error: "Operation failed unexpectedly." },
    });
  }
});

// -------- Validation --------
function validateInput(text) {
  if (!text) return { isValid: false, error: "No text selected." };
  if (text.length > MAX_TEXT_LENGTH)
    return {
      isValid: false,
      error: `Text too long (${text.length} chars). Max is ${MAX_TEXT_LENGTH}.`,
    };
  return { isValid: true };
}

// -------- AI Feature Functions --------
async function summarize(text) {
  const v = validateInput(text);
  if (!v.isValid) return { success: false, error: v.error };

  try {
    const summarizer = await initModel("summarizer");
    if (!summarizer)
      return { success: false, error: "Summarizer not available." };

    const result = await summarizer.summarize(text);
    if (!result?.summaries?.[0]?.text)
      return { success: false, error: "No summary available." };

    return { success: true, data: result.summaries[0].text };
  } catch (err) {
    console.error("Summarization error:", err);
    return { success: false, error: "Failed to generate summary." };
  }
}

async function translate(text, targetLang = "en") {
  const v = validateInput(text);
  if (!v.isValid) return { success: false, error: v.error };

  try {
    const writer = await initModel("writer");
    if (!writer)
      return { success: false, error: "Writer model not available." };

    const prompt = `Translate this into ${targetLang}: ${text}`;
    const result = await writer.write(prompt);

    if (!result?.output)
      return { success: false, error: "Translation failed to generate." };

    return { success: true, data: result.output };
  } catch (err) {
    console.error("Translation error:", err);
    return { success: false, error: "Failed to generate translation." };
  }
}

async function proofread(text) {
  const v = validateInput(text);
  if (!v.isValid) return { success: false, error: v.error };

  try {
    const proofreader = await initModel("proofreader");
    if (!proofreader)
      return { success: false, error: "Proofreader not available." };

    const result = await proofreader.proofread(text);
    if (!result?.corrections?.length)
      return { success: true, data: "No issues found." };

    const formatted = result.corrections
      .map((c) => `${c.original} → ${c.replacement}`)
      .join("\n");

    return { success: true, data: formatted };
  } catch (err) {
    console.error("Proofreading error:", err);
    return { success: false, error: "Failed to proofread text." };
  }
}

async function multimodal(text, imgUrl) {
  if (text) {
    const writer = await initModel("writer");
    if (!writer) return { success: false, error: "Writer not available." };

    const prompt = `Explain the meaning of the following passage:\n\n${text}`;
    const result = await writer.write(prompt);
    return { success: true, data: result?.output || "No response." };
  }

  if (imgUrl) {
    return {
      success: false,
      error: `🖼️ Image reasoning not supported locally. Image URL: ${imgUrl}`,
    };
  }

  return { success: false, error: "No valid input provided." };
}

// -------- Model Status Broadcast --------
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "GET_MODEL_STATUSES") {
    MODELS_TO_PRELOAD.forEach(async (modelName) => {
      try {
        const api = chrome.ai[modelName];
        const status = api ? await api.availability() : "unsupported";
        chrome.runtime.sendMessage({
          action: "MODEL_STATUS",
          model: modelName,
          status,
        });
      } catch {
        chrome.runtime.sendMessage({
          action: "MODEL_STATUS",
          model: modelName,
          status: "error",
        });
      }
    });
  }
});
