/* Encounter System
 * Installs the exported encounter tables and generator macro without
 * overwriting existing world documents, then adds a button to the
 * Measurement/Tools scene-control group.
 */

const MODULE_ID = "encounter-system";
const TABLE_DATA = "modules/encounter-system/data/tables.json";
const MACRO_DATA = "modules/encounter-system/data/macro.json";
const FOLDER_NAME = "Encounter System";
const LEGACY_FOLDER_NAME = "WFRP4e Encounter System";
const MACRO_NAME = "Encounter Generator";
const LEGACY_MACRO_NAME = "Empire Encounter Generator";
let lastLaunch = 0;

function cleanTableForWorld(source, folderId) {
  const table = foundry.utils.deepClone(source);
  delete table._id;
  delete table._stats;
  delete table.sort;
  table.folder = folderId;
  table.results = cleanResults(table.results);
  return table;
}

function cleanResults(results) {
  return (results ?? []).map(result => {
    const cleaned = foundry.utils.deepClone(result);
    delete cleaned._id;
    delete cleaned._stats;
    delete cleaned.documentUuid;
    return cleaned;
  });
}

async function installEncounterContent() {
  if (!game.user.isGM) return;

  const response = await fetch(TABLE_DATA);
  if (!response.ok) throw new Error(`Could not load ${TABLE_DATA}`);
  const tables = await response.json();

  let folder = game.folders.find(f => f.type === "RollTable" && f.name === FOLDER_NAME);
  const legacyFolder = game.folders.find(f => f.type === "RollTable" && f.name === LEGACY_FOLDER_NAME);
  if (!folder && legacyFolder) {
    folder = await legacyFolder.update({name: FOLDER_NAME});
  }
  if (!folder) {
    folder = await Folder.create({name: FOLDER_NAME, type: "RollTable"});
  }

  for (const source of tables) {
    const existing = game.tables.getName(source.name);
    if (existing) {
      // The first module build installed placeholder settlement tables from
      // the old export. Upgrade only those short placeholders; never replace
      // a table which already contains a full/custom result set.
      const isSettlement = source.name.startsWith("Stay ");
      const currentCount = existing.results?.size ?? existing.results?.length ?? 0;
      if (isSettlement && currentCount <= 4 && (source.results?.length ?? 0) > currentCount) {
        await existing.update({
          formula: source.formula,
          replacement: source.replacement,
          displayRoll: source.displayRoll,
          results: cleanResults(source.results)
        });
      }
      continue;
    }
    await RollTable.create(cleanTableForWorld(source, folder.id));
  }

  const macroResponse = await fetch(MACRO_DATA);
  if (!macroResponse.ok) throw new Error(`Could not load ${MACRO_DATA}`);
  const sourceMacro = await macroResponse.json();
  let macro = game.macros.getName(MACRO_NAME);
  const legacyMacro = game.macros.getName(LEGACY_MACRO_NAME);
  if (!macro && legacyMacro) {
    macro = await legacyMacro.update({name: MACRO_NAME});
  }
  if (!macro) {
    const data = foundry.utils.deepClone(sourceMacro);
    delete data._id;
    delete data._stats;
    delete data.folder;
    data.ownership = {default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER};
    macro = await Macro.create(data);
  }

  game.settings.set(MODULE_ID, "installed", true);
  return macro;
}

async function runGenerator() {
  const now = Date.now();
  if (now - lastLaunch < 750) return;
  lastLaunch = now;
  let macro = game.macros.getName(MACRO_NAME);
  if (!macro && game.user.isGM) macro = await installEncounterContent();
  if (!macro) {
    ui.notifications.warn("The GM must start the Encounter System once before players can use it.");
    return;
  }
  try {
    return await macro.execute();
  } catch (error) {
    console.error(`${MODULE_ID} generator error`, error);
    ui.notifications.error(`Encounter Generator failed: ${error.message}`);
  }
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "installed", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });
});

Hooks.once("ready", async () => {
  try {
    await installEncounterContent();
  } catch (error) {
    console.error(`${MODULE_ID} installation error`, error);
    ui.notifications.error(`Encounter System could not install: ${error.message}`);
  }
});

Hooks.on("getSceneControlButtons", controls => {
  const groups = Array.isArray(controls) ? controls : Object.values(controls);
  const group = groups.find(control =>
    ["measure", "measurement", "tools"].includes(control.name)
  ) ?? groups.find(control => control.name === "tokens");
  if (!group) return;
  group.tools ??= {};
  if (Array.isArray(group.tools)) {
    if (group.tools.some(tool => tool.name === "encounter-system-generator")) return;
    group.tools = Object.fromEntries(group.tools.map(tool => [tool.name, tool]));
  }
  if (group.tools["encounter-system-generator"]) return;

  group.tools["encounter-system-generator"] = {
    name: "encounter-system-generator",
    title: "Encounter Generator",
    icon: "fas fa-road",
    button: true,
    visible: true,
    order: Object.keys(group.tools).length,
    onChange: () => void runGenerator()
  };
});

// This DOM fallback supports Foundry v14 and installations where another
// module re-renders SceneControls after the control configuration hook fires.
Hooks.on("renderApplicationV2", (application, element) => {
  if (application.constructor?.name !== "SceneControls") return;
  const button = element.querySelector?.("[data-tool='encounter-system-generator']");
  if (!button || button.dataset.encounterSystemBound === "true") return;
  button.dataset.encounterSystemBound = "true";
  button.addEventListener("click", () => void runGenerator());
});

