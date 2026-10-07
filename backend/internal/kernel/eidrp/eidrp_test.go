package eidrp

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// What the person block means, asked of the decoder rather than of eID.
//
// The three names are the part worth pinning: firstName is the citizen's own
// name and lastName is the patronymic, and a decoder that swapped them would
// produce something that reads correctly in English and is visibly wrong to
// anybody Mongolian.

func serve(t *testing.T, path string, answer any) Client {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != path {
			t.Errorf("asked for %s, expected %s", r.URL.Path, path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer rp_sk_test" {
			t.Errorf("authorization header is %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(answer)
	}))
	t.Cleanup(server.Close)
	return NewClient(server.URL, "rp-uuid", "Gerege Nexus", "rp_sk_test", "")
}

func TestACompletedSessionCarriesTheWholePersonBlock(t *testing.T) {
	client := serve(t, "/session/s-1", map[string]any{
		"state":  "COMPLETE",
		"result": map[string]any{"endResult": "OK", "documentNumber": "DOC-1"},
		"cert":   map[string]any{"certificateLevel": "ADVANCED"},
		"person": map[string]any{
			"firstName": "Эрдэнэбат", "lastName": "Цэнддорж", "familyName": "Харчин",
			"firstNameEn": "ERDENEBAT", "lastNameEn": "TSENDDORJ",
			"civilId": "111949212017", "regNo": "МА74101813",
			"birthDate": "1974-10-18", "gender": "M", "geID": 10000263,
		},
	})

	result, err := client.Session(context.Background(), "s-1", 25000)
	if err != nil {
		t.Fatalf("session: %v", err)
	}
	if result.State != StateComplete || result.Identity == nil {
		t.Fatalf("state is %q with identity %v", result.State, result.Identity)
	}
	id := result.Identity
	switch {
	case id.FirstName != "Эрдэнэбат":
		t.Errorf("FirstName is %q — the citizen's own name is firstName", id.FirstName)
	case id.LastName != "Цэнддорж":
		t.Errorf("LastName is %q — the patronymic is lastName", id.LastName)
	case id.FamilyName != "Харчин":
		t.Errorf("FamilyName is %q — the clan name is familyName", id.FamilyName)
	case id.FirstNameEn != "ERDENEBAT" || id.LastNameEn != "TSENDDORJ":
		t.Errorf("the Latin names are %q / %q", id.FirstNameEn, id.LastNameEn)
	case id.BirthDate != "1974-10-18":
		t.Errorf("BirthDate is %q — a date, with no clock", id.BirthDate)
	case id.Gender != "M":
		t.Errorf("Gender is %q", id.Gender)
	case id.GeID != 10000263:
		t.Errorf("GeID is %d", id.GeID)
	case id.CivilID != "111949212017" || id.NationalID != "МА74101813":
		t.Errorf("the identifiers are %q / %q", id.CivilID, id.NationalID)
	case id.DocumentNumber != "DOC-1" || id.KYCLevel != "ADVANCED":
		t.Errorf("document %q, level %q", id.DocumentNumber, id.KYCLevel)
	}
}

// A deployment pointed at an eID that has not been upgraded yet still knows
// the citizen's name. Losing every name on the day one side moves would be a
// worse failure than the naming confusion this replaced.
func TestTheOlderPersonBlockStillYieldsAName(t *testing.T) {
	client := serve(t, "/session/s-2", map[string]any{
		"state":  "COMPLETE",
		"result": map[string]any{"endResult": "OK"},
		"person": map[string]any{
			"givenName": "Эрдэнэбат", "surname": "Цэнддорж",
			"civilId": "111949212017", "regNo": "МА74101813",
		},
	})
	result, err := client.Session(context.Background(), "s-2", 25000)
	if err != nil {
		t.Fatalf("session: %v", err)
	}
	if result.Identity.FirstName != "Эрдэнэбат" || result.Identity.LastName != "Цэнддорж" {
		t.Fatalf("the older block was not read: %+v", result.Identity)
	}
	// And nothing is invented for the fields it does not carry.
	if result.Identity.GeID != 0 || result.Identity.BirthDate != "" {
		t.Errorf("fields the older block does not carry were filled: %+v", result.Identity)
	}
}

