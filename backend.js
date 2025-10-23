// backend.js

// Store sessions dynamically
const aiSessions = {};
const MODELS_TO_PRELOAD = ["summarizer", "writer", "proofreader"];

// -------- General Init Function --------
async function initModel(modelName) {
  if (aiSessions[modelName]) return aiSessions[modelName];

  try {
    const api = chrome.ai[modelName];
    if (!api) {
      console.warn(`❌ API not found for ${modelName}`);
      return null;
    }

    let status = await api.availability();
    console.log(`${modelName} availability:`, status);

    if (status === "downloadable" || status === "downloading") {
      console.log(`📥 Waiting for ${modelName} to download...`);
      status = await api.availability();
    }

    if (status !== "available") {
      console.warn(`⚠️ ${modelName} not ready (status: ${status})`);
      return null;
    }

    const session = await api.create();
    aiSessions[modelName] = session;

    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon128.png",
      title: "Research Copilot",
      message: `✅ ${modelName} is ready`
    });

    console.log(`✅ ${modelName} initialized`);
    return session;
  } catch (err) {
    console.error(`❌ Failed to init ${modelName}:`, err);
    return null;
  }
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
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "translate",
    title: "Translate with AI",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "proofread",
    title: "Proofread with AI",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "multimodal",
    title: "Ask AI (Text/Image)",
    contexts: ["selection", "image"]
  });
});

// -------- Menu Handling --------
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let output = "";

  switch (info.menuItemId) {
    case "summarize":
      output = await summarize(info.selectionText);
      break;
    case "translate":
      output = await translate(info.selectionText);
      break;
    case "proofread":
      output = await proofread(info.selectionText);
      break;
    case "multimodal":
      output = await multimodal(info.selectionText, info.srcUrl);
      break;
  }

  if (output) {
    chrome.tabs.sendMessage(tab.id, { action: "AI_RESULT", data: output });
  }
});

// -------- AI Functions --------
async function summarize(text) {
  if (!text) return "No text selected.";
  const summarizer = await initModel("summarizer");
  if (!summarizer) return "Summarizer not available.";
  const result = await summarizer.summarize(text);
  return result?.summaries?.[0]?.text || "No summary available.";
}

async function translate(text, targetLang = "en") {
  if (!text) return "No text selected.";
  const writer = await initModel("writer");
  if (!writer) return "Writer not available.";
  const prompt = `Translate this into ${targetLang}: ${text}`;
  const result = await writer.write(prompt);
  return result?.output || "Translation failed.";
}

async function proofread(text) {
  if (!text) return "No text selected.";
  const proofreader = await initModel("proofreader");
  if (!proofreader) return "Proofreader not available.";
  const result = await proofreader.proofread(text);
  if (!result?.corrections?.length) return "No issues found.";
  return result.corrections.map(c => c.replacement).join(" ");
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
