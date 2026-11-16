import Foundation
import Speech
import XCTest

@testable import CatsSttMacos

// SPEC-146 FR-3: the `--list-languages` line the Desktop host parses.
final class LanguageListTests: XCTestCase {
  func testTagsUseHyphensAndDropLocaleKeywords() {
    XCTAssertEqual(dictationLanguageTag("zh_TW"), "zh-TW")
    XCTAssertEqual(dictationLanguageTag("en_US@rg=twzzzz"), "en-US")
    XCTAssertEqual(dictationLanguageTag("es_419"), "es-419")
    XCTAssertEqual(dictationLanguageTag("ja"), "ja")
  }

  func testLanguagesLineIsOneJsonObjectOfTheListingType() throws {
    let line = languagesLine(system: "en-US", languages: ["en-US", "zh-TW"])
    XCTAssertFalse(line.contains("\n"))
    let payload = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any]
    )
    XCTAssertEqual(payload["type"] as? String, "languages")
    XCTAssertEqual(payload["system"] as? String, "en-US")
    XCTAssertEqual(payload["languages"] as? [String], ["en-US", "zh-TW"])
  }

  func testAnUnknownSystemLanguageIsNull() throws {
    let line = languagesLine(system: nil, languages: [])
    let payload = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any]
    )
    XCTAssertTrue(payload["system"] is NSNull)
    XCTAssertEqual(payload["languages"] as? [String], [])
  }

  func testListingRequestsNoPermission() {
    // Listing must not prompt (FR-3), so it must leave the authorization state alone.
    let before = SFSpeechRecognizer.authorizationStatus()
    _ = listDictationLanguages()
    XCTAssertEqual(SFSpeechRecognizer.authorizationStatus(), before)
  }
}