// COMPLETE says the session ended. Whether the citizen approved is endResult's
// to say, and reading only the state would sign in somebody who refused.
func TestTheTerminalResultDecidesTheState(t *testing.T) {
	for endResult, want := range map[string]string{
		"OK":                     StateComplete,
		"TIMEOUT":                StateExpired,
		"USER_REFUSED":           StateRefused,
		"USER_REFUSED_VC_CHOICE": StateRefused,
		"WRONG_VC":               StateRefused,
		"DOCUMENT_UNUSABLE":      StateRefused,
	} {
		client := serve(t, "/session/s-3", map[string]any{
			"state":  "COMPLETE",
			"result": map[string]any{"endResult": endResult},
			"person": map[string]any{"firstName": "Иргэн", "regNo": "АА00112233"},
		})
		result, err := client.Session(context.Background(), "s-3", 1000)
		if err != nil {
			t.Fatalf("%s: %v", endResult, err)
		}
		if result.State != want {
			t.Errorf("endResult %s became %s, want %s", endResult, result.State, want)
		}
	}
}

// A citizen who represents nobody is an answer, not a failure.
func TestRepresentationsTreatsNotFoundAsNone(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(server.Close)
	client := NewClient(server.URL, "rp-uuid", "", "rp_sk_test", "")

	reps, err := client.Representations(context.Background(), "PNOMN-111949212017")
	if err != nil {
		t.Fatalf("representations: %v", err)
	}
	if len(reps) != 0 {
		t.Fatalf("expected none, got %d", len(reps))
	}
}

// The initiate body, which is the part that fails quietly.
//
// Authentication's challenge is `signatureProtocolParameters.rpChallenge`.
// Sending signing's `digest` instead leaves the server with an empty
// challenge, and what the citizen then sees is their approval failing inside
// the eID app with a message about processing — nowhere near the mistake.
func TestTheInitiateBodyCarriesTheAuthenticationChallenge(t *testing.T) {
	var body map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&body)
		if r.URL.Path != "/authentication/notification/etsi/PNOMN-111949212017" {
			t.Errorf("initiate went to %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"sessionID": "s-9",
			"vc":        map[string]any{"type": "alphaNumeric4", "value": "0489"},
		})
	}))
	t.Cleanup(server.Close)
	client := NewClient(server.URL, "rp-uuid", "Gerege Nexus", "rp_sk_test", "")

	started, err := client.Initiate(context.Background(), "111949212017", "Нэвтрэх", "https://e-sdy.mn/auth/eid/callback")
	if err != nil {
		t.Fatalf("initiate: %v", err)
	}
	if started.SessionID != "s-9" || started.VerificationCode != "0489" {
		t.Fatalf("the answer was not read: %+v", started)
	}
	params, _ := body["signatureProtocolParameters"].(map[string]any)
	if challenge, _ := params["rpChallenge"].(string); challenge == "" {
		t.Errorf("rpChallenge is empty; the citizen's approval would fail inside the app: %v", body)
	}
	if _, wrong := params["digest"]; wrong {
		t.Error("the signing challenge was sent to an authentication endpoint")
	}
	if _, old := body["rpChallenge"]; old {
		t.Error("the challenge was sent at the top level, the pre-v3 shape")
	}
	if body["signatureProtocol"] != "ACSP_V2" || body["certificateLevel"] != "ADVANCED" {
		t.Errorf("protocol %v, level %v", body["signatureProtocol"], body["certificateLevel"])
	}
	if body["initialCallbackUrl"] != "https://e-sdy.mn/auth/eid/callback" {
		t.Errorf("callback was not passed to eID: %v", body["initialCallbackUrl"])
	}
	// The text the eID app shows, as base64 of the interactions' JSON.
	encoded, _ := body["interactions"].(string)
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		t.Fatalf("interactions are not base64: %v", body["interactions"])
	}
	var interactions []map[string]any
	if err := json.Unmarshal(decoded, &interactions); err != nil || len(interactions) != 1 {
		t.Fatalf("interactions: %s", decoded)
	}
	if interactions[0]["type"] != "displayTextAndPIN" || interactions[0]["displayText60"] != "Нэвтрэх" {
		t.Errorf("the approval screen would show %v", interactions[0])
	}
}

