/* Encounter System generator macro.
 *
 * A Road or River is the route being travelled.  An optional background
 * terrain adds a 20% terrain-table draw whenever that route's encounter
 * check succeeds.  Selecting a terrain directly remains pure terrain travel
 * and uses the six-check wilderness schedule.
 */

(async () => {
  const DISTANCE_TABLE = "Distance Encountered";
  const AWARENESS_TABLE = "Awareness";
  const EXTRA_ENCOUNTER_CHANCE = 5;
  const BACKGROUND_TERRAIN_CHANCE = 20;
  const WEATHER_CONTINUATION_CHANCE = 75;

  const ROUTES = ["Road", "River", "Wilderness"];
  const ROUTE_ENVIRONMENTS = ["Road", "River"];
  const WILDERNESS_ENVIRONMENTS = [
    "Forest", "Marsh", "Hills", "Mountains", "Jungle"
  ];
  const ALL_ENVIRONMENTS = [
    ...ROUTE_ENVIRONMENTS,
    ...WILDERNESS_ENVIRONMENTS
  ];

  const ROUTE_PERIODS = ["Morning", "Afternoon", "Night"];
  const WILDERNESS_PERIODS = [
    "Morning",
    "Late Morning",
    "Late Afternoon",
    "Evening Watch",
    "Night Watch",
    "Deepest Night"
  ];

  const ENCOUNTER_CHANCES = {
    Road: {
      Morning: 23,
      Afternoon: 23,
      Night: 30
    },
    River: {
      Morning: 30,
      Afternoon: 30,
      Night: 40
    },
    Forest: {
      Morning: 25,
      "Late Morning": 25,
      "Late Afternoon": 25,
      "Evening Watch": 25,
      "Night Watch": 30,
      "Deepest Night": 30
    },
    Marsh: {
      Morning: 25,
      "Late Morning": 25,
      "Late Afternoon": 25,
      "Evening Watch": 25,
      "Night Watch": 49,
      "Deepest Night": 49
    },
    Hills: {
      Morning: 20,
      "Late Morning": 20,
      "Late Afternoon": 20,
      "Evening Watch": 20,
      "Night Watch": 25,
      "Deepest Night": 25
    },
    Mountains: {
      Morning: 25,
      "Late Morning": 25,
      "Late Afternoon": 25,
      "Evening Watch": 25,
      "Night Watch": 30,
      "Deepest Night": 30
    },
    Jungle: {
      Morning: 30,
      "Late Morning": 30,
      "Late Afternoon": 30,
      "Evening Watch": 30,
      "Night Watch": 40,
      "Deepest Night": 40
    }
  };

  const SETTLEMENT_TABLES = {
    Small: "Stay Small (Coaching inn/Farm)",
    Medium: "Stay medium (Small Medium Settlement)",
    Large: "Stay Large (Town/Small city)"
  };

  const DISTANCE_STEPS = [
    "Close Distance",
    "Medium Distance",
    "Maximum Distance"
  ];

  const escapeHtml = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const stripHtml = value => String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();

  const normalise = value => stripHtml(value)
    .toLowerCase()
    .replace(/[—–-]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  function getTable(name) {
    const exact = game.tables.getName(name);
    if (exact) return exact;

    const wanted = normalise(name);
    return game.tables.find(table => normalise(table.name) === wanted);
  }

  async function tableResultText(result) {
    if (typeof result === "string" || typeof result === "number") {
      return String(result);
    }

    const directText = [
      result?.description,
      result?._source?.description,
      result?.data?.description,
      result?.document?.description,
      result?.text,
      result?._source?.text,
      result?.document?.text,
      result?.data?.text,
      result?.result,
      result?._source?.result,
      result?.document?.result,
      result?.data?.result,
      result?.name
    ].find(value => value !== null && value !== undefined && stripHtml(value)) ?? "";

    if (directText && stripHtml(directText)) return directText;

    if (typeof result?.getHTML === "function") {
      const html = await result.getHTML();
      if (html && stripHtml(html)) return html;
    }

    return "";
  }

  function firstDrawResult(draw) {
    const results = draw?.results;
    if (!results) return draw ?? null;
    if (Array.isArray(results)) return results[0] ?? null;
    if (typeof results.first === "function") return results.first();
    if (typeof results.values === "function") {
      return results.values().next().value ?? null;
    }
    return results[0] ?? results;
  }

  async function drawTableResult(name) {
    const table = getTable(name);
    if (!table) throw new Error(`RollTable not found: ${name}`);

    for (let attempt = 0; attempt < 20; attempt++) {
      const draw = await table.draw({displayChat: false});
      const result = firstDrawResult(draw) ?? draw;
      const text = await tableResultText(result);
      if (!text) throw new Error(`RollTable has no usable result: ${name}`);
      if (normalise(text) !== "roll again") return text;
    }

    throw new Error(`Too many Roll Again results in: ${name}`);
  }

  async function drawWeatherResult(environment, season) {
    const specificName = `Weather Table - ${environment} - ${season}`;
    return getTable(specificName)
      ? drawTableResult(specificName)
      : drawTableResult(`Weather Table - ${season}`);
  }

  async function d100() {
    const roll = await new Roll("1d100").evaluate({async: true});
    return roll.total;
  }

  function weatherEffects(weatherText) {
    const weather = normalise(weatherText);
    let distanceShift = 0;
    let awarenessModifier = 0;
    const effects = [];

    if (weather.includes("downpour")) {
      distanceShift = -1;
      awarenessModifier = 20;
      effects.push("Distance one step closer");
      effects.push("Awareness Difficulty +20");
    } else if (
      weather.includes("rain") ||
      weather.includes("snow") ||
      weather.includes("sleet") ||
      weather.includes("hail") ||
      weather.includes("fog") ||
      weather.includes("mist")
    ) {
      distanceShift = -1;
      awarenessModifier = 10;
      effects.push("Distance one step closer");
      effects.push("Awareness Difficulty +10");
    }

    return {distanceShift, awarenessModifier, effects};
  }

  function parseEncounter(text) {
    const plain = stripHtml(text);
    const match = plain.match(/\(([^()]*)\)\s*$/);
    if (!match) return null;

    const parts = match[1].split(",").map(part => part.trim());
    if (parts.length !== 3) return null;

    const [size, motivation, visibility] = parts;
    if (!["Small", "Medium", "Large"].includes(size)) return null;
    if (!["Friendly", "Indifferent", "Hostile"].includes(motivation)) return null;
    if (!["Stealthy", "Normal", "Obvious"].includes(visibility)) return null;

    return {
      name: plain.slice(0, match.index).trim(),
      size,
      motivation,
      visibility
    };
  }

  function findDistanceIndex(text) {
    const wanted = normalise(text);
    return DISTANCE_STEPS.findIndex(step => normalise(step) === wanted);
  }

  async function drawAwareness(modifier) {
    const raw = await d100();
    const adjusted = Math.max(1, Math.min(100, raw + modifier));
    const table = getTable(AWARENESS_TABLE);

    if (table) {
      const fixedRoll = await new Roll(String(adjusted)).evaluate({async: true});
      const draw = await table.draw({roll: fixedRoll, displayChat: false});
      const text = await tableResultText(firstDrawResult(draw) ?? draw);
      if (text) return stripHtml(text);
    }

    if (adjusted <= 20) return "Encounter Surprised";
    if (adjusted <= 40) return "Encounter Unaware";
    if (adjusted <= 60) return "Both Aware";
    if (adjusted <= 80) return "Party Unaware";
    return "Party Surprised";
  }

  function shiftDistance(baseDistance, encounter, weather) {
    let index = findDistanceIndex(baseDistance);
    if (index < 0) index = 1;
    if (encounter.size === "Small" || encounter.visibility === "Stealthy") index--;
    if (encounter.size === "Large" || encounter.visibility === "Obvious") index++;
    index += weather.distanceShift;
    index = Math.max(0, Math.min(DISTANCE_STEPS.length - 1, index));
    return DISTANCE_STEPS[index];
  }

  function isRoute(environment) {
    return ROUTE_ENVIRONMENTS.includes(environment);
  }

  function periodList(environment) {
    return isRoute(environment) ? ROUTE_PERIODS : WILDERNESS_PERIODS;
  }

  function tablePeriod(period) {
    return ["Night", "Night Watch", "Deepest Night"].includes(period)
      ? "Night"
      : "Day";
  }

  function isNightPeriod(period) {
    return tablePeriod(period) === "Night";
  }

  async function selectEncounterEnvironment(environment, backgroundTerrain) {
    if (!isRoute(environment) || !backgroundTerrain || backgroundTerrain === "None") {
      return environment;
    }

    const backgroundTable = `${backgroundTerrain} Day`;
    const backgroundNightTable = `${backgroundTerrain} Night`;
    if (!getTable(backgroundTable) || !getTable(backgroundNightTable)) {
      ui.notifications.warn(`Background terrain tables missing for ${backgroundTerrain}; using ${environment}.`);
      return environment;
    }

    return await d100() <= BACKGROUND_TERRAIN_CHANCE
      ? backgroundTerrain
      : environment;
  }

  async function resolveEncounter(environment, backgroundTerrain, period, weather, heading) {
    const encounterEnvironment = await selectEncounterEnvironment(environment, backgroundTerrain);
    const encounterTable = `${encounterEnvironment} ${tablePeriod(period)}`;
    const encounterText = await drawTableResult(encounterTable);
    const encounter = parseEncounter(encounterText);
    const sourceNote = encounterEnvironment !== environment
      ? ` <em>(${escapeHtml(encounterEnvironment)} background)</em>`
      : "";
    const encounterHeading = `<b>${escapeHtml(heading)}${sourceNote}</b>`;

    if (!encounter) {
      return [encounterHeading, encounterText].join("<br>");
    }

    const baseDistance = await drawTableResult(DISTANCE_TABLE);
    const distance = shiftDistance(baseDistance, encounter, weather);
    let awarenessModifier = weather.awarenessModifier;
    if (encounter.size === "Small") awarenessModifier += 10;
    if (encounter.size === "Large") awarenessModifier -= 10;
    if (encounter.visibility === "Stealthy") awarenessModifier += 20;
    if (encounter.visibility === "Obvious") awarenessModifier -= 20;

    const awareness = await drawAwareness(awarenessModifier);
    const reactionAwareness = new Set(["both aware", "party unaware", "party surprised"]);
    let reaction = "No reaction roll — party acts first";
    if (reactionAwareness.has(normalise(awareness))) {
      reaction = stripHtml(await drawTableResult(`${encounter.motivation} Reaction`));
    }

    return [
      encounterHeading,
      `<b>Encounter:</b> ${escapeHtml(encounter.name)}`,
      `<b>Distance:</b> ${escapeHtml(distance)}`,
      `<b>Awareness:</b> ${escapeHtml(awareness)}`,
      `<b>Reaction:</b> ${escapeHtml(reaction)}`
    ].join("<br>");
  }

  async function encounterCheck(environment, backgroundTerrain, period, weather) {
    const chance = ENCOUNTER_CHANCES[environment]?.[period] ?? 30;
    const mainRoll = await d100();
    if (mainRoll > chance) return `<b>${period}</b><br>No Encounter`;

    const results = [
      await resolveEncounter(environment, backgroundTerrain, period, weather, `${period} — Encounter`)
    ];

    // The additional roll is made only after the period's first encounter succeeds.
    if (await d100() <= EXTRA_ENCOUNTER_CHANCE) {
      results.push(
        await resolveEncounter(environment, backgroundTerrain, period, weather, `${period} — Additional Encounter`)
      );
    }

    return results.join("<br><br>");
  }

  async function settlementEvent(period, size) {
    const tableName = SETTLEMENT_TABLES[size];
    const event = await drawTableResult(tableName);
    return [`<b>${period} — ${escapeHtml(tableName)}</b>`, event].join("<br>");
  }

  function fieldValue(html, selector) {
    const element = html?.querySelector?.(selector) ?? html?.find?.(selector)?.[0];
    return element?.value ?? "";
  }

  function fieldChecked(html, selector) {
    const element = html?.querySelector?.(selector) ?? html?.find?.(selector)?.[0];
    return Boolean(element?.checked);
  }

  function askForOptions() {
    const routeOptions = ROUTES
      .map(value => `<option value="${value}">${value}</option>`)
      .join("");
    const backgroundOptions = ["None", ...WILDERNESS_ENVIRONMENTS]
      .map(value => `<option value="${value}"${value === "None" ? " data-pure-route-option" : ""}>${value === "None" ? "Pure route / road" : value}</option>`)
      .join("");
    const wildernessOptions = WILDERNESS_ENVIRONMENTS
      .map(value => `<option value="${value}">${value}</option>`)
      .join("");
    const seasons = ["Spring", "Summer", "Autumn", "Winter"];
    const seasonOptions = seasons
      .map(value => `<option value="${value}">${value}</option>`)
      .join("");
    const visibilityControl = game.user.isGM ? `
      <div class="form-group">
        <label>Show results to players</label>
        <input type="checkbox" name="showToPlayers" checked>
      </div>` : "";

    const content = `<form>
      <div class="form-group">
        <label>Route</label>
        <select name="route">${routeOptions}</select>
      </div>
      <div class="form-group" data-route-terrain-group>
        <label>Terrain the route passes through</label>
        <select name="routeTerrain">${backgroundOptions}</select>
        <p class="notes">A successful Road/River encounter uses this terrain table 20% of the time instead of the route table.</p>
      </div>
      <div class="form-group" data-wilderness-group style="display: none">
        <label>Wilderness environment</label>
        <select name="wildernessEnvironment">${wildernessOptions}</select>
        <p class="notes">Wilderness uses the pure environment table and six checks per day.</p>
      </div>
      <div class="form-group">
        <label>Season</label>
        <select name="season">${seasonOptions}</select>
      </div>
      <div class="form-group">
        <label>Journey days</label>
        <input type="number" name="days" min="1" max="30" value="3">
      </div>
      <hr>
      <div class="form-group">
        <label>Final night</label>
        <select name="finalNight">
          <option value="camp">Wilderness camp — use the normal night roll</option>
          <option value="settlement">Stay at a settlement — use a settlement table</option>
        </select>
      </div>
      <div class="form-group">
        <label>Settlement size</label>
        <select name="settlementSize">
          <option value="Small">Small — coaching inn / farm</option>
          <option value="Medium">Medium — small or medium settlement</option>
          <option value="Large">Large — town / small city</option>
        </select>
      </div>
      ${visibilityControl}
    </form>`;

    return new Promise(resolve => {
      new Dialog({
        title: "Generate Leg of Journey",
        content,
        buttons: {
          generate: {
            label: "Generate",
            callback: html => resolve({
              route: fieldValue(html, '[name="route"]') || "Road",
              routeTerrain: fieldValue(html, '[name="routeTerrain"]') || "None",
              wildernessEnvironment: fieldValue(html, '[name="wildernessEnvironment"]') || "Forest",
              season: fieldValue(html, '[name="season"]'),
              days: Math.max(1, Math.min(30, Number(fieldValue(html, '[name="days"]')) || 1)),
              finalNight: fieldValue(html, '[name="finalNight"]') || "camp",
              settlementSize: fieldValue(html, '[name="settlementSize"]') || "Small",
              showToPlayers: game.user.isGM ? fieldChecked(html, '[name="showToPlayers"]') : true
            })
          },
          cancel: {label: "Cancel", callback: () => resolve(null)}
        },
        default: "generate",
        close: () => resolve(null),
        render: (...args) => {
          const html = args.find(value =>
            value?.querySelector || value?.[0]?.querySelector
          );
          const root = html?.querySelector ? html : html?.[0];
          const route = root?.querySelector?.('[name="route"]');
          const routeTerrain = root?.querySelector?.('[name="routeTerrain"]');
          const pureRouteOption = root?.querySelector?.('[data-pure-route-option]');
          const routeTerrainGroup = root?.querySelector?.('[data-route-terrain-group]');
          const wildernessGroup = root?.querySelector?.('[data-wilderness-group]');
          if (!route || !routeTerrain || !pureRouteOption || !routeTerrainGroup || !wildernessGroup) return;
          const update = () => {
            const isWilderness = route.value === "Wilderness";
            pureRouteOption.textContent = `Pure route / ${route.value.toLowerCase()}`;
            routeTerrainGroup.style.display = isWilderness ? "none" : "";
            wildernessGroup.style.display = isWilderness ? "" : "none";
          };
          route.addEventListener("change", update);
          update();
        }
      }).render(true);
    });
  }

  async function generateJourney(options) {
    const {
      route,
      routeTerrain,
      wildernessEnvironment,
      season,
      days,
      finalNight,
      settlementSize
    } = options;
    const wilderness = route === "Wilderness";
    const environment = wilderness ? wildernessEnvironment : route;
    const backgroundTerrain = wilderness ? "None" : routeTerrain;
    const routeTravel = isRoute(environment);
    const periods = periodList(environment);
    const finalPeriod = periods.at(-1);
    const sixCheckSettlementPeriod = periods.length === 6 ? "Night Watch" : finalPeriod;
    const schedule = routeTravel ? "Standard — 3 checks" : "Wilderness — 6 checks";
    const routeLine = routeTravel
      ? `<b>Route:</b> ${escapeHtml(environment)}<br>`
      : `<b>Wilderness:</b> ${escapeHtml(environment)}<br>`;
    const backgroundLine = routeTravel && backgroundTerrain !== "None"
      ? `<b>Route passes through:</b> ${escapeHtml(backgroundTerrain)}<br>`
      : "";

    const lines = [
      "<h2>LEG OF JOURNEY</h2>",
      `<p>${routeLine}${backgroundLine}<b>Season:</b> ${escapeHtml(season)}<br><b>Days:</b> ${days}<br><b>Schedule:</b> ${schedule}</p>`
    ];

    const weatherEnvironment = routeTravel && backgroundTerrain !== "None"
      ? backgroundTerrain
      : environment;

    for (let day = 1; day <= days; day++) {
      let previousWeatherText = null;
      lines.push(`<h3>DAY ${day}</h3>`);

      for (const period of periods) {
        if (day === days && finalNight === "settlement" && periods.length === 6 && period === "Deepest Night") {
          continue;
        }
        const weatherText = previousWeatherText && await d100() <= WEATHER_CONTINUATION_CHANCE
          ? previousWeatherText
          : await drawWeatherResult(weatherEnvironment, season);
        previousWeatherText = weatherText;
        const weather = weatherEffects(weatherText);
        const isFinalSettlement = day === days && finalNight === "settlement" && period === sixCheckSettlementPeriod;
        const result = isFinalSettlement
          ? await settlementEvent(period, settlementSize)
          : await encounterCheck(environment, backgroundTerrain, period, weather);
        const weatherEffectsLine = weather.effects.length
          ? `<br><b>Weather Effects:</b> ${weather.effects.join(", ")}`
          : "";
        const resultParts = result.split("<br>");
        const periodHeading = resultParts.shift() ?? result;
        const periodDetails = resultParts.join("<br>");
        lines.push(`<p>${periodHeading}<br><b>Weather:</b> ${escapeHtml(weatherText)}${weatherEffectsLine}${periodDetails ? `<br>${periodDetails}` : ""}</p>`);
      }
    }

    return lines.join("\n");
  }

  async function postJourney(content, showToPlayers) {
    if (!game.user.isGM || showToPlayers) {
      await ChatMessage.create({speaker: ChatMessage.getSpeaker(), content});
      return;
    }

    const revealId = foundry.utils.randomID();
    const privateContent = `${content}<hr><p><em>This journey is currently visible only to the GM.</em></p><button type="button" class="reveal-road-journey" data-reveal-id="${revealId}">Reveal to Players</button>`;
    const hookId = Hooks.on("renderChatMessage", (message, html) => {
      const root = html?.querySelector ? html : html?.[0];
      const button = root?.querySelector?.(`[data-reveal-id="${revealId}"]`);
      if (!button) return;
      button.addEventListener("click", async () => {
        button.disabled = true;
        await ChatMessage.create({speaker: ChatMessage.getSpeaker(), content});
        await message.delete();
        Hooks.off("renderChatMessage", hookId);
      }, {once: true});
    });

    const gmIds = game.users.filter(user => user.isGM).map(user => user.id);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker(), content: privateContent, whisper: gmIds});
  }

  try {
    const options = await askForOptions();
    if (!options) return;
    await postJourney(await generateJourney(options), options.showToPlayers);
  } catch (error) {
    console.error("Encounter System macro error", error);
    ui.notifications.error(error.message || "The journey could not be generated.");
  }
})();
