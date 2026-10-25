import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../public/src/js/i18n.js", import.meta.url), "utf8");

const locales = ["en", "de", "es", "fr", "ja", "ko", "pt", "ru", "zh-Hans", "zh-Hant"];
const uiFile = (locale) => new URL(`../src/data/i18n/ui/${locale}.json`, import.meta.url);
const readUi = (locale) => JSON.parse(readFileSync(uiFile(locale), "utf8"));

// The keys the minimal HUD added. Every locale must carry them, and the
// English file must say what the markup says before the dictionary loads.
const hudKeys = [
  "meter.pin",
  "settings.keybind.pin",
  "settings.hideWhenIdle",
  "settings.tips.hideWhenIdle",
  "settings.idleSeconds.label",
  "settings.tips.idleSeconds",
];

const resolveKey = (object, key) => key.split(".").reduce((node, part) => node?.[part], object);

test("every locale carries the keys the minimal HUD added", () => {
  for (const locale of locales) {
    const strings = readUi(locale);
    for (const key of hudKeys) {
      const value = resolveKey(strings, key);
      assert.equal(typeof value, "string", `${locale}.json is missing ${key}`);
      assert.notEqual(value.trim(), "", `${locale}.json has an empty ${key}`);
    }
  }
});

test("the other languages are not the English text", () => {
  // A locale that falls back to English carries the key, so the check above
  // passes: only a difference says the file is really translated.
  const english = readUi("en");
  for (const locale of locales) {
    if (locale === "en") continue;
    const strings = readUi(locale);
    for (const key of hudKeys) {
      const value = resolveKey(strings, key);
      assert.notEqual(value, resolveKey(english, key), `${locale}.json has the English text for ${key}`);
    }
  }
});

test("every locale carries the same keys", () => {
  // The invariant the ten-file sweep leans on: a key added to one file
  // alone would leave the others without it.
  const flatten = (object, prefix = "") =>
    Object.entries(object).flatMap(([key, value]) =>
      value && typeof value === "object"
        ? flatten(value, `${prefix}${key}.`)
        : [`${prefix}${key}`]
    );
  const english = flatten(readUi("en")).sort();
  for (const locale of locales) {
    assert.deepEqual(flatten(readUi(locale)).sort(), english, `${locale}.json does not carry the same keys`);
  }
});

test("the English dictionary matches the markup's fallback text", () => {
  const markup = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const english = readUi("en");
  for (const key of hudKeys) {
    const expected = resolveKey(english, key);
    // The element carrying the key, and the attribute its fallback lives in.
    const tag = new RegExp(`<[^>]*data-i18n(?:-([a-z-]+))?="${key.replace(/\./g, "\\.")}"[^>]*>`).exec(markup);
    assert.ok(tag, `index.html has no element for ${key}`);
    let fallback;
    if (tag[1]) {
      // The attribute's own name, not the data-i18n- prefixed one.
      fallback = new RegExp(`\\s${tag[1]}="([^"]*)"`).exec(tag[0])?.[1];
    } else {
      const rest = markup.slice(tag.index + tag[0].length);
      fallback = rest.slice(0, rest.indexOf("<")).trim();
    }
    assert.equal(fallback?.trim(), expected.trim(), `index.html's fallback for ${key} differs from en.json`);
  }
});

test("built UI resources support language switching and English dungeon fallback", async () => {
  const window = {};
  const document = {
    baseURI: "http://localhost/",
    documentElement: { setAttribute() {} },
    querySelectorAll: () => [],
  };
  class MissingResource {
    open() {}
    send() { this.onerror(); }
  }
  const fetch = async (url) => {
    try {
      const file = readFileSync(new URL(`../dist${new URL(url).pathname}`, import.meta.url));
      return { ok: true, arrayBuffer: async () => Uint8Array.from(file).buffer };
    } catch {
      return { ok: false, status: 404 };
    }
  };
  vm.runInNewContext(source, { window, document, fetch, URL, TextDecoder, Uint8Array, XMLHttpRequest: MissingResource });
  const ru = JSON.parse(readFileSync(new URL("../src/data/i18n/ui/ru.json", import.meta.url)));
  const en = JSON.parse(readFileSync(new URL("../src/data/i18n/ui/en.json", import.meta.url)));
  await window.i18n.setLanguage("ru", { persist: false });
  assert.equal(window.i18n.t("target.all"), ru.target.all);
  assert.match(window.i18n.getDungeonLabel(600001), /^Krao Cave/);
  await window.i18n.setLanguage("en", { persist: false });
  assert.equal(window.i18n.t("target.all"), en.target.all);
  assert.match(window.i18n.getDungeonLabel(600001), /^Krao Cave/);
});

