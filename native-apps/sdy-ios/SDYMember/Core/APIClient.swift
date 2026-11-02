import Foundation

enum HTTPMethod: String { case get = "GET", post = "POST", put = "PUT", delete = "DELETE" }

struct EmptyResponse: Decodable {}

/// The only door to the backend.
///
/// The session is a bearer token: URLSession never stores or sends cookies,
/// every request carries `Authorization: Bearer …` and
/// `X-Session-Transport: bearer`. A token arrives in the JSON `session_token`
/// field of sign-in / switch-tenant answers, or — as a fallback, on any
/// answer — in a `session_token` Set-Cookie, which is also how the server
/// rotates or ends a session.
final class APIClient {
    static let shared = APIClient(tokens: AppConfig.fixturesEnabled ? TokenStore(inMemory: true) : .shared)

    let tokens: TokenStore
    let cache: OfflineCache
    private let session: URLSession
    let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    /// Branch the cached answers belong to. Set from /auth/me.
    var cacheScope: String = "none"

    /// Called on the main actor when the server says the session is gone.
    var onSessionEnded: (() -> Void)?
    /// Called on the main actor with whether the last request reached the server.
    var onReachability: ((Bool) -> Void)?

    #if DEBUG
    var fixtures: FixtureRouter? = AppConfig.fixturesEnabled ? FixtureRouter() : nil
    #endif

    init(tokens: TokenStore, cache: OfflineCache = .shared, session: URLSession? = nil) {
        self.tokens = tokens
        self.cache = cache
        if let session {
            self.session = session
        } else {
            let config = URLSessionConfiguration.ephemeral
            config.httpCookieAcceptPolicy = .never
            config.httpShouldSetCookies = false
            config.httpCookieStorage = nil
            config.urlCache = nil
            config.requestCachePolicy = .reloadIgnoringLocalCacheData
            config.timeoutIntervalForRequest = 30
            config.waitsForConnectivity = false
            self.session = URLSession(configuration: config)
        }
    }

    // MARK: - Public API

    /// GET with offline fallback: a failure to reach the server answers with
    /// the last good copy for this branch, if there is one.
    func get<T: Decodable>(_ path: String, as type: T.Type = T.self, cached: Bool = true) async throws -> T {
        do {
            let data = try await raw(.get, path)
            let value = try decode(T.self, from: data)
            if cached { cache.save(data, scope: scope(for: path), path: path) }
            return value
        } catch let error as APIError where error.isNetwork && cached {
            if let data = cache.load(scope: scope(for: path), path: path), let value = try? decode(T.self, from: data) {
                return value
            }
            throw error
        }
    }

    /// Who a cached answer belongs to: the person (identity, membership,
    /// notifications) or the branch currently acted in (events, dues).
    func scope(for path: String) -> String {
        if path.hasPrefix("/auth/") || path.hasPrefix("/profile") || path.hasPrefix("/me/") { return "user" }
        return "tenant-" + cacheScope
    }

    func send<T: Decodable>(_ method: HTTPMethod, _ path: String, body: [String: Any]? = nil,
                            timeout: TimeInterval = 30, as type: T.Type = T.self,
                            signsOutOn401: Bool = true) async throws -> T {
        let data = try await raw(method, path, body: body, timeout: timeout, signsOutOn401: signsOutOn401)
        return try decode(T.self, from: data)
    }

    @discardableResult
    func perform(_ method: HTTPMethod, _ path: String, body: [String: Any]? = nil) async throws -> EmptyResponse {
        _ = try await raw(method, path, body: body)
        return EmptyResponse()
    }

    func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        if T.self == EmptyResponse.self { return EmptyResponse() as! T }
        do {
            return try decoder.decode(T.self, from: data.isEmpty ? Data("{}".utf8) : data)
        } catch {
            #if DEBUG
            print("Decoding \(T.self) failed: \(error)")
            #endif
            throw APIError.decoding
        }
    }

    // MARK: - Transport

    func raw(_ method: HTTPMethod, _ path: String, body: [String: Any]? = nil,
             upload: (data: Data, type: String)? = nil,
             timeout: TimeInterval = 30, signsOutOn401: Bool = true) async throws -> Data {
        #if DEBUG
        if let fixtures {
            try? await Task.sleep(nanoseconds: 150_000_000)
            return try fixtures.respond(method, path, body: body)
        }
        #endif

        guard let url = URL(string: AppConfig.apiBase.absoluteString + path) else { throw APIError.decoding }
        var request = URLRequest(url: url, timeoutInterval: timeout)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("mn", forHTTPHeaderField: "Accept-Language")
        request.setValue("bearer", forHTTPHeaderField: "X-Session-Transport")
        request.setValue("SDYMember-iOS/\(AppConfig.appVersion)", forHTTPHeaderField: "X-Client")
        let hadToken = tokens.hasToken
        if let token = tokens.token, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let upload {
            request.setValue(upload.type, forHTTPHeaderField: "Content-Type")
            request.httpBody = upload.data
        } else if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        } else if method != .get {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = Data("{}".utf8)
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            let wrapped = APIError.wrap(error)
            if wrapped.isNetwork { notifyReachability(false) }
            throw wrapped
        }
        notifyReachability(true)
        guard let http = response as? HTTPURLResponse else { throw APIError.network }

        captureToken(from: http, data: data, hadToken: hadToken)

        if http.statusCode == 401 {
            if signsOutOn401 && hadToken {
                tokens.clear()
                notifySessionEnded()
            }
            let (message, code) = Self.errorBody(data)
            throw APIError(kind: .unauthorized, serverMessage: message, code: code)
        }
        guard (200..<300).contains(http.statusCode) else {
            let (message, code) = Self.errorBody(data)
            throw APIError(kind: .server(status: http.statusCode), serverMessage: message, code: code)
        }
        return data
    }

    /// Reads a new token from the answer: the JSON field wins over the cookie.
    func captureToken(from http: HTTPURLResponse, data: Data, hadToken: Bool) {
        let header = http.value(forHTTPHeaderField: "Set-Cookie")
        switch SessionCookieParser.parse(header) {
        case .set(let token): tokens.save(token)
        case .cleared:
            if hadToken {
                tokens.clear()
                // A cleared cookie on a successful answer ends the session;
                // a logout call expects it and handles sign-out itself.
                if (200..<300).contains(http.statusCode), !(http.url?.path.hasSuffix("/auth/logout") ?? false) {
                    notifySessionEnded()
                }
            }
        case nil: break
        }
        if let token = Self.jsonSessionToken(data) { tokens.save(token) }
    }

    static func jsonSessionToken(_ data: Data) -> String? {
        guard data.first == UInt8(ascii: "{"),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let token = object["session_token"] as? String,
              !token.isEmpty else { return nil }
        return token
    }

    static func errorBody(_ data: Data) -> (String, String?) {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return ("", nil) }
        let message = (object["error"] as? String) ?? (object["message"] as? String) ?? ""
        return (message, object["code"] as? String)
    }

    private func notifySessionEnded() {
        let handler = onSessionEnded
        DispatchQueue.main.async { handler?() }
    }

    private func notifyReachability(_ reachable: Bool) {
        let handler = onReachability
        DispatchQueue.main.async { handler?(reachable) }
    }
}
