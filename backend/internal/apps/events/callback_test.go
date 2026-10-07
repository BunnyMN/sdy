package events

import (
	"net/http/httptest"
	"testing"
)

// The eID app returns the phone only to this site's own callback page.
func TestVoteCallbackIsThisSitesOwn(t *testing.T) {
	r := httptest.NewRequest("POST", "https://e-sdy.mn/api/v1/events/e/motions/m/vote", nil)
	r.Host = "e-sdy.mn"
	for raw, ok := range map[string]bool{
		"": true,
		"https://e-sdy.mn/auth/eid/callback?return=%2Fmodule%2Fevents%2Fe&retScheme=x": true,
		"https://evil.example/auth/eid/callback":                                       false,
		"https://e-sdy.mn/other":                                                       false,
		"http://e-sdy.mn/auth/eid/callback":                                            false,
		"https://user@e-sdy.mn/auth/eid/callback":                                      false,
	} {
		_, err := sameSiteCallback(r, raw)
		if (err == nil) != ok {
			t.Errorf("%q accepted=%v, want %v", raw, err == nil, ok)
		}
	}
}
