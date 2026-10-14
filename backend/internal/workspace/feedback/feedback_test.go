/*
 * Gerege Nexus
 * Copyright (c) 2026 Gerege Systems Development Team, Gerege Nomadica Foundation
 * Distributed under the Apache 2.0 License.
 */

package feedback

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Every refusal happens before the database is asked, so a nil pool is enough.
func TestSubmitRefusesWhatTheFormShouldHave(t *testing.T) {
	s := New(nil)
	for name, in := range map[string]Submission{
		"too short":    {Message: "  ok  "},
		"too long":     {Message: strings.Repeat("ё", maxMessage+1)},
		"bad category": {Category: "praise", Message: "Сайн систем байна"},
		"long name":    {Message: "Сайн систем байна", Name: strings.Repeat("а", maxName+1)},
		"long contact": {Message: "Сайн систем байна", Contact: strings.Repeat("9", maxContact+1)},
	} {
		var invalid *InvalidError
		if err := s.Submit(context.Background(), in); !errors.As(err, &invalid) {
			t.Errorf("%s: err = %v, want an InvalidError", name, err)
		}
	}
}

// A filled honeypot is answered like a success and never stored.
func TestHoneypotIsAnsweredButNotStored(t *testing.T) {
	s := New(nil) // a store attempt would panic on the nil pool
	req := httptest.NewRequest(http.MethodPost, "/api/v1/feedback",
		strings.NewReader(`{"message":"buy cheap things","website":"http://spam.example"}`))
	rec := httptest.NewRecorder()
	s.HandleSubmit(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201", rec.Code)
	}
}