function settingsI18n({ ready, fetchJson, elements = [] } = {}) {
  const requests = [];
  const attributes = {};
  const storage = new Map();
  const window = { A2_VIEW: 'settings', a2SettingsReady: ready, javaBridge: { getSetting: () => 'ru' } };
  const document = { baseURI: 'http://localhost/', documentElement: { setAttribute: (key, value) => { attributes[key] = value; } }, querySelectorAll: selector => selector === '[data-i18n]' ? elements : [] };
  vm.runInNewContext(source, {
    window, document, URL, TextDecoder,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    fetch: async (url) => {
      const path = new URL(url).pathname;
      requests.push(path);
      const data = fetchJson ? await fetchJson(path) : { settings: { title: path.includes('/ru.') ? 'Настройки' : 'Settings' } };
      return { ok: true, arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(data)).buffer };
    },
  });
  return { window, requests, attributes };
}

test('settings waits for backend preferences and loads only its UI dictionary once', async () => {
  let finish;
  const ready = new Promise(resolve => { finish = resolve; });
  const { window, requests, attributes } = settingsI18n({ ready });
  const init = window.i18n.init();
  await Promise.resolve();
  assert.equal(requests.length, 0);
  finish();
  await init;
  assert.deepEqual(requests, ['/i18n/ui/ru.json']);
  assert.equal(attributes.lang, 'ru');
  assert.equal(window.i18n.t('settings.title'), 'Настройки');
  await window.i18n.setLanguage('ru', { persist: false });
  assert.equal(requests.length, 1, 'same-language setup must not fetch the dictionaries twice');
  await window.i18n.setLanguage('en', { persist: false });
  assert.deepEqual(requests, ['/i18n/ui/ru.json', '/i18n/ui/en.json']);
  assert.equal(window.i18n.t('settings.title'), 'Settings');
});

test('a slow old language response cannot overwrite a newer selection', async () => {
  let finishRussian;
  const { window, attributes } = settingsI18n({ fetchJson: path => path.includes('/ru.')
    ? new Promise(resolve => { finishRussian = resolve; }) : { settings: { title: 'Settings' } } });
  const old = window.i18n.setLanguage('ru', { persist: false });
  await window.i18n.setLanguage('en', { persist: false });
  finishRussian({ settings: { title: 'Настройки' } });
  await old;
  assert.equal(attributes.lang, 'en');
  assert.equal(window.i18n.getLanguage(), 'en');
  assert.equal(window.i18n.t('settings.title'), 'Settings');
});

test('getLanguage reports the requested language while its dictionary loads', async () => {
  let finishEnglish;
  const { window, attributes } = settingsI18n({ fetchJson: path => path.includes('/en.')
    ? new Promise(resolve => { finishEnglish = resolve; }) : { settings: { title: 'Настройки' } } });
  await window.i18n.setLanguage('ru', { persist: false });
  const changes = [];
  window.i18n.onChange(lang => changes.push(lang));
  const pending = window.i18n.setLanguage('en', { persist: false });
  assert.equal(window.i18n.getLanguage(), 'en');
  assert.equal(attributes.lang, 'ru');
  assert.deepEqual(changes, []);
  finishEnglish({ settings: { title: 'Settings' } });
  await pending;
  assert.equal(attributes.lang, 'en');
  assert.equal(window.i18n.t('settings.title'), 'Settings');
  assert.deepEqual(changes, ['en']);
});

test('the latest request wins when switching back before a load finishes', async () => {
  let finishEnglish;
  const { window, requests, attributes } = settingsI18n({ fetchJson: path => path.includes('/en.')
    ? new Promise(resolve => { finishEnglish = resolve; }) : { settings: { title: 'Настройки' } } });
  await window.i18n.setLanguage('ru', { persist: false });
  const changes = [];
  window.i18n.onChange(lang => changes.push(lang));
  const english = window.i18n.setLanguage('en', { persist: false });
  const englishAgain = window.i18n.setLanguage('en', { persist: false });
  assert.equal(requests.filter(path => path.includes('/en.')).length, 1, 'a repeated pending request must share the load');
  await window.i18n.setLanguage('ru', { persist: false });
  assert.equal(window.i18n.getLanguage(), 'ru');
  finishEnglish({ settings: { title: 'Settings' } });
  await Promise.all([english, englishAgain]);
  assert.equal(window.i18n.getLanguage(), 'ru');
  assert.equal(attributes.lang, 'ru');
  assert.equal(window.i18n.t('settings.title'), 'Настройки');
  assert.deepEqual(changes, ['ru']);
});

test('setting the current language again translates newly rendered elements without reloading', async () => {
  const elements = [];
  const { window, requests } = settingsI18n({ elements });
  await window.i18n.setLanguage('ru', { persist: false });
  const changes = [];
  window.i18n.onChange(lang => changes.push(lang));
  const added = { dataset: { i18n: 'settings.title' }, textContent: 'Settings' };
  elements.push(added);
  await window.i18n.setLanguage('ru', { persist: false });
  assert.equal(added.textContent, 'Настройки');
  assert.equal(requests.length, 1);
  assert.deepEqual(changes, ['ru'], 'listeners still hear a repeated call');
});
