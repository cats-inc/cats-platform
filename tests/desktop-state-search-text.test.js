/*! @license
 * MIT License
 *
 * Copyright (c) 2026 sammykenny2 and contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
// Preserved Cats Bot state-db-p1 Unicode regression cases for SPEC-144.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSearchQuery,
  indexText,
  MAX_QUERY_LENGTH,
  MAX_QUERY_WORDS
} from "../build/server/platform/persistence/state-db/searchText.js";
const tokens = (text) => indexText(text).split(" ").filter(Boolean);
const character = (codePoint) => String.fromCodePoint(codePoint);
test("a CJK run becomes its two-character tokens and then its last character", () => {
  assert.deepEqual(tokens("\u660E\u5929\u53BB\u516C\u5712\u6563\u6B65"), [
    "\u660E\u5929",
    "\u5929\u53BB",
    "\u53BB\u516C",
    "\u516C\u5712",
    "\u5712\u6563",
    "\u6563\u6B65",
    "\u6B65"
  ]);
  assert.deepEqual(tokens("\u5712"), ["\u5712"]);
  assert.deepEqual(tokens("plain English kettle"), ["plain", "english", "kettle"]);
  assert.deepEqual(tokens("\u7528iPhone\u62CD\u7167"), ["\u7528", "iphone", "\u62CD\u7167", "\u7167"]);
  assert.deepEqual(tokens("\u7248\u672Cv1.2.3\u66F4\u65B0"), ["\u7248\u672C", "\u672C", "v1", "2", "3", "\u66F4\u65B0", "\u65B0"]);
  assert.deepEqual(tokens("\u7259\u91AB\uFF0C\u516C\u5712\u3002"), ["\u7259\u91AB", "\u91AB", "\u516C\u5712", "\u5712"]);
  assert.deepEqual(tokens("\u300C\u4F60\u597D\u300D"), ["\u4F60\u597D", "\u597D"]);
  assert.deepEqual(tokens(""), []);
});
test("Japanese, Korean and Bopomofo runs are split the same way", () => {
  assert.deepEqual(tokens("\u30B3\u30FC\u30D2\u30FC\u3092\u98F2\u3080"), [
    "\u30B3\u30FC",
    "\u30FC\u30D2",
    "\u30D2\u30FC",
    "\u30FC\u3092",
    "\u3092\u98F2",
    "\u98F2\u3080",
    "\u3080"
  ]);
  assert.deepEqual(tokens("\uD55C\uAD6D\uC5B4 \uACF5\uBD80"), ["\uD55C\uAD6D", "\uAD6D\uC5B4", "\uC5B4", "\uACF5\uBD80", "\uBD80"]);
  assert.deepEqual(tokens("\u310F\u310F\u310F"), ["\u310F\u310F", "\u310F\u310F", "\u310F"]);
  assert.deepEqual(tokens("\u597D\u3109"), ["\u597D\u3109", "\u3109"]);
  assert.deepEqual(tokens("\u314B\u314B\u314B\u3160\u3160"), ["\u314B\u314B", "\u314B\u314B", "\u314B\u3160", "\u3160\u3160", "\u3160"]);
  assert.equal(buildSearchQuery("\u314B\u314B\u314B"), '"\u314B\u314B \u314B\u314B"');
  assert.equal(buildSearchQuery("\u3160\u3160"), '"\u3160\u3160"');
  assert.deepEqual(tokens("\uC544\uB2C8 \u3134\u3134\u3160"), ["\uC544\uB2C8", "\uB2C8", "\u3134\u3134", "\u3134\u3160", "\u3160"]);
  let halfWidth = 0;
  for (let code = 65441; code <= 65500; code += 1) {
    const letter = String.fromCharCode(code);
    if (letter.normalize("NFKC") === letter) continue;
    halfWidth += 1;
    const fullWidth = Array.from(
      { length: 12686 - 12593 + 1 },
      (_, index) => String.fromCharCode(12593 + index)
    ).find((candidate) => candidate.normalize("NFKD") === letter.normalize("NFKD"));
    assert.deepEqual(tokens(letter), [fullWidth], code.toString(16));
  }
  assert.equal(halfWidth, 51);
});
test("a character outside the Basic Multilingual Plane counts as one character", () => {
  const rare = character(131072);
  assert.deepEqual(tokens(`${rare}\u5B57\u5178`), [`${rare}\u5B57`, "\u5B57\u5178", "\u5178"]);
  assert.deepEqual(tokens(rare), [rare]);
  assert.equal(buildSearchQuery(rare), `"${rare}"*`);
  assert.equal(buildSearchQuery(`${rare}\u5B57`), `"${rare}\u5B57"`);
});
test("what is not a letter, a number or a mark separates words, whatever Unicode it came with", () => {
  assert.deepEqual(tokens(`OK${character(128578)}`), ["ok"]);
  assert.deepEqual(tokens(`\u9019\u500Bbug${character(129300)}\u600E\u9EBC\u4FEE`), [
    "\u9019\u500B",
    "\u500B",
    "bug",
    "\u600E\u9EBC",
    "\u9EBC\u4FEE",
    "\u4FEE"
  ]);
  assert.deepEqual(tokens(`100${character(129395)}`), ["100"]);
  assert.deepEqual(tokens(`${character(128578)} !? ...`), []);
  assert.deepEqual(tokens("don't stop"), ["don", "t", "stop"]);
  assert.deepEqual(tokens("iPhone\u2122"), ["iphone", "tm"]);
  assert.deepEqual(tokens("\u21210912345678"), ["tel", "0912345678"]);
  assert.deepEqual(tokens("\u21161 \u24B6plan Bot\u2120"), ["no", "1", "a", "plan", "bot", "sm"]);
  assert.deepEqual(tokens("5\u338F 50\u33A1"), ["5", "kg", "50", "m2"]);
  assert.deepEqual(tokens("\u32FF8\u5E74"), ["\u4EE4\u548C", "\u548C", "8", "\u5E74"]);
  assert.deepEqual(tokens("\u2460apple \u2461banana"), ["1", "apple", "2", "banana"]);
  assert.deepEqual(tokens("E=mc\xB2"), ["e", "mc2"]);
  assert.deepEqual(tokens("CO\u2082 and H\u2082O"), ["co2", "and", "h2o"]);
  assert.deepEqual(tokens("m\xB2"), tokens("\u33A1"));
  assert.deepEqual(tokens("Final Fantasy\u2166"), ["final", "fantasy", "vii"]);
  assert.deepEqual(tokens("\xBD cup"), ["1", "2", "cup"]);
  assert.deepEqual(tokens("\u4E8C\u3007\u4E8C\u516D\u5E74"), ["\u4E8C\u3007", "\u3007\u4E8C", "\u4E8C\u516D", "\u516D\u5E74", "\u5E74"]);
  assert.deepEqual(tokens("\u4ECA\u5929\u597D\u958B\u5FC3 (\uFFE3\u25BD\uFFE3)"), ["\u4ECA\u5929", "\u5929\u597D", "\u597D\u958B", "\u958B\u5FC3", "\u5FC3"]);
  assert.deepEqual(tokens("kettle \xB4 teapot"), ["kettle", "teapot"]);
});
test("compatibility forms, decomposed forms and characters never shown do not hide a word", () => {
  assert.deepEqual(tokens("\uFF12\uFF10\uFF12\uFF16\u5E74"), ["2026", "\u5E74"]);
  assert.deepEqual(tokens("\u8A02\u55AE\u7DE8\u865F\uFF21\uFF22\uFF11\uFF12\uFF13"), ["\u8A02\u55AE", "\u55AE\u7DE8", "\u7DE8\u865F", "\u865F", "ab123"]);
  assert.deepEqual(tokens("\uFF7A\uFF70\uFF8B\uFF70"), tokens("\u30B3\u30FC\u30D2\u30FC"));
  const decomposed = `\u304B${character(12441)}\u3063\u3053\u3046`;
  assert.notEqual(decomposed, "\u304C\u3063\u3053\u3046");
  assert.deepEqual(tokens(decomposed), tokens("\u304C\u3063\u3053\u3046"));
  assert.deepEqual(tokens(`\u3058\u3083\u3042${character(12441)}`), ["\u3058\u3083", "\u3083\u3042", "\u3042"]);
  assert.equal(buildSearchQuery(`\u3042${character(12441)}`), '"\u3042"*');
  assert.deepEqual(tokens(`${character(769)}kettle`), ["kettle"]);
  for (const hidden of [8203, 173, 8288]) {
    assert.deepEqual(tokens(`ket${character(hidden)}tle`), ["kettle"]);
    assert.equal(buildSearchQuery(`ket${character(hidden)}tle`), '"kettle"');
  }
  assert.deepEqual(tokens(`first line${character(65279)}second line`), [
    "first",
    "line",
    "second",
    "line"
  ]);
  assert.equal(buildSearchQuery(`line${character(65279)}second`), '"line" AND "second"');
  assert.deepEqual(tokens(`\u845B${character(917760)}\u98FE`), ["\u845B\u98FE", "\u98FE"]);
});
test("each word typed becomes one phrase of the tokens it would be indexed as", () => {
  assert.equal(buildSearchQuery("\u516C\u5712"), '"\u516C\u5712"');
  assert.equal(buildSearchQuery("\u53BB\u516C\u5712"), '"\u53BB\u516C \u516C\u5712"');
  assert.equal(buildSearchQuery("\u7259\u91AB \u516C\u5712"), '"\u7259\u91AB" AND "\u516C\u5712"');
  assert.equal(buildSearchQuery("KETTLE"), '"kettle"');
  assert.equal(buildSearchQuery("  Pro   MacBook "), '"pro" AND "macbook"');
  assert.equal(buildSearchQuery("\uFF12\uFF10\uFF12\uFF16"), '"2026"');
  assert.equal(buildSearchQuery("v1.2.3"), '"v1 2 3"');
  assert.equal(buildSearchQuery("don't"), '"don t"');
  assert.equal(buildSearchQuery("iPhone\u62CD\u7167"), '"iphone \u62CD\u7167"');
  assert.equal(buildSearchQuery("\u516C\u5712abc"), '"\u516C\u5712 \u5712 abc"');
  assert.equal(buildSearchQuery("a\u80A1b"), '"a \u80A1 b"');
});
test("CJK punctuation, and any punctuation next to a CJK run, parts two words as a space does", () => {
  assert.equal(buildSearchQuery("\u516C\u5712\u3001\u7259\u91AB"), '"\u516C\u5712" AND "\u7259\u91AB"');
  assert.equal(buildSearchQuery("\u516C\u5712\uFF0C\u7136\u5F8C\u7259\u91AB\u3002"), '"\u516C\u5712" AND "\u7136\u5F8C \u5F8C\u7259 \u7259\u91AB"');
  assert.equal(buildSearchQuery("kettle,\u8336\u58FA"), '"kettle" AND "\u8336\u58FA"');
  assert.equal(buildSearchQuery("\u8336\u58FA(kettle)"), '"\u8336\u58FA" AND "kettle"');
  assert.equal(buildSearchQuery("\u8336\u58FA\uFF08kettle\uFF09"), '"\u8336\u58FA" AND "kettle"');
  assert.equal(buildSearchQuery("\u958B\u5FC3 (\uFFE3\u25BD\uFFE3)"), '"\u958B\u5FC3"');
  assert.equal(buildSearchQuery("\u7B2C\u2460\u7AE0"), '"\u7B2C"* AND "1" AND "\u7AE0"*');
  assert.equal(buildSearchQuery("LINE\u3001Telegram"), '"line" AND "telegram"');
  assert.equal(buildSearchQuery("LINE\uFF0CTelegram\uFF1BSignal"), '"line" AND "telegram" AND "signal"');
  assert.equal(buildSearchQuery("LINE\u30FBTelegram"), '"line" AND "telegram"');
  assert.equal(buildSearchQuery(`LINE${character(65104)}Telegram`), '"line" AND "telegram"');
  assert.equal(buildSearchQuery("LINE,Telegram"), '"line telegram"');
  assert.equal(buildSearchQuery("\uFF21\uFF22\uFF11\uFF12\uFF13"), '"ab123"');
  assert.equal(buildSearchQuery("\u3005\u3007"), '"\u3005\u3007"');
});
test("the dot Chinese writes inside a name is not a break in it", () => {
  for (const dot of [183, 8231]) {
    assert.deepEqual(tokens(`\u99AC\u514B${character(dot)}\u5410\u6EAB\u7684\u66F8`), tokens("\u99AC\u514B\u5410\u6EAB\u7684\u66F8"));
    assert.equal(buildSearchQuery(`\u99AC\u514B${character(dot)}\u5410\u6EAB`), '"\u99AC\u514B \u514B\u5410 \u5410\u6EAB"');
  }
  assert.deepEqual(tokens("\u6771\u4EAC\u30FB\u5927\u962A"), ["\u6771\u4EAC", "\u4EAC", "\u5927\u962A", "\u962A"]);
  assert.deepEqual(tokens("\u30B3\u30FC\u30D2\u30FC\u30FB\u30B7\u30E7\u30C3\u30D7"), [
    "\u30B3\u30FC",
    "\u30FC\u30D2",
    "\u30D2\u30FC",
    "\u30FC",
    "\u30B7\u30E7",
    "\u30E7\u30C3",
    "\u30C3\u30D7",
    "\u30D7"
  ]);
  assert.equal(buildSearchQuery("\u6771\u4EAC\u30FB\u5927\u962A"), '"\u6771\u4EAC" AND "\u5927\u962A"');
  assert.deepEqual(tokens("a\xB7b"), ["a", "b"]);
  assert.deepEqual(tokens("\u516C\u5712\xB7"), ["\u516C\u5712", "\u5712"]);
});
test("a word that ends in one CJK character asks for any token starting with it", () => {
  assert.equal(buildSearchQuery("\u5712"), '"\u5712"*');
  assert.equal(buildSearchQuery("A\u80A1"), '"a \u80A1"*');
  assert.equal(buildSearchQuery("\u5712 \u6B65"), '"\u5712"* AND "\u6B65"*');
  assert.equal(buildSearchQuery("\u5712 kettle"), '"\u5712"* AND "kettle"');
});
test("nothing a person types is read as query syntax", () => {
  assert.equal(buildSearchQuery('say "hello" OR NOT'), '"say" AND "hello" AND "or" AND "not"');
  assert.equal(buildSearchQuery("terms:kettle*"), '"terms kettle"');
  assert.equal(buildSearchQuery("(a) -b ^c NEAR/2"), '"a" AND "b" AND "c" AND "near 2"');
  assert.equal(buildSearchQuery(`alpha${character(0)}omega`), '"alpha omega"');
  assert.equal(
    buildSearchQuery(`lone ${String.fromCharCode(55357)} surrogate`),
    '"lone" AND "surrogate"'
  );
});
test("the same word twice is asked for once, and a long search is refused", () => {
  assert.equal(buildSearchQuery("\u7684 \u7684 \u7684"), '"\u7684"*');
  assert.equal(buildSearchQuery("kettle Kettle KETTLE teapot"), '"kettle" AND "teapot"');
  assert.equal(buildSearchQuery(""), null);
  assert.equal(buildSearchQuery("   \n	"), null);
  assert.equal(buildSearchQuery("\uFF0C\u3002!? ... --"), null);
  assert.equal(buildSearchQuery(character(128578)), null);
  assert.equal(typeof buildSearchQuery("\u8C93".repeat(MAX_QUERY_LENGTH)), "string");
  assert.throws(() => buildSearchQuery("\u8C93".repeat(MAX_QUERY_LENGTH + 1)), RangeError);
  const different = (count) => Array.from({ length: count }, (_, index) => `w${index}`).join(" ");
  assert.equal(
    buildSearchQuery(different(MAX_QUERY_WORDS))?.split(" AND ").length,
    MAX_QUERY_WORDS
  );
  assert.throws(() => buildSearchQuery(different(MAX_QUERY_WORDS + 1)), RangeError);
  assert.equal(
    buildSearchQuery(Array.from({ length: MAX_QUERY_WORDS + 5 }, () => "again").join(" ")),
    '"again"'
  );
});