// A device-link initiate returns what the v3 link is built from, and the
// secret that signs it stays in the server-side session.
func TestQRInitiateKeepsTheDeviceLinkMaterial(t *testing.T) {
	var body map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&body)
		if r.URL.Path != "/authentication/device-link/anonymous" {
			t.Errorf("initiate went to %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"sessionID":      "s-qr",
			"sessionToken":   "wGIrqveE6AuGDATZKmR1mtAZ",
			"sessionSecret":  "B98ODiVCebRedSwdTk51zFSaGYyHtY1H2A0ocAi3/Ps=",
			"deviceLinkBase": "https://ca.eidmongolia.mn/dl",
			"vc":             "48213",
		})
	}))
	t.Cleanup(server.Close)
	client := NewClient(server.URL, "rp-uuid", "SDY Mongolia", "rp_sk_test", "")

	started, err := client.QRInitiate(context.Background(), "Нэвтрэх", "", "")
	if err != nil {
		t.Fatalf("initiate: %v", err)
	}
	dl := started.DeviceLink
	if started.SessionID != "s-qr" || started.VerificationCode != "48213" || dl == nil {
		t.Fatalf("the answer was not read: %+v", started)
	}
	params, _ := body["signatureProtocolParameters"].(map[string]any)
	if dl.RPChallenge != params["rpChallenge"] || dl.Interactions != body["interactions"] || dl.RPName != "SDY Mongolia" {
		t.Errorf("the link would be signed over values other than those sent: %+v vs %v", dl, body)
	}
	link, err := dl.QRLink(dl.ReceivedAt)
	if err != nil || !strings.HasPrefix(link, "https://ca.eidmongolia.mn/dl?deviceLinkType=QR&elapsedSeconds=0&") || strings.Contains(link, dl.SessionSecret) {
		t.Errorf("QR link %q, %v", link, err)
	}
}

// An answer without device-link material cannot become a link the app opens.
func TestQRInitiateWithoutLinkMaterialFails(t *testing.T) {
	client := serve(t, "/authentication/device-link/anonymous", map[string]any{"sessionID": "s-old", "vc": "7270"})
	if _, err := client.QRInitiate(context.Background(), "", "", ""); err == nil {
		t.Fatal("a session with no sessionToken/sessionSecret was accepted")
	}
}

// Every address the API used to live at now answers 404. A deployment whose
// environment still names one is pointed at the current host instead.
func TestResolveBaseMovesRetiredAddresses(t *testing.T) {
	for in, want := range map[string]string{
		"":                               DefaultBase,
		"https://eidmongolia.mn/v3":      DefaultBase,
		"https://eidmongolia.mn/v3/":     DefaultBase,
		"https://ca.eidmongolia.mn":      DefaultBase,
		"https://ca.eidmongolia.mn/v3":   DefaultBase,
		"https://rp.eidmongolia.mn/v3":   DefaultBase,
		"https://rp.eidmongolia.mn/":     "https://rp.eidmongolia.mn",
		"http://127.0.0.1:9999":          "http://127.0.0.1:9999",
		"https://staging.example.mn/rp/": "https://staging.example.mn/rp",
	} {
		if got := ResolveBase(in); got != want {
			t.Errorf("ResolveBase(%q) = %q, want %q", in, got, want)
		}
	}
}
