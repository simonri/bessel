import XCTest
@testable import Bessel

final class GoogleConnectTests: XCTestCase {
    func testReadsWhatTheWebPageSendsBack() {
        XCTAssertEqual(
            GoogleConnectResult(callback: URL(string: "com.simonri.bessel.dev://oauth/google-calendar?result=connected&email=me%40gmail.com")!),
            .connected(email: "me@gmail.com")
        )
        XCTAssertEqual(
            GoogleConnectResult(callback: URL(string: "com.simonri.bessel.dev://oauth/google-calendar?result=failed&message=Access+wasn%27t+granted.")!),
            .failed(message: "Access wasn't granted.")
        )
        XCTAssertNil(GoogleConnectResult(callback: URL(string: "com.simonri.bessel.dev://oauth/google-calendar?code=abc")!))
    }
}
